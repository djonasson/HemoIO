/**
 * Hook for syncing database to filesystem storage
 *
 * When filesystem storage is enabled, this hook automatically syncs
 * the IndexedDB data to the selected filesystem directory after changes.
 * A copy saved there by another computer is loaded when this browser
 * changed nothing since it last saw the folder; when both changed, the user
 * chooses, and the side not chosen is kept as a dated backup.
 */

import { useEffect, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { useEncryptedDb } from './useEncryptedDb';
import { useAuth } from '@contexts';
import { FileSystemStorageProvider } from '@data/storage/FileSystemStorageProvider';
import { onFolderAccessChanged } from '@data/storage/folderAccessEvents';
import {
  loadFolderSyncState,
  saveFolderSyncState,
  type FolderSyncState,
} from '@data/storage/folderSyncState';
import { isFolderStorageOn } from '@data/storage/storageChoice';
import { onSetAsideChanged } from '@data/db/setAsideEvents';
import {
  exportDigest,
  keepFolderBackup,
  markFolderCopySeen,
  sealFolderCopy,
  sealedForBackup,
  writeFolderCopy,
} from '@services/sync';
import { withWebLock } from '@/utils/withWebLock';
import { formatDateTime } from '@/utils/formatDateTime';
import type { EncryptedDb } from '@data/db/encryptedDb';
import type { ParsedBackupData } from '@services/import';
import type {
  FolderCopyStore,
  FolderProtectionReason,
  FolderSide,
  FolderSyncOutcome,
} from '@services/sync';

/** The notice that this browser took on a password changed on another computer */
const FOLDER_LOCK_ADOPTED_NOTICE_ID = 'folder-lock-adopted';

/** Syncs, and the choices that write to the folder, run one at a time across this origin's tabs */
const FOLDER_SYNC_LOCK = 'hemoio-folder-sync';

/** What the user is told about the folder sync: why it held back, or that it failed */
export type FolderSyncIssue = FolderProtectionReason | 'failed';

/** Both the folder copy and this browser changed: what the user is shown to choose */
export interface FolderConflict {
  folder: FolderSide;
  browser: FolderSide;
  folderName: string | null;
}

/** Load the folder copy, keep this browser's data, or hold syncs for the session */
export type FolderConflictChoice = 'folder' | 'browser' | 'later';

export interface UseFilesystemSyncOptions {
  /**
   * False holds every write, the first one and the periodic ones, until the
   * user has decided what happens to the copy in the folder. Default true.
   */
  enabled?: boolean;
  /**
   * Replace this browser's data with a folder copy and reload what shows it.
   * Runs inside a sync, which holds the folder-sync lock: it must never wait
   * for another sync (syncNow), which would wait for it in turn.
   */
  applyFolderCopy: (data: ParsedBackupData) => Promise<void>;
}

interface SyncSession {
  db: EncryptedDb;
  key: CryptoKey;
}

/** A conflict waiting for the user: the copy and its bytes as the sync found them */
interface PendingConflict {
  session: SyncSession;
  copy: ParsedBackupData;
  revision: string | null;
  bytes: ArrayBuffer;
}

type ChangedElsewhere = Extract<FolderSyncOutcome, { status: 'changed-elsewhere' }>;

/** Thrown by a save the hold stopped: the sync ends without a word, as one never started would */
class SyncHeld extends Error {}

/**
 * Hook that syncs database changes to the filesystem when filesystem storage is enabled
 */
export function useFilesystemSync({ enabled = true, applyFolderCopy }: UseFilesystemSyncOptions): {
  /** Sync now; rejects when the sync fails */
  syncNow: () => Promise<void>;
  /** Why the last sync left the folder copy alone or failed; null while syncs write or are held */
  issue: FolderSyncIssue | null;
  /** Both sides changed: what the user is asked; null otherwise */
  conflict: FolderConflict | null;
  /** Syncs wait for the user's choice, or for the next session after "Decide later" */
  held: boolean;
  /**
   * Carry out the user's choice. Rejects when the backup of the side not
   * chosen cannot be saved; nothing is replaced then, and the question stays.
   */
  resolveConflict: (choice: FolderConflictChoice) => Promise<void>;
  /** Record a folder copy restored into this browser as seen, so its next sync finds no conflict */
  acknowledgeFolderCopy: (revision: string | null) => Promise<void>;
} {
  const { db, isReady } = useEncryptedDb();
  const { encryptionKey, storedLock, adoptFolderLock } = useAuth();
  // Read when a sync starts, as the session is: the lock it writes is the one
  // stored then, and the folder's lock is adopted through the latest callback
  const lockRef = useRef(storedLock);
  const adoptRef = useRef(adoptFolderLock);
  const applyRef = useRef(applyFolderCopy);
  // A restore is acknowledged while syncs are held, when no session is set
  const unlockedRef = useRef<SyncSession | null>(null);
  useLayoutEffect(() => {
    lockRef.current = storedLock;
    adoptRef.current = adoptFolderLock;
    applyRef.current = applyFolderCopy;
    unlockedRef.current = db && isReady && encryptionKey ? { db, key: encryptionKey } : null;
  }, [storedLock, adoptFolderLock, applyFolderCopy, db, isReady, encryptionKey]);
  // Read when a sync starts, not when it was asked for: a sync waiting when
  // the app locks must find no key, rather than one kept from before
  const sessionRef = useRef<SyncSession | null>(null);
  // Syncs run one after another: one asked for during another (an import
  // during the periodic sync) must still write, after it. Any number asked
  // for meanwhile share one: each exports the data as it is when it starts.
  const lastRef = useRef<Promise<void>>(Promise.resolve());
  const waitingRef = useRef<Promise<void> | null>(null);
  const [issue, setIssue] = useState<FolderSyncIssue | null>(null);
  // Kept with the key of the session they belong to: a new unlock is a new
  // key, and starts with no question and no hold
  const [asked, setAsked] = useState<{ key: CryptoKey; conflict: FolderConflict } | null>(null);
  const heldForRef = useRef<CryptoKey | null>(null);
  const [heldFor, setHeldFor] = useState<CryptoKey | null>(null);
  const pendingRef = useRef<PendingConflict | null>(null);
  // Held, the folder is looked at again: what the last sync found no longer applies
  if (!enabled && issue !== null) setIssue(null);
  // A ref, so a sync asked for before the hold began is held too. Set before
  // the effects below run, so the sync a hold's end starts sees it ended.
  const enabledRef = useRef(enabled);
  useLayoutEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const holdFor = useCallback((key: CryptoKey | null) => {
    heldForRef.current = key;
    setHeldFor(key);
  }, []);

  /** Load a copy written elsewhere, unless this browser changed something while it was read */
  const loadNewerCopy = useCallback(
    async (session: SyncSession, outcome: ChangedElsewhere, lastSeen: FolderSyncState) => {
      // An import saved while the folder copy was decrypted would be lost: the next sync asks instead
      if ((await exportDigest(session.db)) !== lastSeen.digest) return;
      if (sessionRef.current !== session || !enabledRef.current) return;
      await applyRef.current(outcome.copy);
      await markFolderCopySeen(session.db, session.key, outcome.revision);
      const { exportedAt } = outcome.copy;
      notifications.show({
        title: 'Updated from the folder',
        // A copy whose date cannot be read is loaded all the same
        message: Number.isNaN(exportedAt.getTime())
          ? 'Loaded the copy saved on your other computer.'
          : `Saved on ${formatDateTime(exportedAt)}`,
      });
    },
    []
  );

  /** One sync, run while holding the folder-sync lock; `replaces` is the revision the user chose to replace */
  const syncOnce = useCallback(
    async (session: SyncSession, replaces?: string | null) => {
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
        const lastSeen = await loadFolderSyncState(session.key);
        const store: FolderCopyStore = {
          loadCurrent: () => provider.loadCurrent(),
          loadPrevious: () => provider.loadPrevious(),
          save: (bytes, previous) =>
            enabledRef.current ? provider.save(bytes, previous) : Promise.reject(new SyncHeld()),
        };
        const outcome = await writeFolderCopy(store, data, session.key, {
          lock: lockRef.current,
          setAsideUnsaved: unsaved,
          lastSeen,
          ...(replaces !== undefined && { replaces }),
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

        switch (outcome.status) {
          case 'written':
          case 'unchanged': {
            const { state } = outcome;
            // Saved again only when it changed: every save is a new ciphertext in localStorage
            if (state.revision !== lastSeen?.revision || state.digest !== lastSeen.digest) {
              await saveFolderSyncState(state, session.key);
            }
            setIssue(null);
            return;
          }
          case 'protected':
            setIssue(outcome.reason);
            return;
          case 'changed-elsewhere':
            setIssue(null);
            if (!enabledRef.current || sessionRef.current !== session) return;
            if (!outcome.localChanged && lastSeen) {
              await loadNewerCopy(session, outcome, lastSeen);
              return;
            }
            pendingRef.current = {
              session,
              copy: outcome.copy,
              revision: outcome.revision,
              bytes: outcome.bytes,
            };
            holdFor(session.key);
            setAsked({
              key: session.key,
              conflict: {
                folder: outcome.folder,
                browser: outcome.browser,
                folderName: await provider.getDirectoryName(),
              },
            });
        }
      } catch (error) {
        if (error instanceof SyncHeld) return;
        // Fixed text: the error could name stored data
        console.error('Failed to sync to the folder');
        setIssue('failed');
        throw error;
      }
    },
    [holdFor, loadNewerCopy]
  );

  const runSync = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !enabledRef.current) return;
    // Waiting for the user's choice, or held after "Decide later"
    if (heldForRef.current === session.key) return;
    // Nothing is held back when nothing is synced, so no notice either
    if (!isFolderStorageOn()) {
      setIssue(null);
      return;
    }
    await withWebLock(FOLDER_SYNC_LOCK, () => syncOnce(session));
  }, [syncOnce]);

  /** Runs `task` after the syncs already asked for, holding the folder-sync lock */
  const afterSyncs = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const next = lastRef.current.then(() => withWebLock(FOLDER_SYNC_LOCK, task));
    lastRef.current = next.then(
      () => undefined,
      () => undefined
    );
    return next;
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

  const resolveConflict = useCallback(
    async (choice: FolderConflictChoice): Promise<void> => {
      const pending = pendingRef.current;
      // A question from a session that has ended is no longer shown
      if (!pending || pending.session.key !== sessionRef.current?.key) return;
      if (choice === 'later') {
        // Syncs stay held for the session, as after "Not now"
        pendingRef.current = null;
        setAsked(null);
        return;
      }
      const { session } = pending;
      const resolved = (): void => {
        pendingRef.current = null;
        setAsked(null);
        holdFor(null);
      };

      await afterSyncs(async () => {
        const provider = new FileSystemStorageProvider();
        if (choice === 'folder') {
          // This browser's data first, as a dated backup: if that fails, nothing is replaced
          const { bytes } = await sealFolderCopy(await session.db.exportAllData(), session.key, null);
          await keepFolderBackup(provider, bytes);
          resolved();
          try {
            await applyRef.current(pending.copy);
            await markFolderCopySeen(session.db, session.key, pending.revision);
          } catch {
            // Fixed text: the error could name stored data. Both sides are as
            // they were, so the next sync asks again.
            console.error('Failed to load the folder copy');
            setIssue('failed');
          }
          return;
        }
        // The folder copy, as it was when the user was asked, without its lock
        await keepFolderBackup(provider, await sealedForBackup(pending.bytes, session.key));
        resolved();
        // Writes over only the copy the user saw; a newer one asks again.
        // A failure is told by the sync, as for every sync.
        await syncOnce(session, pending.revision).catch(() => undefined);
      });
    },
    [afterSyncs, holdFor, syncOnce]
  );

  const acknowledgeFolderCopy = useCallback(
    async (revision: string | null): Promise<void> => {
      const session = unlockedRef.current;
      if (!session) return;
      await afterSyncs(() => markFolderCopySeen(session.db, session.key, revision));
    },
    [afterSyncs]
  );

  // Folder access granted again, or another folder chosen: the question is
  // about a folder no longer in view, and syncs held after it look again
  useEffect(
    () =>
      onFolderAccessChanged(() => {
        pendingRef.current = null;
        setAsked(null);
        holdFor(null);
      }),
    [holdFor]
  );

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
    conflict: asked && asked.key === encryptionKey ? asked.conflict : null,
    held: heldFor !== null && heldFor === encryptionKey,
    resolveConflict,
    acknowledgeFolderCopy,
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
