/**
 * Tests for useFilesystemSync hook
 *
 * Tests the filesystem sync functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { writeFolderCopy, type FolderSyncOutcome } from '@services/sync';
import { useFilesystemSync } from './useFilesystemSync';

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

vi.mock('@data/storage/FileSystemStorageProvider', () => ({
  FileSystemStorageProvider: class MockFileSystemStorageProvider {
    getPermissionState = mockGetPermissionState;
    constructor() {
      mockProviderCreated();
    }
  },
}));

const WRITTEN: FolderSyncOutcome = { status: 'written' };

// Mock db
const mockExportAllData = vi.fn().mockResolvedValue({
  labResults: [],
  testValues: [],
  userNotes: [],
  settings: null,
  preferences: null,
});

// The same db and key on every render, as the providers give them
const mockDb = { exportAllData: mockExportAllData };
const mockKey = {} as CryptoKey;

vi.mock('./useEncryptedDb', () => ({
  useEncryptedDb: () => ({ db: mockDb, isReady: true }),
}));

vi.mock('@contexts', () => ({
  useAuth: () => ({ encryptionKey: mockKey }),
}));

const STORAGE_PROVIDER_KEY = 'hemoio_storage_provider';

describe('useFilesystemSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(writeFolderCopy).mockResolvedValue(WRITTEN);
    mockGetPermissionState.mockResolvedValue('granted');
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
      expect(result.current.protection).toBeNull();
    });

    it.each(['empty', 'unreadable'] as const)(
      'reports why a sync held back (%s)',
      async (reason) => {
        vi.mocked(writeFolderCopy).mockResolvedValue({ status: 'protected', reason });

        const { result } = renderHook(() => useFilesystemSync());

        await waitFor(() => expect(result.current.protection).toBe(reason));
      }
    );

    it('stops reporting once a sync writes again', async () => {
      vi.mocked(writeFolderCopy).mockResolvedValueOnce({ status: 'protected', reason: 'empty' });
      const { result } = renderHook(() => useFilesystemSync());
      await waitFor(() => expect(result.current.protection).toBe('empty'));

      await act(() => result.current.syncNow());

      expect(result.current.protection).toBeNull();
    });

    it('keeps reporting while nothing has changed', async () => {
      vi.mocked(writeFolderCopy).mockResolvedValueOnce({ status: 'protected', reason: 'empty' });
      const { result } = renderHook(() => useFilesystemSync());
      await waitFor(() => expect(result.current.protection).toBe('empty'));
      vi.mocked(writeFolderCopy).mockResolvedValueOnce({ status: 'protected', reason: 'empty' });

      await act(() => result.current.syncNow());

      expect(result.current.protection).toBe('empty');
    });

    it('stops reporting once the folder can no longer be written', async () => {
      vi.mocked(writeFolderCopy).mockResolvedValueOnce({ status: 'protected', reason: 'unreadable' });
      const { result } = renderHook(() => useFilesystemSync());
      await waitFor(() => expect(result.current.protection).toBe('unreadable'));
      mockGetPermissionState.mockResolvedValue('prompt');

      await act(() => result.current.syncNow());

      expect(result.current.protection).toBeNull();
    });

    it('stops reporting once folder storage is switched off', async () => {
      vi.mocked(writeFolderCopy).mockResolvedValueOnce({ status: 'protected', reason: 'unreadable' });
      const { result } = renderHook(() => useFilesystemSync());
      await waitFor(() => expect(result.current.protection).toBe('unreadable'));
      localStorage.setItem(STORAGE_PROVIDER_KEY, 'local');

      await act(() => result.current.syncNow());

      expect(result.current.protection).toBeNull();
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
