/**
 * Tests for useFilesystemSync hook
 *
 * Tests the filesystem sync functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { notifySetAsideChanged } from '@data/db/setAsideEvents';
import { writeFolderCopy, type FolderSyncOutcome } from '@services/sync';
import { useFilesystemSync } from './useFilesystemSync';
import type { StoredCredentialsV2 } from '@data/encryption/keyWrapping';

// Mock file system support
vi.mock('@/utils/fileSystemSupport', () => ({
  isFileSystemAccessSupported: vi.fn(() => true),
}));

// What the folder copy may be replaced with is the service's decision
vi.mock('@services/sync', () => ({
  writeFolderCopy: vi.fn(),
}));

// Storage provider mock
const mockGetPermissionState = vi.fn().mockResolvedValue('granted');
const mockProviderCreated = vi.fn();
const mockSave = vi.fn().mockResolvedValue(undefined);

vi.mock('@data/storage/FileSystemStorageProvider', () => ({
  FileSystemStorageProvider: class MockFileSystemStorageProvider {
    getPermissionState = mockGetPermissionState;
    save = mockSave;
    constructor() {
      mockProviderCreated();
    }
  },
}));

const WRITTEN: FolderSyncOutcome = { status: 'written', folderLock: null };

// Mock db
const mockExportAllData = vi.fn().mockResolvedValue({
  labResults: [],
  testValues: [],
  userNotes: [],
  settings: null,
  preferences: null,
});

// The same db and key on every render, as the providers give them
const mockCountSetAside = vi.fn();
const mockDb = { exportAllData: mockExportAllData, countSetAside: mockCountSetAside };
const mockKey = {} as CryptoKey;

vi.mock('./useEncryptedDb', () => ({
  useEncryptedDb: () => ({ db: mockDb, isReady: true }),
}));

/** This browser's lock as the auth context gives it; a password change replaces it */
const LOCK_A = { version: 2, kekSalt: 'c2FsdEE=', iterations: 1000, wrapIv: 'aXZB', wrappedKey: 'a2V5QQ==' } as const;
const LOCK_B = { ...LOCK_A, kekSalt: 'c2FsdEI=', changedAt: '2026-11-06T09:00:00.000Z' };
const auth: {
  storedLock: StoredCredentialsV2 | null;
  adoptFolderLock: (lock: StoredCredentialsV2) => boolean;
} = { storedLock: LOCK_A, adoptFolderLock: () => false };

vi.mock('@contexts', () => ({
  useAuth: () => ({ encryptionKey: mockKey, ...auth }),
}));

const STORAGE_PROVIDER_KEY = 'hemoio_storage_provider';

