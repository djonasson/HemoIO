/**
 * Tests for useFilesystemSync hook
 *
 * Tests the filesystem sync functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { encrypt } from '@data/encryption';
import { notifyFolderAccessChanged } from '@data/storage/folderAccessEvents';
import { useFilesystemSync } from './useFilesystemSync';

// Mock file system support
vi.mock('@/utils/fileSystemSupport', () => ({
  isFileSystemAccessSupported: vi.fn(() => true),
}));

// Mock encryption - use a real-looking mock that returns encrypted data
vi.mock('@data/encryption', () => ({
  encrypt: vi.fn(async () => new ArrayBuffer(100)),
}));

// Storage provider mock
const mockSave = vi.fn().mockResolvedValue(undefined);
const mockGetPermissionState = vi.fn().mockResolvedValue('granted');

const providerCreated = vi.fn();

vi.mock('@data/storage/FileSystemStorageProvider', () => ({
  FileSystemStorageProvider: class MockFileSystemStorageProvider {
    save = mockSave;
    getPermissionState = mockGetPermissionState;
    constructor() {
      providerCreated();
    }
  },
}));

// Mock db
const mockExportAllData = vi.fn().mockResolvedValue({
  labResults: [],
  testValues: [],
  userNotes: [],
  settings: null,
  preferences: null,
});

vi.mock('./useEncryptedDb', () => ({
  useEncryptedDb: () => ({
    db: {
      exportAllData: mockExportAllData,
    },
    isReady: true,
  }),
}));

// Mock auth context
vi.mock('@contexts', () => ({
  useAuth: () => ({
    encryptionKey: {} as CryptoKey,
  }),
}));

const STORAGE_PROVIDER_KEY = 'hemoio_storage_provider';

describe('useFilesystemSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('hook interface', () => {
    it('should return syncNow function', () => {
      const { result } = renderHook(() => useFilesystemSync());

      expect(result.current.syncNow).toBeDefined();
      expect(typeof result.current.syncNow).toBe('function');
    });

    it('should return isSyncing state', () => {
      const { result } = renderHook(() => useFilesystemSync());

      expect(result.current.isSyncing).toBeDefined();
      expect(typeof result.current.isSyncing).toBe('boolean');
    });

    it('should return lastSyncTime state', () => {
      const { result } = renderHook(() => useFilesystemSync());

      expect(result.current).toHaveProperty('lastSyncTime');
    });

    it('should return syncError state', () => {
      const { result } = renderHook(() => useFilesystemSync());

      expect(result.current).toHaveProperty('syncError');
    });
  });

  describe('filesystem enabled check', () => {
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

  describe('sync file format', () => {
    it('writes the current format version, which matches backup schema 3', async () => {
      localStorage.setItem(STORAGE_PROVIDER_KEY, 'filesystem');

      renderHook(() => useFilesystemSync());

      await waitFor(() => expect(mockSave).toHaveBeenCalled());
      const plain = vi.mocked(encrypt).mock.calls[0][0] as ArrayBuffer;
      const file = JSON.parse(new TextDecoder().decode(plain));
      expect(file.version).toBe(3);
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
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('syncs as soon as it is enabled', async () => {
      const { rerender } = renderHook(({ enabled }) => useFilesystemSync({ enabled }), {
        initialProps: { enabled: false },
      });
      expect(mockSave).not.toHaveBeenCalled();

      rerender({ enabled: true });

      await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    });

    it('a sync already asked for does not write once it is no longer enabled', async () => {
      const { result, rerender } = renderHook(({ enabled }) => useFilesystemSync({ enabled }), {
        initialProps: { enabled: true },
      });
      await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
      const syncNow = result.current.syncNow;

      rerender({ enabled: false });
      await act(() => syncNow());

      expect(mockSave).toHaveBeenCalledTimes(1);
    });
  });

  it('writes to the folder chosen since, not the one it first opened', async () => {
    localStorage.setItem(STORAGE_PROVIDER_KEY, 'filesystem');
    const { result } = renderHook(() => useFilesystemSync());
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    const before = providerCreated.mock.calls.length;

    act(() => notifyFolderAccessChanged());
    await act(() => result.current.syncNow());

    expect(providerCreated.mock.calls.length).toBe(before + 1);
  });
});
