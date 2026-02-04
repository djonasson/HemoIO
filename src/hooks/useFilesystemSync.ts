/**
 * Hook for syncing database to filesystem storage
 *
 * When filesystem storage is enabled, this hook automatically syncs
 * the IndexedDB data to the selected filesystem directory after changes.
 */

import { useEffect, useCallback, useRef } from 'react';
import { useEncryptedDb } from './useEncryptedDb';
import { useAuth } from '@contexts';
import { FileSystemStorageProvider } from '@data/storage/FileSystemStorageProvider';
import { isFileSystemAccessSupported } from '@/utils/fileSystemSupport';
import { encrypt } from '@data/encryption';

const STORAGE_PROVIDER_KEY = 'hemoio_storage_provider';

/**
 * Hook that syncs database changes to the filesystem when filesystem storage is enabled
 */
export function useFilesystemSync(): {
  syncNow: () => Promise<void>;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  syncError: string | null;
} {
  const { db, isReady } = useEncryptedDb();
  const { encryptionKey } = useAuth();
  const isSyncingRef = useRef(false);
  const lastSyncTimeRef = useRef<Date | null>(null);
  const syncErrorRef = useRef<string | null>(null);
  const providerRef = useRef<FileSystemStorageProvider | null>(null);

  // Check if filesystem storage is enabled
  const isFilesystemEnabled = useCallback(() => {
    if (!isFileSystemAccessSupported()) return false;
    const provider = localStorage.getItem(STORAGE_PROVIDER_KEY);
    return provider === 'filesystem';
  }, []);

  // Get or create the storage provider
  const getProvider = useCallback(() => {
    if (!providerRef.current) {
      providerRef.current = new FileSystemStorageProvider();
    }
    return providerRef.current;
  }, []);

  // Sync data to filesystem
  const syncToFilesystem = useCallback(async () => {
    if (!db || !isReady || !isFilesystemEnabled() || !encryptionKey) {
      return;
    }

    if (isSyncingRef.current) {
      return;
    }

    isSyncingRef.current = true;
    syncErrorRef.current = null;

    try {
      const provider = getProvider();

      // Check permission
      const permissionState = await provider.getPermissionState();
      if (permissionState !== 'granted') {
        // Can't sync without permission - will need user action
        syncErrorRef.current = 'Permission required to sync to filesystem';
        return;
      }

      // Export all data from the encrypted database
      const exportData = await db.exportAllData();

      // Convert to JSON and then to ArrayBuffer
      const jsonString = JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        data: exportData,
      });
      const encoder = new TextEncoder();
      const plainData = encoder.encode(jsonString);

      // Encrypt the data before saving
      const encryptedData = await encrypt(plainData.buffer, encryptionKey);

      // Save encrypted data to filesystem
      await provider.save(encryptedData);

      lastSyncTimeRef.current = new Date();
      console.log('Synced encrypted data to filesystem at', lastSyncTimeRef.current);
    } catch (error) {
      console.error('Failed to sync to filesystem:', error);
      syncErrorRef.current = error instanceof Error ? error.message : 'Sync failed';
    } finally {
      isSyncingRef.current = false;
    }
  }, [db, isReady, isFilesystemEnabled, getProvider, encryptionKey]);

  // Set up periodic sync when filesystem storage is enabled
  useEffect(() => {
    if (!db || !isReady || !isFilesystemEnabled() || !encryptionKey) {
      return;
    }

    // Initial sync when filesystem storage is enabled
    syncToFilesystem();

    // Set up an interval to sync periodically (as a backup)
    const intervalId = setInterval(() => {
      syncToFilesystem();
    }, 30000); // Sync every 30 seconds as a backup

    return () => {
      clearInterval(intervalId);
    };
  }, [db, isReady, isFilesystemEnabled, syncToFilesystem, encryptionKey]);

  // Expose sync function for manual triggering
  const syncNow = useCallback(async () => {
    await syncToFilesystem();
  }, [syncToFilesystem]);

  return {
    syncNow,
    isSyncing: isSyncingRef.current,
    lastSyncTime: lastSyncTimeRef.current,
    syncError: syncErrorRef.current,
  };
}

/**
 * Trigger a filesystem sync from outside React components
 * This is used by EncryptedDb after write operations
 */
let globalSyncCallback: (() => void) | null = null;

export function setGlobalSyncCallback(callback: (() => void) | null): void {
  globalSyncCallback = callback;
}

export function triggerGlobalSync(): void {
  if (globalSyncCallback) {
    globalSyncCallback();
  }
}
