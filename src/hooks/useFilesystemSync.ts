/**
 * Hook for syncing database to filesystem storage
 *
 * When filesystem storage is enabled, this hook automatically syncs
 * the IndexedDB data to the selected filesystem directory after changes.
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { useEncryptedDb } from './useEncryptedDb';
import { useAuth } from '@contexts';
import { FileSystemStorageProvider } from '@data/storage/FileSystemStorageProvider';
import { writeFolderCopy } from '@services/sync';
import { isFileSystemAccessSupported } from '@/utils/fileSystemSupport';
import type { FolderProtectionReason } from '@services/sync';

const STORAGE_PROVIDER_KEY = 'hemoio_storage_provider';

/**
 * Hook that syncs database changes to the filesystem when filesystem storage is enabled
 */
export function useFilesystemSync(): {
  syncNow: () => Promise<void>;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  syncError: string | null;
  /** Why the last sync left the folder copy alone, or null while syncs write */
  protection: FolderProtectionReason | null;
} {
  const { db, isReady } = useEncryptedDb();
  const { encryptionKey } = useAuth();
  const isSyncingRef = useRef(false);
  // Syncs run one after another: one asked for during another (an import
  // during the periodic sync) must still write, after it
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const lastSyncTimeRef = useRef<Date | null>(null);
  const syncErrorRef = useRef<string | null>(null);
  const providerRef = useRef<FileSystemStorageProvider | null>(null);
  const [protection, setProtection] = useState<FolderProtectionReason | null>(null);

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

  const runSync = useCallback(async () => {
    if (!db || !isReady || !isFilesystemEnabled() || !encryptionKey) {
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

      const outcome = await writeFolderCopy(provider, await db.exportAllData(), encryptionKey);
      if (outcome.status === 'protected') {
        setProtection(outcome.reason);
        return;
      }

      setProtection(null);
      lastSyncTimeRef.current = new Date();
    } catch (error) {
      console.error('Failed to sync to filesystem:', error);
      syncErrorRef.current = error instanceof Error ? error.message : 'Sync failed';
    } finally {
      isSyncingRef.current = false;
    }
  }, [db, isReady, isFilesystemEnabled, getProvider, encryptionKey]);

  const syncToFilesystem = useCallback((): Promise<void> => {
    const next = queueRef.current.then(runSync);
    queueRef.current = next;
    return next;
  }, [runSync]);

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
    protection,
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
