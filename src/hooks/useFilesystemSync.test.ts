/**
 * Tests for useFilesystemSync hook
 *
 * Tests the filesystem sync functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { notifySetAsideChanged } from '@data/db/setAsideEvents';
import { notifications } from '@mantine/notifications';
import { notifyFolderAccessChanged } from '@data/storage/folderAccessEvents';
import { loadFolderSyncState, saveFolderSyncState } from '@data/storage/folderSyncState';
import {
  folderCopyId,
  keepBrowserData,
  keepCurrentFolderCopy,
  keepFolderCopy,
  markFolderCopySeen,
  writeFolderCopy,
  type FolderSyncOutcome,
} from '@services/sync';
import { sealLockIntoFolderCopy } from '@services/sync/folderSync';
import { pushLockToFolder } from '@services/sync/folderLockPush';
import { formatDateTime } from '@/utils/formatDateTime';
import { markUnsavedEdit } from '@/utils/unsavedEdits';
import { installFakeWebLocks } from '@/test/fakeWebLocks';
import { withWebLock } from '@/utils/withWebLock';
import { useFilesystemSync } from './useFilesystemSync';
import type { StoredCredentialsV2 } from '@data/encryption/keyWrapping';
import type { ParsedBackupData } from '@services/import';

// Mock file system support
vi.mock('@/utils/fileSystemSupport', () => ({
  isFileSystemAccessSupported: vi.fn(() => true),
}));

// What the folder copy may be replaced with is the service's decision. The
// modules that decide are mocked, so the sync run (folderSyncRun) that calls
// them is the real one.
vi.mock('@services/sync/folderSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@services/sync/folderSync')>()),
  writeFolderCopy: vi.fn(),
  markFolderCopySeen: vi.fn(),
  folderCopyId: vi.fn(),
  sealLockIntoFolderCopy: vi.fn(),
}));
vi.mock('@services/sync/folderConflict', () => ({
  canKeepFolderCopy: vi.fn(),
  keepBrowserData: vi.fn(),
  keepFolderCopy: vi.fn(),
  keepCurrentFolderCopy: vi.fn(),
}));

// What this browser last saw of the folder copy, sealed in localStorage
vi.mock('@data/storage/folderSyncState', () => ({
  loadFolderSyncState: vi.fn(),
  saveFolderSyncState: vi.fn(),
}));

/** Replaces this browser's data with a folder copy, as AppShell does */
const applyFolderCopy = vi.fn<(data: ParsedBackupData, unchangedSince?: string) => Promise<string | null>>();

// Storage provider mock
const mockGetPermissionState = vi.fn().mockResolvedValue('granted');
const mockProviderCreated = vi.fn();
const mockSave = vi.fn().mockResolvedValue(undefined);

vi.mock('@data/storage/FileSystemStorageProvider', () => ({
  FileSystemStorageProvider: class MockFileSystemStorageProvider {
    getPermissionState = mockGetPermissionState;
    save = mockSave;
    getDirectoryName = vi.fn(async () => 'Lab Folder');
    constructor() {
      mockProviderCreated();
    }
  },
}));

/** What a sync saw: the copy's revision and a digest of this browser's data */
const STATE = { revision: 'r1', digest: 'digest-1' };
const WRITTEN: FolderSyncOutcome = { status: 'written', state: STATE, folderLock: null };

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
const mockDb = {
  exportAllData: mockExportAllData,
  countSetAside: mockCountSetAside,
  storedDataStamp: vi.fn(async () => 'stamp-1'),
};
const mockKey = {} as CryptoKey;

vi.mock('./useEncryptedDb', () => ({
  useEncryptedDb: () => ({ db: mockDb, isReady: true }),
}));

/** This browser's lock as the auth context gives it; a password change replaces it */
const LOCK_A = { version: 2, kekSalt: 'c2FsdEE=', iterations: 1000, wrapIv: 'aXZB', wrappedKey: 'a2V5QQ==' } as const;
const LOCK_B = { ...LOCK_A, kekSalt: 'c2FsdEI=', changedAt: '2026-11-06T09:00:00.000Z' };
const auth: {
  encryptionKey: CryptoKey | null;
  storedLock: StoredCredentialsV2 | null;
  adoptFolderLock: (lock: StoredCredentialsV2) => boolean;
} = { encryptionKey: mockKey, storedLock: LOCK_A, adoptFolderLock: () => false };

vi.mock('@contexts', () => ({
  useAuth: () => ({ ...auth }),
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn(), hide: vi.fn() },
}));

const STORAGE_PROVIDER_KEY = 'hemoio_storage_provider';

const FOLDER_BYTES = new Uint8Array([3]).buffer;
const EXPORTED_AT = new Date('2026-11-05T18:30:00.000Z');
const COPY = { labResults: [], testValues: [], userNotes: [], exportedAt: EXPORTED_AT } as unknown as ParsedBackupData;
const FOLDER_SIDE = { labResults: 3, testValues: 5, notes: 1, savedAt: EXPORTED_AT };
const BROWSER_SIDE = { labResults: 2, testValues: 4, notes: 0, savedAt: new Date('2026-11-05T19:00:00.000Z') };

/** The folder copy was written on another computer since this browser last saw it */
const changedElsewhere = (localChanged: boolean, revision = 'r2'): FolderSyncOutcome => ({
  status: 'changed-elsewhere',
  reason: localChanged ? 'both-changed' : 'newer',
  copy: COPY,
  revision,
  bytes: FOLDER_BYTES,
  localChanged,
  folder: FOLDER_SIDE,
  browser: BROWSER_SIDE,
  folderLock: null,
});

