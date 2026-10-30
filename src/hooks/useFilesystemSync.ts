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
import type { EncryptedDb } from '@data/db/encryptedDb';
import type { FolderProtectionReason } from '@services/sync';

const STORAGE_PROVIDER_KEY = 'hemoio_storage_provider';

/**
 * Hook that syncs database changes to the filesystem when filesystem storage is enabled
 */
function isFilesystemEnabled(): boolean {
  return (
    isFileSystemAccessSupported() && localStorage.getItem(STORAGE_PROVIDER_KEY) === 'filesystem'
  );
}

interface SyncSession {
  db: EncryptedDb;
  key: CryptoKey;
}

/**
 * Hook that syncs database changes to the filesystem when filesystem storage is enabled
 */
export function useFilesystemSync(): {
  /** Sync now; rejects when the sync fails */
  syncNow: () => Promise<void>;
  /** Why the last sync left the folder copy alone, or null while syncs write */
  protection: FolderProtectionReason | null;
} {
  const { db, isReady } = useEncryptedDb();
  const { encryptionKey } = useAuth();
  // Read when a sync starts, not when it was asked for: a sync waiting when
  // the app locks must find no key, rather than one kept from before
  const sessionRef = useRef<SyncSession | null>(null);
  // Syncs run one after another: one asked for during another (an import
  // during the periodic sync) must still write, after it. Any number asked
  // for meanwhile share one: each exports the data as it is when it starts.
  const lastRef = useRef<Promise<void>>(Promise.resolve());
  const waitingRef = useRef<Promise<void> | null>(null);
  const [protection, setProtection] = useState<FolderProtectionReason | null>(null);

  const runSync = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    // Nothing is held back when nothing is synced, so no notice either
    if (!isFilesystemEnabled()) {
      setProtection(null);
      return;
    }

    try {
      // Created afresh, so a folder just chosen in Settings is the one written
      const provider = new FileSystemStorageProvider();
      // Without permission only a user action can help; Settings asks for it
      if ((await provider.getPermissionState()) !== 'granted') {
        setProtection(null);
        return;
      }

      const outcome = await writeFolderCopy(provider, await session.db.exportAllData(), session.key);
      setProtection(outcome.status === 'protected' ? outcome.reason : null);
    } catch (error) {
      console.error('Failed to sync to filesystem:', error);
      throw error;
    }
  }, []);

  const syncNow = useCallback((): Promise<void> => {
    if (waitingRef.current) return waitingRef.current;
    const next = lastRef.current.then(() => {
      waitingRef.current = null;
      return runSync();
    });
    waitingRef.current = next;
    // A failed sync is its caller's to handle; the next one still runs
    lastRef.current = next.catch(() => undefined);
    return next;
  }, [runSync]);

  // Sync on unlock and every 30 seconds as a backup. Whether folder storage
  // is on is checked at each sync, so switching it on in Settings takes effect.
  useEffect(() => {
    if (!db || !isReady || !encryptionKey) {
      return;
    }
    sessionRef.current = { db, key: encryptionKey };

    // Failures are logged by the sync; a periodic one has no one else to tell
    const syncInBackground = (): void => {
      syncNow().catch(() => undefined);
    };
    syncInBackground();
    const intervalId = setInterval(syncInBackground, 30000);

    return () => {
      sessionRef.current = null;
      clearInterval(intervalId);
    };
  }, [db, isReady, syncNow, encryptionKey]);

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
