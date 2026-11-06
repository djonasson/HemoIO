/**
 * Hook for syncing database to filesystem storage
 *
 * When filesystem storage is enabled, this hook automatically syncs
 * the IndexedDB data to the selected filesystem directory after changes.
 */

import { useEffect, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { useEncryptedDb } from './useEncryptedDb';
import { useAuth } from '@contexts';
import { FileSystemStorageProvider } from '@data/storage/FileSystemStorageProvider';
import { isFolderStorageOn } from '@data/storage/storageChoice';
import { onSetAsideChanged } from '@data/db/setAsideEvents';
import { writeFolderCopy } from '@services/sync';
import type { EncryptedDb } from '@data/db/encryptedDb';
import type { FolderCopyStore, FolderProtectionReason } from '@services/sync';

/** The notice that this browser took on a password changed on another computer */
const FOLDER_LOCK_ADOPTED_NOTICE_ID = 'folder-lock-adopted';

/** What the user is told about the folder sync: why it held back, or that it failed */
export type FolderSyncIssue = FolderProtectionReason | 'failed';

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

/** Thrown by a save the hold stopped: the sync ends without a word, as one never started would */
class SyncHeld extends Error {}

/**
 * Hook that syncs database changes to the filesystem when filesystem storage is enabled
 */
export function useFilesystemSync({ enabled = true }: UseFilesystemSyncOptions = {}): {
  /** Sync now; rejects when the sync fails */
  syncNow: () => Promise<void>;
  /** Why the last sync left the folder copy alone or failed; null while syncs write or are held */
  issue: FolderSyncIssue | null;
} {
  const { db, isReady } = useEncryptedDb();
  const { encryptionKey, storedLock, adoptFolderLock } = useAuth();
  // Read when a sync starts, as the session is: the lock it writes is the one
  // stored then, and the folder's lock is adopted through the latest callback
  const lockRef = useRef(storedLock);
  const adoptRef = useRef(adoptFolderLock);
  useLayoutEffect(() => {
    lockRef.current = storedLock;
    adoptRef.current = adoptFolderLock;
  }, [storedLock, adoptFolderLock]);
  // Read when a sync starts, not when it was asked for: a sync waiting when
  // the app locks must find no key, rather than one kept from before
  const sessionRef = useRef<SyncSession | null>(null);
  // Syncs run one after another: one asked for during another (an import
  // during the periodic sync) must still write, after it. Any number asked
  // for meanwhile share one: each exports the data as it is when it starts.
  const lastRef = useRef<Promise<void>>(Promise.resolve());
  const waitingRef = useRef<Promise<void> | null>(null);
  const [issue, setIssue] = useState<FolderSyncIssue | null>(null);
  // Held, the folder is looked at again: what the last sync found no longer applies
  if (!enabled && issue !== null) setIssue(null);
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
      setIssue(null);
      return;
    }

    try {
      // Created afresh, so a folder just chosen in Settings is the one written
      const provider = new FileSystemStorageProvider();
      // Without permission only a user action can help; Settings asks for it
      if ((await provider.getPermissionState()) !== 'granted') {
        setIssue(null);
        return;
      }

      const data = await session.db.exportAllData();
      const { unsaved } = await session.db.countSetAside();
      // The hold may begin while this sync is under way: checked here, so a
      // held sync does not decrypt the folder copy, and again at the save
      if (!enabledRef.current) return;
      const store: FolderCopyStore = {
        loadCurrent: () => provider.loadCurrent(),
        loadPrevious: () => provider.loadPrevious(),
        save: (bytes, previous) =>
          enabledRef.current ? provider.save(bytes, previous) : Promise.reject(new SyncHeld()),
      };
      const outcome = await writeFolderCopy(store, data, session.key, {
        lock: lockRef.current,
        setAsideUnsaved: unsaved,
      });
      // A password changed on another computer: adopted when later than this
      // one's, and only for the session whose key opened the copy
      if (outcome.folderLock && sessionRef.current === session && adoptRef.current(outcome.folderLock)) {
        notifications.show({
          id: FOLDER_LOCK_ADOPTED_NOTICE_ID,
          title: 'Password changed on another computer',
          message: 'Use the new password the next time you unlock HemoIO.',
          autoClose: false,
        });
      }
      setIssue(outcome.status === 'protected' ? outcome.reason : null);
    } catch (error) {
      if (error instanceof SyncHeld) return;
      // Fixed text: the error could name stored data
      console.error('Failed to sync to the folder');
      setIssue('failed');
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
    // A download or delete of unreadable records ends the pause: sync at
    // once, not at the next tick. syncNow shares a sync already waiting.
    const stopListening = onSetAsideChanged(() => {
      if (isFolderStorageOn()) syncInBackground();
    });

    return () => {
      stopListening();
      sessionRef.current = null;
      clearInterval(intervalId);
    };
  }, [db, isReady, syncNow, encryptionKey, enabled]);

  // A password change syncs at once, so the new lock reaches the folder. Keyed
  // by the salt, new with every lock: unlocking reads the same lock afresh.
  const lockSalt = storedLock?.kekSalt ?? null;
  const syncedSaltRef = useRef(lockSalt);
  useEffect(() => {
    if (syncedSaltRef.current === lockSalt) return;
    syncedSaltRef.current = lockSalt;
    if (sessionRef.current && isFolderStorageOn()) syncNow().catch(() => undefined);
  }, [lockSalt, syncNow]);

  return {
    syncNow,
    issue,
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