describe('useFilesystemSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(writeFolderCopy).mockResolvedValue(WRITTEN);
    mockGetPermissionState.mockResolvedValue('granted');
    mockCountSetAside.mockResolvedValue({ total: 0, unsaved: 0 });
    auth.storedLock = LOCK_A;
    auth.adoptFolderLock = vi.fn(() => false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('hook interface', () => {
    it('should return syncNow function', () => {
      const { result } = renderHook(() => useFilesystemSync());

      expect(result.current.syncNow).toBeDefined();
      expect(typeof result.current.syncNow).toBe('function');
    });
  });

  describe('filesystem enabled check', () => {
    it('starts syncing within 30 seconds when folder storage is switched on', async () => {
      vi.useFakeTimers();
      try {
        localStorage.setItem(STORAGE_PROVIDER_KEY, 'local');
        renderHook(() => useFilesystemSync());
        await act(() => vi.advanceTimersByTimeAsync(0));
        expect(writeFolderCopy).not.toHaveBeenCalled();

        localStorage.setItem(STORAGE_PROVIDER_KEY, 'filesystem');
        await act(() => vi.advanceTimersByTimeAsync(30000));

        expect(writeFolderCopy).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should not sync when localStorage storage is selected', async () => {
      localStorage.setItem(STORAGE_PROVIDER_KEY, 'local');

      renderHook(() => useFilesystemSync());

      // Give it time to potentially sync
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockExportAllData).not.toHaveBeenCalled();
    });

    it('should not sync when no storage provider is set', async () => {
      // Don't set any storage provider

      renderHook(() => useFilesystemSync());

      // Give it time to potentially sync
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockExportAllData).not.toHaveBeenCalled();
    });
  });

  describe('held until allowed', () => {
    beforeEach(() => {
      localStorage.setItem(STORAGE_PROVIDER_KEY, 'filesystem');
    });

    it('writes nothing, at start or when asked, while not enabled', async () => {
      const { result } = renderHook(() => useFilesystemSync({ enabled: false }));

      await act(() => result.current.syncNow());

      expect(mockExportAllData).not.toHaveBeenCalled();
      expect(writeFolderCopy).not.toHaveBeenCalled();
    });

    it('syncs as soon as it is enabled', async () => {
      const { rerender } = renderHook(({ enabled }) => useFilesystemSync({ enabled }), {
        initialProps: { enabled: false },
      });
      expect(writeFolderCopy).not.toHaveBeenCalled();

      rerender({ enabled: true });

      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));
    });

    it('a sync already asked for does not write once it is no longer enabled', async () => {
      const { result, rerender } = renderHook(({ enabled }) => useFilesystemSync({ enabled }), {
        initialProps: { enabled: true },
      });
      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));
      const syncNow = result.current.syncNow;

      rerender({ enabled: false });
      await act(() => syncNow());

      expect(writeFolderCopy).toHaveBeenCalledTimes(1);
    });

    it('does not write when the hold begins while the data is exported', async () => {
      let exported!: (data: unknown) => void;
      const { rerender } = renderHook(({ enabled }) => useFilesystemSync({ enabled }), {
        initialProps: { enabled: true },
      });
      mockExportAllData.mockImplementationOnce(() => new Promise((resolve) => (exported = resolve)));
      await waitFor(() => expect(mockExportAllData).toHaveBeenCalled());

      rerender({ enabled: false });
      await act(async () => exported({ labResults: [], testValues: [], userNotes: [] }));

      expect(writeFolderCopy).not.toHaveBeenCalled();
    });

    it('does not write when the hold begins while the folder copy is read', async () => {
      let read!: () => void;
      vi.mocked(writeFolderCopy).mockImplementationOnce(async (store) => {
        // As the service does: read and decrypt the folder copy, then save
        await new Promise<void>((resolve) => (read = resolve));
        await store.save(new ArrayBuffer(1));
        return WRITTEN;
      });
      const { result, rerender } = renderHook(({ enabled }) => useFilesystemSync({ enabled }), {
        initialProps: { enabled: true },
      });
      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalled());

      rerender({ enabled: false });
      await act(async () => read());

      expect(mockSave).not.toHaveBeenCalled();
      // Held, not failed: nothing to tell the user
      expect(result.current.issue).toBeNull();
    });

    it('saves through to the folder while enabled', async () => {
      vi.mocked(writeFolderCopy).mockImplementationOnce(async (store) => {
        await store.save(new ArrayBuffer(1));
        return WRITTEN;
      });
      renderHook(() => useFilesystemSync());

      await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    });

    it('reports nothing about the folder copy while held', async () => {
      vi.mocked(writeFolderCopy).mockResolvedValueOnce({ status: 'protected', reason: 'empty', folderLock: null });
      const { result, rerender } = renderHook(({ enabled }) => useFilesystemSync({ enabled }), {
        initialProps: { enabled: true },
      });
      await waitFor(() => expect(result.current.issue).toBe('empty'));

      // The folder is looked at again (access granted, another folder): the old outcome is stale
      rerender({ enabled: false });
      expect(result.current.issue).toBeNull();

      // Nor does it come back once the hold ends, before the next sync has found anything
      vi.mocked(writeFolderCopy).mockImplementationOnce(() => new Promise(() => {}));
      rerender({ enabled: true });
      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(2));
      expect(result.current.issue).toBeNull();
    });
  });

  describe('protecting the folder copy', () => {
    beforeEach(() => {
      localStorage.setItem(STORAGE_PROVIDER_KEY, 'filesystem');
    });

    it('hands the exported data to the folder copy on its first sync', async () => {
      const { result } = renderHook(() => useFilesystemSync());

      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));
      expect(vi.mocked(writeFolderCopy).mock.calls[0][1]).toEqual(
        await mockExportAllData.mock.results[0].value
      );
      expect(result.current.issue).toBeNull();
    });

    it('passes the unsaved set-aside count', async () => {
      mockCountSetAside.mockResolvedValue({ total: 3, unsaved: 2 });

      renderHook(() => useFilesystemSync());

      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));
      expect(vi.mocked(writeFolderCopy).mock.calls[0][3]).toEqual({ lock: LOCK_A, setAsideUnsaved: 2 });
    });

    it('a password change syncs at once', async () => {
      const { rerender } = renderHook(() => useFilesystemSync());
      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));

      auth.storedLock = LOCK_B;
      rerender();

      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(2));
      expect(vi.mocked(writeFolderCopy).mock.calls[1][3]).toEqual({ lock: LOCK_B, setAsideUnsaved: 0 });
    });

    it('does not sync again for the same lock read afresh', async () => {
      const { rerender } = renderHook(() => useFilesystemSync());
      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));

      // Unlocking reads the credentials again: an equal lock, a new object
      auth.storedLock = { ...LOCK_A };
      rerender();
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));

      expect(writeFolderCopy).toHaveBeenCalledTimes(1);
    });

    it('adopts the lock the sync found', async () => {
      vi.mocked(writeFolderCopy).mockResolvedValueOnce({ status: 'unchanged', folderLock: LOCK_B });

      renderHook(() => useFilesystemSync());

      await waitFor(() => expect(auth.adoptFolderLock).toHaveBeenCalledWith(LOCK_B));
    });

    it('adopts nothing when the folder had no lock, or could not be opened', async () => {
      vi.mocked(writeFolderCopy).mockResolvedValueOnce({ status: 'written', folderLock: null });
      const { result } = renderHook(() => useFilesystemSync());
      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));
      vi.mocked(writeFolderCopy).mockResolvedValueOnce({ status: 'protected', reason: 'another-setup' });

      await act(() => result.current.syncNow());

      expect(auth.adoptFolderLock).not.toHaveBeenCalled();
      expect(result.current.issue).toBe('another-setup');
    });

    it('a set-aside change syncs at once', async () => {
      const { unmount } = renderHook(() => useFilesystemSync());
      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));

      act(() => notifySetAsideChanged());

      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(2));
      unmount();
      act(() => notifySetAsideChanged());
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(writeFolderCopy).toHaveBeenCalledTimes(2);
    });

    it('a set-aside change does not sync when folder storage is off', async () => {
      localStorage.setItem(STORAGE_PROVIDER_KEY, 'local');
      renderHook(() => useFilesystemSync());

      act(() => notifySetAsideChanged());
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(writeFolderCopy).not.toHaveBeenCalled();
    });

    it('writes nothing when the set-aside count cannot be read', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockCountSetAside.mockRejectedValue(new Error('Quest Diagnostics glucose 99'));

      const { result } = renderHook(() => useFilesystemSync());

      await waitFor(() => expect(result.current.issue).toBe('failed'));
      expect(writeFolderCopy).not.toHaveBeenCalled();
      expect(logged).toHaveBeenCalledWith('Failed to sync to the folder');
      expect(JSON.stringify(logged.mock.calls)).not.toContain('Quest');
    });

    it('a failed sync logs no error detail', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(writeFolderCopy).mockRejectedValueOnce(new Error('Quest Diagnostics glucose 99'));

      const { result } = renderHook(() => useFilesystemSync());

      await waitFor(() => expect(result.current.issue).toBe('failed'));
      expect(logged).toHaveBeenCalledWith('Failed to sync to the folder');
      expect(JSON.stringify(logged.mock.calls)).not.toContain('Quest');
    });

    it.each(['empty', 'unreadable', 'set-aside', 'another-setup'] as const)(
      'reports why a sync held back (%s)',
      async (reason) => {
        vi.mocked(writeFolderCopy).mockResolvedValue({ status: 'protected', reason });

        const { result } = renderHook(() => useFilesystemSync());

        await waitFor(() => expect(result.current.issue).toBe(reason));
      }
    );

    it('stops reporting once a sync writes again', async () => {
      vi.mocked(writeFolderCopy).mockResolvedValueOnce({ status: 'protected', reason: 'empty', folderLock: null });
      const { result } = renderHook(() => useFilesystemSync());
      await waitFor(() => expect(result.current.issue).toBe('empty'));

      await act(() => result.current.syncNow());

      expect(result.current.issue).toBeNull();
    });

    it('keeps reporting while nothing has changed', async () => {
      vi.mocked(writeFolderCopy).mockResolvedValueOnce({ status: 'protected', reason: 'empty', folderLock: null });
      const { result } = renderHook(() => useFilesystemSync());
      await waitFor(() => expect(result.current.issue).toBe('empty'));
      vi.mocked(writeFolderCopy).mockResolvedValueOnce({ status: 'protected', reason: 'empty', folderLock: null });

      await act(() => result.current.syncNow());

      expect(result.current.issue).toBe('empty');
    });

    it('stops reporting once the folder can no longer be written', async () => {
      vi.mocked(writeFolderCopy).mockResolvedValueOnce({ status: 'protected', reason: 'unreadable' });
      const { result } = renderHook(() => useFilesystemSync());
      await waitFor(() => expect(result.current.issue).toBe('unreadable'));
      mockGetPermissionState.mockResolvedValue('prompt');

      await act(() => result.current.syncNow());

      expect(result.current.issue).toBeNull();
    });

    it('stops reporting once folder storage is switched off', async () => {
      vi.mocked(writeFolderCopy).mockResolvedValueOnce({ status: 'protected', reason: 'unreadable' });
      const { result } = renderHook(() => useFilesystemSync());
      await waitFor(() => expect(result.current.issue).toBe('unreadable'));
      localStorage.setItem(STORAGE_PROVIDER_KEY, 'local');

      await act(() => result.current.syncNow());

      expect(result.current.issue).toBeNull();
    });

    it('reads the chosen folder afresh for every sync, so a changed folder is used', async () => {
      const { result } = renderHook(() => useFilesystemSync());
      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));

      await act(() => result.current.syncNow());

      expect(mockProviderCreated).toHaveBeenCalledTimes(2);
      const [first, second] = vi.mocked(writeFolderCopy).mock.calls.map(([store]) => store);
      expect(second).not.toBe(first);
    });

    it('runs one more sync for any number asked for during another', async () => {
      let finishFirst!: (outcome: FolderSyncOutcome) => void;
      vi.mocked(writeFolderCopy).mockImplementationOnce(
        () => new Promise((resolve) => (finishFirst = resolve))
      );
      const { result } = renderHook(() => useFilesystemSync());
      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));

      let asked!: Promise<void>[];
      act(() => {
        asked = [result.current.syncNow(), result.current.syncNow(), result.current.syncNow()];
      });
      await act(async () => {
        finishFirst(WRITTEN);
        await Promise.all(asked);
      });

      expect(writeFolderCopy).toHaveBeenCalledTimes(2);
    });

    it('reports a failed sync to whoever asked for it', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = renderHook(() => useFilesystemSync());
      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));
      vi.mocked(writeFolderCopy).mockRejectedValueOnce(new Error('Disk full'));

      await expect(act(() => result.current.syncNow())).rejects.toThrow('Disk full');
    });

    // A sync no one waits for (periodic, or the one a hold's end starts) has only the user to tell
    it('reports a failed sync until one succeeds', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(writeFolderCopy).mockRejectedValueOnce(new Error('Folder gone'));
      const { result } = renderHook(() => useFilesystemSync());
      await waitFor(() => expect(result.current.issue).toBe('failed'));

      await act(() => result.current.syncNow());

      expect(result.current.issue).toBeNull();
    });

    it('does not run a waiting sync once the session has ended', async () => {
      let finishFirst!: (outcome: FolderSyncOutcome) => void;
      vi.mocked(writeFolderCopy).mockImplementationOnce(
        () => new Promise((resolve) => (finishFirst = resolve))
      );
      const { result, unmount } = renderHook(() => useFilesystemSync());
      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));

      let waiting!: Promise<void>;
      act(() => {
        waiting = result.current.syncNow();
      });
      unmount();
      finishFirst(WRITTEN);
      await waiting;

      expect(writeFolderCopy).toHaveBeenCalledTimes(1);
    });

    it('runs a sync asked for during another one after it, not never', async () => {
      let finishFirst!: (outcome: FolderSyncOutcome) => void;
      vi.mocked(writeFolderCopy).mockImplementationOnce(
        () => new Promise((resolve) => (finishFirst = resolve))
      );
      const { result } = renderHook(() => useFilesystemSync());
      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));

      let second!: Promise<void>;
      act(() => {
        second = result.current.syncNow();
      });
      expect(writeFolderCopy).toHaveBeenCalledTimes(1);

      await act(async () => {
        finishFirst(WRITTEN);
        await second;
      });
      expect(writeFolderCopy).toHaveBeenCalledTimes(2);
    });
  });
});
