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
import { onFolderAccessChanged } from '@data/storage/folderAccessEvents';
import { isFolderStorageOn } from '@data/storage/storageChoice';
import { encrypt } from '@data/encryption';
import { SYNC_FILE_VERSION } from '@services/sync';

export interface UseFilesystemSyncOptions {
  /**
   * False holds every write, the first one and the periodic ones, until the
   * user has decided what happens to the copy in the folder. Default true.
   */
  enabled?: boolean;
}

/**
 * Hook that syncs database changes to the filesystem when filesystem storage is enabled
 */
export function useFilesystemSync({ enabled = true }: UseFilesystemSyncOptions = {}): {
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
  // A ref, so a sync asked for before the hold began is held too
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // The provider keeps the folder it first opened: another folder needs a new one
  useEffect(
    () =>
      onFolderAccessChanged(() => {
        providerRef.current = null;
      }),
    []
  );

  // Check if filesystem storage is enabled
  const isFilesystemEnabled = useCallback(() => isFolderStorageOn(), []);

  // Get or create the storage provider
  const getProvider = useCallback(() => {
    if (!providerRef.current) {
      providerRef.current = new FileSystemStorageProvider();
    }
    return providerRef.current;
  }, []);

  // Sync data to filesystem
  const syncToFilesystem = useCallback(async () => {
    if (!db || !isReady || !isFilesystemEnabled() || !encryptionKey || !enabledRef.current) {
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
        version: SYNC_FILE_VERSION,
        exportedAt: new Date().toISOString(),
        data: exportData,
      });
      const encoder = new TextEncoder();
      const plainData = encoder.encode(jsonString);

      // Encrypt the data before saving
      const encryptedData = await encrypt(plainData.buffer, encryptionKey);

      // The hold may have begun while this sync was under way
      if (!enabledRef.current) return;

      // Save encrypted data to filesystem
      await provider.save(encryptedData);

      lastSyncTimeRef.current = new Date();
    } catch (error) {
      console.error('Failed to sync to filesystem:', error);
      syncErrorRef.current = error instanceof Error ? error.message : 'Sync failed';
    } finally {
      isSyncingRef.current = false;
    }
  }, [db, isReady, isFilesystemEnabled, getProvider, encryptionKey]);

  // Set up periodic sync when filesystem storage is enabled
  useEffect(() => {
    if (!db || !isReady || !isFilesystemEnabled() || !encryptionKey || !enabled) {
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
  }, [db, isReady, isFilesystemEnabled, syncToFilesystem, encryptionKey, enabled]);

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
