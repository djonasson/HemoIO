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
  /** Why the last sync left the folder copy alone, or null while syncs write */
  protection: FolderProtectionReason | null;
} {
  const { db, isReady } = useEncryptedDb();
  const { encryptionKey } = useAuth();
  // Syncs run one after another: one asked for during another (an import
  // during the periodic sync) must still write, after it
  const queueRef = useRef<Promise<void>>(Promise.resolve());
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

    try {
      const provider = getProvider();
      // Without permission only a user action can help; Settings asks for it
      if ((await provider.getPermissionState()) !== 'granted') return;

      const outcome = await writeFolderCopy(provider, await db.exportAllData(), encryptionKey);
      setProtection(outcome.status === 'protected' ? outcome.reason : null);
    } catch (error) {
      console.error('Failed to sync to filesystem:', error);
    }
  }, [db, isReady, isFilesystemEnabled, getProvider, encryptionKey]);

  const syncNow = useCallback((): Promise<void> => {
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
    syncNow();

    // Set up an interval to sync periodically (as a backup)
    const intervalId = setInterval(() => {
      syncNow();
    }, 30000); // Sync every 30 seconds as a backup

    return () => {
      clearInterval(intervalId);
    };
  }, [db, isReady, isFilesystemEnabled, syncNow, encryptionKey]);

  return {
    syncNow,
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