describe('useFilesystemSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(writeFolderCopy).mockResolvedValue(WRITTEN);
    vi.mocked(loadFolderSyncState).mockResolvedValue(null);
    vi.mocked(saveFolderSyncState).mockResolvedValue(undefined);
    vi.mocked(markFolderCopySeen).mockResolvedValue(undefined);
    vi.mocked(keepBrowserData).mockResolvedValue(true);
    vi.mocked(keepFolderCopy).mockResolvedValue(undefined);
    vi.mocked(keepCurrentFolderCopy).mockResolvedValue(FOLDER_BYTES);
    vi.mocked(folderCopyId).mockImplementation(async (_bytes, revision) => revision ?? 'sha256:bytes');
    applyFolderCopy.mockResolvedValue('loaded-stamp');
    mockGetPermissionState.mockResolvedValue('granted');
    mockCountSetAside.mockResolvedValue({ total: 0, unsaved: 0 });
    auth.encryptionKey = mockKey;
    auth.storedLock = LOCK_A;
    auth.adoptFolderLock = vi.fn(() => false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('hook interface', () => {
    it('should return syncNow function', () => {
      const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));

      expect(result.current.syncNow).toBeDefined();
      expect(typeof result.current.syncNow).toBe('function');
    });
  });

  describe('filesystem enabled check', () => {
    it('starts syncing within 30 seconds when folder storage is switched on', async () => {
      vi.useFakeTimers();
      try {
        localStorage.setItem(STORAGE_PROVIDER_KEY, 'local');
        renderHook(() => useFilesystemSync({ applyFolderCopy }));
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

      renderHook(() => useFilesystemSync({ applyFolderCopy }));

      // Give it time to potentially sync
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockExportAllData).not.toHaveBeenCalled();
    });

    it('should not sync when no storage provider is set', async () => {
      // Don't set any storage provider

      renderHook(() => useFilesystemSync({ applyFolderCopy }));

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
      const { result } = renderHook(() => useFilesystemSync({ enabled: false, applyFolderCopy }));

      await act(() => result.current.syncNow());

      expect(mockExportAllData).not.toHaveBeenCalled();
      expect(writeFolderCopy).not.toHaveBeenCalled();
    });

    it('syncs as soon as it is enabled', async () => {
      const { rerender } = renderHook(({ enabled }) => useFilesystemSync({ enabled, applyFolderCopy }), {
        initialProps: { enabled: false },
      });
      expect(writeFolderCopy).not.toHaveBeenCalled();

      rerender({ enabled: true });

      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));
    });

    it('a sync already asked for does not write once it is no longer enabled', async () => {
      const { result, rerender } = renderHook(({ enabled }) => useFilesystemSync({ enabled, applyFolderCopy }), {
        initialProps: { enabled: true },
      });
      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));
      const syncNow = result.current.syncNow;

      rerender({ enabled: false });
      await act(() => syncNow());

      expect(writeFolderCopy).toHaveBeenCalledTimes(1);
    });

    describe('a sync that waited for another tab', () => {
      /** Another tab holds the folder-sync lock until released */
      async function anotherTabSyncing(): Promise<{ release: () => Promise<void>; uninstall: () => void; requests: () => string[] }> {
        const locks = installFakeWebLocks();
        let finish = (): void => {};
        const held = withWebLock('hemoio-folder-sync', () => new Promise<void>((resolve) => (finish = resolve)));
        await waitFor(() => expect(locks.held()).toBe('hemoio-folder-sync'));
        return {
          release: async () => {
            finish();
            await held;
          },
          uninstall: locks.uninstall,
          requests: () => locks.requests.map((r) => r.name),
        };
      }

      it('writes nothing once the session has ended meanwhile', async () => {
        const { result, rerender } = renderHook(() => useFilesystemSync({ applyFolderCopy }));
        await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));
        const other = await anotherTabSyncing();
        try {
          let waiting: Promise<void> = Promise.resolve();
          act(() => {
            waiting = result.current.syncNow();
          });

          // Waiting for the lock, past the checks made before it
          await waitFor(() => expect(other.requests()).toHaveLength(2));
          auth.encryptionKey = null;
          rerender();
          await act(async () => {
            await other.release();
            await waiting;
          });

          expect(writeFolderCopy).toHaveBeenCalledTimes(1);
        } finally {
          other.uninstall();
        }
      });

      it('writes nothing once folder storage was switched off meanwhile', async () => {
        const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));
        await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));
        const other = await anotherTabSyncing();
        try {
          let waiting: Promise<void> = Promise.resolve();
          act(() => {
            waiting = result.current.syncNow();
          });

          await waitFor(() => expect(other.requests()).toHaveLength(2));
          localStorage.setItem(STORAGE_PROVIDER_KEY, 'local');
          await act(async () => {
            await other.release();
            await waiting;
          });

          expect(writeFolderCopy).toHaveBeenCalledTimes(1);
        } finally {
          other.uninstall();
        }
      });
    });

    it('does not write when the hold begins while the data is exported', async () => {
      let exported!: (data: unknown) => void;
      const { rerender } = renderHook(({ enabled }) => useFilesystemSync({ enabled, applyFolderCopy }), {
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
      const { result, rerender } = renderHook(({ enabled }) => useFilesystemSync({ enabled, applyFolderCopy }), {
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
      renderHook(() => useFilesystemSync({ applyFolderCopy }));

      await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    });

    it('reports nothing about the folder copy while held', async () => {
      vi.mocked(writeFolderCopy).mockResolvedValueOnce({ status: 'protected', reason: 'empty', folderLock: null });
      const { result, rerender } = renderHook(({ enabled }) => useFilesystemSync({ enabled, applyFolderCopy }), {
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
      const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));

      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));
      expect(vi.mocked(writeFolderCopy).mock.calls[0][1]).toEqual(
        await mockExportAllData.mock.results[0].value
      );
      expect(result.current.issue).toBeNull();
    });

    it('passes the unsaved set-aside count', async () => {
      mockCountSetAside.mockResolvedValue({ total: 3, unsaved: 2 });

      renderHook(() => useFilesystemSync({ applyFolderCopy }));

      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));
      expect(vi.mocked(writeFolderCopy).mock.calls[0][3]).toEqual({
        lock: LOCK_A,
        setAsideUnsaved: 2,
        lastSeen: null,
        lockMayBeBehind: true,
      });
    });

    it('a password change syncs at once', async () => {
      const { rerender } = renderHook(() => useFilesystemSync({ applyFolderCopy }));
      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));

      auth.storedLock = LOCK_B;
      rerender();

      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(2));
      // The first sync wrote LOCK_A; LOCK_B may not be in the folder yet
      expect(vi.mocked(writeFolderCopy).mock.calls[1][3]).toEqual({
        lock: LOCK_B,
        setAsideUnsaved: 0,
        lastSeen: null,
        lockMayBeBehind: true,
      });
    });

    it('reads the copy for the lock only until a sync finds the folder holding it (P42)', async () => {
      const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));
      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));

      await act(() => result.current.syncNow());

      expect(vi.mocked(writeFolderCopy).mock.calls[1][3]).toMatchObject({ lockMayBeBehind: false });
    });

    describe('putting a changed lock into the folder whatever holds the data (P42)', () => {
      beforeEach(() => {
        // As stored by the password change
        localStorage.setItem('hemoio_credentials', JSON.stringify(LOCK_A));
        vi.mocked(sealLockIntoFolderCopy).mockResolvedValue({ status: 'resealed', folderLock: LOCK_A });
      });

      it('a held sync puts the lock in, while the folder may not hold it', async () => {
        vi.mocked(writeFolderCopy).mockResolvedValueOnce(changedElsewhere(true));
        const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));
        await waitFor(() => expect(result.current.held).toBe(true));

        await act(() => result.current.syncNow());
        expect(sealLockIntoFolderCopy).toHaveBeenCalledWith(expect.anything(), mockKey, LOCK_A);
        expect(writeFolderCopy).toHaveBeenCalledTimes(1);

        // Once there, a held sync reads nothing
        await act(() => result.current.syncNow());
        expect(sealLockIntoFolderCopy).toHaveBeenCalledTimes(1);
      });

      it('the password change puts the lock in at once, even while syncs are held', async () => {
        renderHook(() => useFilesystemSync({ enabled: false, applyFolderCopy }));

        expect(await pushLockToFolder()).toBe(true);

        expect(sealLockIntoFolderCopy).toHaveBeenCalledWith(expect.anything(), mockKey, LOCK_A);
        expect(writeFolderCopy).not.toHaveBeenCalled();
      });

      it.each([
        ['the copy does not open under the key', () => {
          vi.mocked(sealLockIntoFolderCopy).mockResolvedValue({ status: 'not-opened', folderLock: null });
        }],
        ['the folder cannot be written', () => {
          vi.mocked(sealLockIntoFolderCopy).mockRejectedValue(new Error('Disk full'));
        }],
        ['there is no folder access', () => {
          mockGetPermissionState.mockResolvedValueOnce('prompt');
        }],
      ])('says the lock is not in the folder when %s', async (_label, arrange) => {
        renderHook(() => useFilesystemSync({ enabled: false, applyFolderCopy }));
        arrange();

        expect(await pushLockToFolder()).toBe(false);
      });
    });

    it('does not sync again for the same lock read afresh', async () => {
      const { rerender } = renderHook(() => useFilesystemSync({ applyFolderCopy }));
      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));

      // Unlocking reads the credentials again: an equal lock, a new object
      auth.storedLock = { ...LOCK_A };
      rerender();
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));

      expect(writeFolderCopy).toHaveBeenCalledTimes(1);
    });

    it('adopts the lock the sync found', async () => {
      vi.mocked(writeFolderCopy).mockResolvedValueOnce({ status: 'unchanged', state: STATE, folderLock: LOCK_B });

      renderHook(() => useFilesystemSync({ applyFolderCopy }));

      await waitFor(() => expect(auth.adoptFolderLock).toHaveBeenCalledWith(LOCK_B));
    });

    it('says when it adopted a password changed on another computer', async () => {
      auth.adoptFolderLock = vi.fn(() => true);
      vi.mocked(writeFolderCopy).mockResolvedValueOnce({ status: 'unchanged', state: STATE, folderLock: LOCK_B });

      renderHook(() => useFilesystemSync({ applyFolderCopy }));

      await waitFor(() => expect(notifications.show).toHaveBeenCalledTimes(1));
      expect(vi.mocked(notifications.show).mock.calls[0][0]).toMatchObject({
        title: 'Password changed on another computer',
        message: 'Use the new password the next time you unlock HemoIO.',
        autoClose: false,
      });
    });

    it('says nothing for a lock this browser holds already', async () => {
      vi.mocked(writeFolderCopy).mockResolvedValue({ status: 'unchanged', state: STATE, folderLock: LOCK_A });

      const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));
      await waitFor(() => expect(auth.adoptFolderLock).toHaveBeenCalledWith(LOCK_A));
      await act(() => result.current.syncNow());

      expect(notifications.show).not.toHaveBeenCalled();
    });

    it('adopts nothing found by a sync whose session has ended', async () => {
      let finish: (outcome: FolderSyncOutcome) => void = () => {};
      vi.mocked(writeFolderCopy).mockImplementationOnce(
        () => new Promise<FolderSyncOutcome>((resolve) => (finish = resolve))
      );
      const { rerender } = renderHook(() => useFilesystemSync({ applyFolderCopy }));
      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));

      // Locked while the sync read the folder
      auth.encryptionKey = null;
      rerender();
      await act(async () => finish({ status: 'unchanged', state: STATE, folderLock: LOCK_B }));

      expect(auth.adoptFolderLock).not.toHaveBeenCalled();
      expect(notifications.show).not.toHaveBeenCalled();
    });

    it('adopts nothing when the folder had no lock, or could not be opened', async () => {
      vi.mocked(writeFolderCopy).mockResolvedValueOnce({ status: 'written', state: STATE, folderLock: null });
      const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));
      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));
      vi.mocked(writeFolderCopy).mockResolvedValueOnce({ status: 'protected', reason: 'another-setup' });

      await act(() => result.current.syncNow());

      expect(auth.adoptFolderLock).not.toHaveBeenCalled();
      expect(result.current.issue).toBe('another-setup');
    });

    it('a set-aside change syncs at once', async () => {
      const { unmount } = renderHook(() => useFilesystemSync({ applyFolderCopy }));
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
      renderHook(() => useFilesystemSync({ applyFolderCopy }));

      act(() => notifySetAsideChanged());
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(writeFolderCopy).not.toHaveBeenCalled();
    });

    it('writes nothing when the set-aside count cannot be read', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockCountSetAside.mockRejectedValue(new Error('Quest Diagnostics glucose 99'));

      const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));

      await waitFor(() => expect(result.current.issue).toBe('failed'));
      expect(writeFolderCopy).not.toHaveBeenCalled();
      expect(logged).toHaveBeenCalledWith('Failed to sync to the folder');
      expect(JSON.stringify(logged.mock.calls)).not.toContain('Quest');
    });

    it('a failed sync logs no error detail', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(writeFolderCopy).mockRejectedValueOnce(new Error('Quest Diagnostics glucose 99'));

      const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));

      await waitFor(() => expect(result.current.issue).toBe('failed'));
      expect(logged).toHaveBeenCalledWith('Failed to sync to the folder');
      expect(JSON.stringify(logged.mock.calls)).not.toContain('Quest');
    });

    it.each(['empty', 'unreadable', 'set-aside', 'another-setup'] as const)(
      'reports why a sync held back (%s)',
      async (reason) => {
        vi.mocked(writeFolderCopy).mockResolvedValue({ status: 'protected', reason });

        const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));

        await waitFor(() => expect(result.current.issue).toBe(reason));
      }
    );

    it('stops reporting once a sync writes again', async () => {
      vi.mocked(writeFolderCopy).mockResolvedValueOnce({ status: 'protected', reason: 'empty', folderLock: null });
      const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));
      await waitFor(() => expect(result.current.issue).toBe('empty'));

      await act(() => result.current.syncNow());

      expect(result.current.issue).toBeNull();
    });

    it('keeps reporting while nothing has changed', async () => {
      vi.mocked(writeFolderCopy).mockResolvedValueOnce({ status: 'protected', reason: 'empty', folderLock: null });
      const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));
      await waitFor(() => expect(result.current.issue).toBe('empty'));
      vi.mocked(writeFolderCopy).mockResolvedValueOnce({ status: 'protected', reason: 'empty', folderLock: null });

      await act(() => result.current.syncNow());

      expect(result.current.issue).toBe('empty');
    });

    it('stops reporting once the folder can no longer be written', async () => {
      vi.mocked(writeFolderCopy).mockResolvedValueOnce({ status: 'protected', reason: 'unreadable' });
      const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));
      await waitFor(() => expect(result.current.issue).toBe('unreadable'));
      mockGetPermissionState.mockResolvedValue('prompt');

      await act(() => result.current.syncNow());

      expect(result.current.issue).toBeNull();
    });

    it('stops reporting once folder storage is switched off', async () => {
      vi.mocked(writeFolderCopy).mockResolvedValueOnce({ status: 'protected', reason: 'unreadable' });
      const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));
      await waitFor(() => expect(result.current.issue).toBe('unreadable'));
      localStorage.setItem(STORAGE_PROVIDER_KEY, 'local');

      await act(() => result.current.syncNow());

      expect(result.current.issue).toBeNull();
    });

    it('reads the chosen folder afresh for every sync, so a changed folder is used', async () => {
      const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));
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
      const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));
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
      const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));
      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));
      vi.mocked(writeFolderCopy).mockRejectedValueOnce(new Error('Disk full'));

      await expect(act(() => result.current.syncNow())).rejects.toThrow('Disk full');
    });

    // A sync no one waits for (periodic, or the one a hold's end starts) has only the user to tell
    it('reports a failed sync until one succeeds', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(writeFolderCopy).mockRejectedValueOnce(new Error('Folder gone'));
      const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));
      await waitFor(() => expect(result.current.issue).toBe('failed'));

      await act(() => result.current.syncNow());

      expect(result.current.issue).toBeNull();
    });

    it('does not run a waiting sync once the session has ended', async () => {
      let finishFirst!: (outcome: FolderSyncOutcome) => void;
      vi.mocked(writeFolderCopy).mockImplementationOnce(
        () => new Promise((resolve) => (finishFirst = resolve))
      );
      const { result, unmount } = renderHook(() => useFilesystemSync({ applyFolderCopy }));
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
      const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));
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

  describe('two computers on one folder', () => {
    beforeEach(() => {
      localStorage.setItem(STORAGE_PROVIDER_KEY, 'filesystem');
    });

    it('passes what it last saw, and saves what this sync saw', async () => {
      vi.mocked(loadFolderSyncState).mockResolvedValue({ revision: 'r0', digest: 'digest-0' });

      renderHook(() => useFilesystemSync({ applyFolderCopy }));

      await waitFor(() => expect(saveFolderSyncState).toHaveBeenCalledWith(STATE, mockKey));
      expect(loadFolderSyncState).toHaveBeenCalledWith(mockKey);
      expect(vi.mocked(writeFolderCopy).mock.calls[0][3]).toMatchObject({
        lastSeen: { revision: 'r0', digest: 'digest-0' },
      });
    });

    it('does not save the state again when nothing changed', async () => {
      vi.mocked(loadFolderSyncState).mockResolvedValue({ ...STATE });
      vi.mocked(writeFolderCopy).mockResolvedValue({ status: 'unchanged', state: STATE, folderLock: null });

      const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));
      await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));
      await act(() => result.current.syncNow());

      expect(saveFolderSyncState).not.toHaveBeenCalled();
    });

    it("loads a newer copy after keeping this computer's data, and notifies with its date", async () => {
      vi.mocked(loadFolderSyncState).mockResolvedValue(STATE);
      vi.mocked(writeFolderCopy).mockResolvedValueOnce(changedElsewhere(false));

      renderHook(() => useFilesystemSync({ applyFolderCopy }));

      await waitFor(() => expect(markFolderCopySeen).toHaveBeenCalledWith(mockDb, mockKey, 'r2', 'loaded-stamp'));
      expect(keepBrowserData).toHaveBeenCalledWith(
        { db: mockDb, key: mockKey, backups: expect.anything() },
        { kind: 'before-load', unchangedSince: STATE.digest }
      );
      // Only while the data is as it was stamped before the backup
      expect(applyFolderCopy).toHaveBeenCalledWith(COPY, 'stamp-1');
      const order = (fn: { mock: { invocationCallOrder: number[] } }): number => fn.mock.invocationCallOrder[0];
      expect(order(vi.mocked(keepBrowserData))).toBeLessThan(order(applyFolderCopy));
      // Told before the load is recorded as seen, which could fail
      expect(order(vi.mocked(notifications.show))).toBeLessThan(order(vi.mocked(markFolderCopySeen)));
      expect(vi.mocked(notifications.show).mock.calls[0][0]).toMatchObject({
        title: 'Updated from the folder',
        message: `Saved on ${formatDateTime(EXPORTED_AT)}`,
      });
    });

    it('holds an automatic load while a note editor holds unsaved text, and loads at a later sync (P44)', async () => {
      vi.mocked(loadFolderSyncState).mockResolvedValue(STATE);
      vi.mocked(writeFolderCopy).mockResolvedValue(changedElsewhere(false));
      const clear = markUnsavedEdit();
      try {
        const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));
        await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));
        await act(() => result.current.syncNow());

        expect(keepBrowserData).not.toHaveBeenCalled();
        expect(applyFolderCopy).not.toHaveBeenCalled();
        expect(result.current.issue).toBeNull();
      } finally {
        clear();
      }
    });

    it('a failed backup loads nothing', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(loadFolderSyncState).mockResolvedValue(STATE);
      vi.mocked(keepBrowserData).mockRejectedValue(new Error('Disk full'));
      vi.mocked(writeFolderCopy).mockResolvedValueOnce(changedElsewhere(false));

      const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));

      await waitFor(() => expect(result.current.issue).toBe('failed'));
      expect(applyFolderCopy).not.toHaveBeenCalled();
      expect(markFolderCopySeen).not.toHaveBeenCalled();
    });

    it('still tells of the load when recording it as seen fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(loadFolderSyncState).mockResolvedValue(STATE);
      vi.mocked(markFolderCopySeen).mockRejectedValue(new Error('Storage full'));
      vi.mocked(writeFolderCopy).mockResolvedValueOnce(changedElsewhere(false));

      const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));

      await waitFor(() => expect(result.current.issue).toBe('failed'));
      expect(vi.mocked(notifications.show).mock.calls[0][0]).toMatchObject({ title: 'Updated from the folder' });
    });

    it('does not load a newer copy over changes made while it was read', async () => {
      vi.mocked(loadFolderSyncState).mockResolvedValue(STATE);
      vi.mocked(keepBrowserData).mockResolvedValue(false);
      vi.mocked(writeFolderCopy).mockResolvedValueOnce(changedElsewhere(false));

      const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));
      await waitFor(() => expect(keepBrowserData).toHaveBeenCalled());
      await act(() => result.current.syncNow());

      expect(applyFolderCopy).not.toHaveBeenCalled();
      expect(markFolderCopySeen).not.toHaveBeenCalled();
    });

    it('tells nothing and records nothing when a change saved meanwhile stopped the load', async () => {
      vi.mocked(loadFolderSyncState).mockResolvedValue(STATE);
      applyFolderCopy.mockResolvedValue(null);
      vi.mocked(writeFolderCopy).mockResolvedValueOnce(changedElsewhere(false));

      const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));
      await waitFor(() => expect(applyFolderCopy).toHaveBeenCalled());
      await act(() => result.current.syncNow());

      expect(notifications.show).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Updated from the folder' }));
      expect(markFolderCopySeen).not.toHaveBeenCalled();
      expect(result.current.issue).toBeNull();
    });

    it('loading a newer copy does not start another sync', async () => {
      vi.mocked(loadFolderSyncState).mockResolvedValue(STATE);
      let applied = false;
      applyFolderCopy.mockImplementation(async () => {
        applied = true;
        return 'loaded-stamp';
      });
      vi.mocked(writeFolderCopy).mockResolvedValueOnce(changedElsewhere(false));
      const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));
      await waitFor(() => expect(markFolderCopySeen).toHaveBeenCalled());

      // The sync that loaded it has settled: the next one runs, and only it
      await act(() => result.current.syncNow());

      expect(applied).toBe(true);
      expect(writeFolderCopy).toHaveBeenCalledTimes(2);
    });

    it.each(['not-newer', 'empties'] as const)('a copy that is %s is asked about, even with no change here', async (reason) => {
      vi.mocked(loadFolderSyncState).mockResolvedValue(STATE);
      vi.mocked(writeFolderCopy).mockResolvedValueOnce({
        ...(changedElsewhere(false) as Extract<FolderSyncOutcome, { status: 'changed-elsewhere' }>),
        reason,
      });

      const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));

      await waitFor(() => expect(result.current.conflict).toMatchObject({ reason }));
      expect(keepBrowserData).not.toHaveBeenCalled();
      expect(applyFolderCopy).not.toHaveBeenCalled();
    });

    it('adopts a later lock found with a conflict', async () => {
      auth.adoptFolderLock = vi.fn(() => true);
      vi.mocked(writeFolderCopy).mockResolvedValueOnce({
        ...(changedElsewhere(true) as Extract<FolderSyncOutcome, { status: 'changed-elsewhere' }>),
        folderLock: LOCK_B,
      });

      const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));

      await waitFor(() => expect(result.current.conflict).not.toBeNull());
      expect(auth.adoptFolderLock).toHaveBeenCalledWith(LOCK_B);
      expect(vi.mocked(notifications.show).mock.calls[0][0]).toMatchObject({
        title: 'Password changed on another computer',
      });
    });

    it('syncs run inside the folder-sync Web Lock', async () => {
      let held: string | null = null;
      const request = vi.fn(async (name: string, _options: unknown, task: () => Promise<unknown>) => {
        held = name;
        try {
          return await task();
        } finally {
          held = null;
        }
      });
      // jsdom has no Web Locks
      Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });
      const heldDuringWrite: Array<string | null> = [];
      vi.mocked(writeFolderCopy).mockImplementation(async () => {
        heldDuringWrite.push(held);
        return WRITTEN;
      });
      try {
        renderHook(() => useFilesystemSync({ applyFolderCopy }));

        await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));
        expect(heldDuringWrite).toEqual(['hemoio-folder-sync']);
        expect(request).toHaveBeenCalledWith('hemoio-folder-sync', { mode: 'exclusive' }, expect.any(Function));
      } finally {
        delete (navigator as Partial<Navigator> & { locks?: unknown }).locks;
      }
    });

    describe('when both sides changed', () => {
      async function inConflict() {
        vi.mocked(writeFolderCopy).mockResolvedValueOnce(changedElsewhere(true));
        const hook = renderHook(() => useFilesystemSync({ applyFolderCopy }));
        await waitFor(() => expect(hook.result.current.conflict).not.toBeNull());
        return hook;
      }

      it('asks, with counts and dates, and holds syncs', async () => {
        const { result } = await inConflict();

        expect(result.current.conflict).toEqual({
          reason: 'both-changed',
          folder: FOLDER_SIDE,
          browser: BROWSER_SIDE,
          folderName: 'Lab Folder',
        });
        expect(result.current.held).toBe(true);
        await act(() => result.current.syncNow());
        expect(writeFolderCopy).toHaveBeenCalledTimes(1);
        expect(applyFolderCopy).not.toHaveBeenCalled();
      });

      it("loading the folder copy keeps this computer's data as a backup first", async () => {
        const { result } = await inConflict();

        await act(() => result.current.resolveConflict('folder'));

        expect(keepBrowserData).toHaveBeenCalledWith(
          { db: mockDb, key: mockKey, backups: expect.anything() },
          { kind: 'conflict' }
        );
        expect(vi.mocked(keepBrowserData).mock.invocationCallOrder[0]).toBeLessThan(
          applyFolderCopy.mock.invocationCallOrder[0]
        );
        // Only while the data is as it was stamped before the backup's export
        expect(mockDb.storedDataStamp.mock.invocationCallOrder[0]).toBeLessThan(
          vi.mocked(keepBrowserData).mock.invocationCallOrder[0]
        );
        expect(applyFolderCopy).toHaveBeenCalledWith(COPY, 'stamp-1');
        expect(markFolderCopySeen).toHaveBeenCalledWith(mockDb, mockKey, 'r2', 'loaded-stamp');
        expect(result.current.conflict).toBeNull();
        expect(result.current.held).toBe(false);
      });

      it('asks again, loading nothing, when a change was saved after the backup was kept', async () => {
        const { result } = await inConflict();
        applyFolderCopy.mockResolvedValueOnce(null);
        vi.mocked(writeFolderCopy).mockResolvedValueOnce(changedElsewhere(true, 'r2'));

        await act(() => result.current.resolveConflict('folder'));

        expect(markFolderCopySeen).not.toHaveBeenCalled();
        expect(writeFolderCopy).toHaveBeenCalledTimes(2);
        expect(result.current.conflict).not.toBeNull();
        expect(result.current.issue).toBeNull();
      });

      it('a failed load keeps the question, and rejects so that it says nothing changed', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { result } = await inConflict();
        applyFolderCopy.mockRejectedValueOnce(new Error('Quota'));

        await expect(act(() => result.current.resolveConflict('folder'))).rejects.toThrow('Quota');

        expect(markFolderCopySeen).not.toHaveBeenCalled();
        expect(result.current.conflict).not.toBeNull();
        expect(result.current.held).toBe(true);
      });

      it('the question stays until the copy is loaded', async () => {
        const { result } = await inConflict();
        let finishLoad: (stamp: string) => void = () => {};
        applyFolderCopy.mockImplementationOnce(() => new Promise((resolve) => (finishLoad = resolve)));

        let resolving: Promise<void> = Promise.resolve();
        act(() => {
          resolving = result.current.resolveConflict('folder');
        });
        await waitFor(() => expect(applyFolderCopy).toHaveBeenCalled());

        expect(result.current.conflict).not.toBeNull();
        await act(async () => {
          finishLoad('loaded-stamp');
          await resolving;
        });
        expect(result.current.conflict).toBeNull();
      });

      it('a copy loaded but not recorded as seen is not called a failed load', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { result } = await inConflict();
        vi.mocked(markFolderCopySeen).mockRejectedValueOnce(new Error('quota'));

        await act(() => result.current.resolveConflict('folder'));

        expect(applyFolderCopy).toHaveBeenCalled();
        expect(error).toHaveBeenCalledWith('Could not record the folder copy as seen');
        expect(error).not.toHaveBeenCalledWith('Failed to load the folder copy');
        expect(result.current.issue).toBeNull();
        error.mockRestore();
      });

      it("keeping this computer's data keeps the folder copy as a backup, then writes over it", async () => {
        const { result } = await inConflict();

        await act(() => result.current.resolveConflict('browser'));

        expect(keepFolderCopy).toHaveBeenCalledWith(expect.objectContaining({ key: mockKey }), FOLDER_BYTES);
        expect(writeFolderCopy).toHaveBeenCalledTimes(2);
        expect(vi.mocked(writeFolderCopy).mock.calls[1][3]).toMatchObject({ replaces: 'r2' });
        expect(vi.mocked(keepFolderCopy).mock.invocationCallOrder[0]).toBeLessThan(
          vi.mocked(writeFolderCopy).mock.invocationCallOrder[1]
        );
        expect(applyFolderCopy).not.toHaveBeenCalled();
        expect(result.current.conflict).toBeNull();
      });

      it("refuses to keep this computer's data when it holds no lab results, keeping nothing", async () => {
        vi.mocked(writeFolderCopy).mockResolvedValueOnce({
          ...(changedElsewhere(true) as Extract<FolderSyncOutcome, { status: 'changed-elsewhere' }>),
          browser: { labResults: 0, testValues: 0, notes: 0, savedAt: null },
        });
        const { result } = renderHook(() => useFilesystemSync({ applyFolderCopy }));
        await waitFor(() => expect(result.current.conflict).not.toBeNull());

        await expect(act(() => result.current.resolveConflict('browser'))).rejects.toThrow();

        expect(keepFolderCopy).not.toHaveBeenCalled();
        expect(writeFolderCopy).toHaveBeenCalledTimes(1);
        expect(result.current.conflict).not.toBeNull();
      });

      it("asks again when the folder copy changed before this computer's data was written", async () => {
        const { result } = await inConflict();
        vi.mocked(writeFolderCopy).mockResolvedValueOnce(changedElsewhere(true, 'r3'));

        await act(() => result.current.resolveConflict('browser'));

        expect(result.current.conflict).not.toBeNull();
        await act(() => result.current.resolveConflict('browser'));
        expect(vi.mocked(writeFolderCopy).mock.calls[2][3]).toMatchObject({ replaces: 'r3' });
      });

      it.each(['folder', 'browser'] as const)(
        'when the backup cannot be written, neither side is replaced (%s)',
        async (choice) => {
          const { result } = await inConflict();
          vi.mocked(keepBrowserData).mockRejectedValue(new Error('Disk full'));
          vi.mocked(keepFolderCopy).mockRejectedValue(new Error('Disk full'));

          await expect(act(() => result.current.resolveConflict(choice))).rejects.toThrow('Disk full');

          expect(applyFolderCopy).not.toHaveBeenCalled();
          expect(mockSave).not.toHaveBeenCalled();
          expect(writeFolderCopy).toHaveBeenCalledTimes(1);
          expect(markFolderCopySeen).not.toHaveBeenCalled();
          expect(result.current.conflict).not.toBeNull();
        }
      );

      it.each(['folder', 'browser'] as const)(
        'saves and loads nothing when the session ended while the choice waited for earlier syncs (%s)',
        async (choice) => {
          // The folder-sync lock, held elsewhere (a sync in another tab) once `busy` is set
          const lock = { busy: false, release: null as (() => void) | null };
          const request = vi.fn(async (_name: string, _options: unknown, task: () => Promise<unknown>) => {
            if (lock.busy) await new Promise<void>((resolve) => (lock.release = resolve));
            return task();
          });
          Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });
          try {
            const { result, rerender } = await inConflict();
            lock.busy = true;
            let resolving!: Promise<void>;
            act(() => {
              resolving = result.current.resolveConflict(choice);
            });
            await waitFor(() => expect(lock.release).not.toBeNull());

            // Locked while it waited
            auth.encryptionKey = null;
            rerender();
            await act(async () => {
              lock.release!();
              await resolving;
            });

            expect(keepBrowserData).not.toHaveBeenCalled();
            expect(keepFolderCopy).not.toHaveBeenCalled();
            expect(applyFolderCopy).not.toHaveBeenCalled();
            expect(writeFolderCopy).toHaveBeenCalledTimes(1);
          } finally {
            delete (navigator as Partial<Navigator> & { locks?: unknown }).locks;
          }
        }
      );

      it('deciding later holds syncs for the session, until folder access changes', async () => {
        const { result } = await inConflict();

        await act(() => result.current.resolveConflict('later'));

        expect(result.current.conflict).toBeNull();
        expect(result.current.held).toBe(true);
        // The hold says so itself
        expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ title: 'Folder Sync Paused' }));
        await act(() => result.current.syncNow());
        expect(writeFolderCopy).toHaveBeenCalledTimes(1);
        expect(keepFolderCopy).not.toHaveBeenCalled();

        act(() => notifyFolderAccessChanged());
        expect(result.current.held).toBe(false);
        await act(() => result.current.syncNow());
        expect(writeFolderCopy).toHaveBeenCalledTimes(2);
      });
    });

    it('acknowledges a restored copy, even while syncs are held', async () => {
      const { result } = renderHook(() => useFilesystemSync({ enabled: false, applyFolderCopy }));

      await act(() => result.current.acknowledgeFolderCopy('r5', 'restored-stamp'));

      // Recorded only while the data is as the restore left it
      expect(markFolderCopySeen).toHaveBeenCalledWith(mockDb, mockKey, 'r5', 'restored-stamp');
      expect(writeFolderCopy).not.toHaveBeenCalled();
    });

    describe('replacing the folder copy from the restore question', () => {
      it('keeps the folder copy as a backup, then the next sync writes over it without asking', async () => {
        const { result, rerender } = renderHook(({ enabled }) => useFilesystemSync({ enabled, applyFolderCopy }), {
          initialProps: { enabled: false },
        });

        await act(() => result.current.replaceFolderCopy('r7'));
        expect(keepCurrentFolderCopy).toHaveBeenCalledWith(expect.objectContaining({ key: mockKey }));
        expect(writeFolderCopy).not.toHaveBeenCalled();

        rerender({ enabled: true });
        await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));
        expect(vi.mocked(writeFolderCopy).mock.calls[0][3]).toMatchObject({ replaces: 'r7' });

        // Once only
        await act(() => result.current.syncNow());
        expect(vi.mocked(writeFolderCopy).mock.calls[1][3]).not.toHaveProperty('replaces');
      });

      it.each([
        ['the app locks', () => (auth.encryptionKey = null)],
        ['another session begins', () => (auth.encryptionKey = { other: true } as unknown as CryptoKey)],
        ['the folder changes', () => notifyFolderAccessChanged()],
      ])('drops the choice when %s before the sync it was for', async (_, change) => {
        const { result, rerender } = renderHook(({ enabled }) => useFilesystemSync({ enabled, applyFolderCopy }), {
          initialProps: { enabled: false },
        });
        await act(() => result.current.replaceFolderCopy('r7'));

        act(() => {
          change();
        });
        rerender({ enabled: false });
        auth.encryptionKey = mockKey;
        rerender({ enabled: true });

        await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));
        expect(vi.mocked(writeFolderCopy).mock.calls[0][3]).not.toHaveProperty('replaces');
      });

      it('drops the choice when the app locks while the folder copy is being kept', async () => {
        let kept!: (bytes: ArrayBuffer) => void;
        vi.mocked(keepCurrentFolderCopy).mockImplementationOnce(
          () => new Promise<ArrayBuffer>((resolve) => (kept = resolve))
        );
        const { result, rerender } = renderHook(({ enabled }) => useFilesystemSync({ enabled, applyFolderCopy }), {
          initialProps: { enabled: false },
        });
        let replaced!: Promise<void>;
        act(() => {
          replaced = result.current.replaceFolderCopy('r7');
        });
        await waitFor(() => expect(keepCurrentFolderCopy).toHaveBeenCalled());

        auth.encryptionKey = null;
        rerender({ enabled: false });
        await act(async () => {
          kept(new ArrayBuffer(4));
          await replaced;
        });
        auth.encryptionKey = mockKey;
        rerender({ enabled: true });

        await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));
        expect(vi.mocked(writeFolderCopy).mock.calls[0][3]).not.toHaveProperty('replaces');
      });

      it('chooses nothing when the backup cannot be saved', async () => {
        vi.mocked(keepCurrentFolderCopy).mockRejectedValue(new Error('Disk full'));
        const { result, rerender } = renderHook(({ enabled }) => useFilesystemSync({ enabled, applyFolderCopy }), {
          initialProps: { enabled: false },
        });

        await expect(act(() => result.current.replaceFolderCopy('r7'))).rejects.toThrow('Disk full');
        rerender({ enabled: true });

        await waitFor(() => expect(writeFolderCopy).toHaveBeenCalledTimes(1));
        expect(vi.mocked(writeFolderCopy).mock.calls[0][3]).not.toHaveProperty('replaces');
      });
    });
  });
});
