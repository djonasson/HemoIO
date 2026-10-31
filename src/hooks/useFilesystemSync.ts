/**
 * Hook for syncing database to filesystem storage
 *
 * When filesystem storage is enabled, this hook automatically syncs
 * the IndexedDB data to the selected filesystem directory after changes.
 */

import { useEffect, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useEncryptedDb } from './useEncryptedDb';
import { useAuth } from '@contexts';
import { FileSystemStorageProvider } from '@data/storage/FileSystemStorageProvider';
import { isFolderStorageOn } from '@data/storage/storageChoice';
import { writeFolderCopy } from '@services/sync';
import type { EncryptedDb } from '@data/db/encryptedDb';
import type { FolderProtectionReason } from '@services/sync';

export interface UseFilesystemSyncOptions {
  /**
   * False holds every write, the first one and the periodic ones, until the
   * user has decided what happens to the copy in the folder. Default true.
   */
  enabled?: boolean;
}

interface SyncSession {
  db: EncryptedDb;
  key: CryptoKey;
}

/**
 * Hook that syncs database changes to the filesystem when filesystem storage is enabled
 */
export function useFilesystemSync({ enabled = true }: UseFilesystemSyncOptions = {}): {
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
  // A ref, so a sync asked for before the hold began is held too. Set before
  // the effects below run, so the sync a hold's end starts sees it ended.
  const enabledRef = useRef(enabled);
  useLayoutEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const runSync = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !enabledRef.current) return;
    // Nothing is held back when nothing is synced, so no notice either
    if (!isFolderStorageOn()) {
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

      const data = await session.db.exportAllData();
      // The hold may have begun while this sync was under way
      if (!enabledRef.current) return;
      const outcome = await writeFolderCopy(provider, data, session.key);
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
  // A hold ending syncs at once.
  useEffect(() => {
    if (!db || !isReady || !encryptionKey || !enabled) {
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
  }, [db, isReady, syncNow, encryptionKey, enabled]);

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
