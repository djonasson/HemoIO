/**
 * Tests for useFilesystemSync hook
 *
 * Tests the filesystem sync functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
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

vi.mock('@data/storage/FileSystemStorageProvider', () => ({
  FileSystemStorageProvider: class MockFileSystemStorageProvider {
    save = mockSave;
    getPermissionState = mockGetPermissionState;
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
});
