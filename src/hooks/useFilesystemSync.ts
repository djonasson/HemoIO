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
import { isFolderStorageOn } from '@data/storage/storageChoice';
import { onSetAsideChanged } from '@data/db/setAsideEvents';
import {
  folderCopyId,
  keepBrowserData,
  keepCurrentFolderCopy,
  keepFolderCopy,
  markFolderCopySeen,
} from '@services/sync';
import {
  loadNewerFolderCopy,
  recordFolderCopySeen,
  runFolderSync,
  type SyncSession,
} from '@services/sync/folderSyncRun';
import { FOLDER_SYNC_LOCK, withWebLock } from '@/utils/withWebLock';
import { formatDateTime } from '@/utils/formatDateTime';
import type { ParsedBackupData } from '@services/import';
import type { FolderProtectionReason, FolderSide } from '@services/sync';

/** The notice that this browser took on a password changed on another computer */
const FOLDER_LOCK_ADOPTED_NOTICE_ID = 'folder-lock-adopted';


/** What the user is told about the folder sync: why it held back, or that it failed */
export type FolderSyncIssue = FolderProtectionReason | 'failed';

/**
 * What the user is shown to choose: both the folder copy and this browser
 * changed (`both-changed`), or this browser changed nothing but the folder
 * copy is not a newer version of the one it last saw (`not-newer`)
 */
export interface FolderConflict {
  reason: 'both-changed' | 'not-newer';
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
   * Given a stamp (EncryptedDb.storedDataStamp), only while the stored data
   * is as stamped: resolves false, replacing nothing, when it changed.
   * Runs inside a sync, which holds the folder-sync lock: it must never wait
   * for another sync (syncNow), which would wait for it in turn.
   */
  applyFolderCopy: (data: ParsedBackupData, unchangedSince?: string) => Promise<boolean>;
}

/** A conflict waiting for the user: the copy and its bytes as the sync found them */
interface PendingConflict {
  session: SyncSession;
  copy: ParsedBackupData;
  revision: string | null;
  bytes: ArrayBuffer;
}

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
  /**
   * "Replace folder copy" from the restore question: keeps the copy in the
   * folder as a backup, then the next sync writes over it without asking.
   * Rejects, keeping nothing chosen, when the backup cannot be saved.
   */
  replaceFolderCopy: (revision: string | null) => Promise<void>;
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
  // The copy the user chose to replace from the restore question, for the
  // next sync of the session it was chosen in
  const replaceNextRef = useRef<{ key: CryptoKey; id: string } | null>(null);
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

        const run = await runFolderSync(session, provider, {
          lock: lockRef.current,
          takeReplaces: () => {
            // Taken once: a later sync asks again rather than replace another copy
            const chosen = replaceNextRef.current;
            replaceNextRef.current = null;
            return replaces ?? (chosen?.key === session.key ? chosen.id : undefined);
          },
          isEnabled: () => enabledRef.current,
        });
        if (!run) return;
        const { outcome, lastSeen } = run;
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
          case 'unchanged':
            await recordFolderCopySeen(outcome.state, lastSeen, session.key);
            setIssue(null);
            return;
          case 'protected':
            setIssue(outcome.reason);
            return;
          case 'changed-elsewhere':
            setIssue(null);
            if (!enabledRef.current || sessionRef.current !== session) return;
            if (outcome.reason === 'newer' && lastSeen) {
              await loadNewerFolderCopy(session, provider, outcome, lastSeen, {
                apply: (copy, stamp) => applyRef.current(copy, stamp),
                isCurrent: () => sessionRef.current === session && enabledRef.current,
                onLoaded: () => {
                  const { exportedAt } = outcome.copy;
                  notifications.show({
                    title: 'Updated from the folder',
                    // A copy whose date cannot be read is loaded all the same
                    message: Number.isNaN(exportedAt.getTime())
                      ? 'Loaded the copy saved on your other computer.'
                      : `Saved on ${formatDateTime(exportedAt)}`,
                  });
                },
              });
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
                reason: outcome.reason === 'not-newer' ? 'not-newer' : 'both-changed',
                folder: outcome.folder,
                browser: outcome.browser,
                folderName: await provider.getDirectoryName(),
              },
            });
        }
      } catch (error) {
        // Fixed text: the error could name stored data
        console.error('Failed to sync to the folder');
        setIssue('failed');
        throw error;
      }
    },
    [holdFor]
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
        // Locked, or unlocked afresh, while earlier syncs ran: the choice
        // belongs to a session that has ended, and nothing is saved or loaded
        if (sessionRef.current?.key !== session.key || pendingRef.current !== pending) return;
        const provider = new FileSystemStorageProvider();
        const backups = { db: session.db, key: session.key, backups: provider };
        if (choice === 'folder') {
          // This browser's data first, as a dated backup: if that fails, nothing is replaced
          await keepBrowserData(backups, { kind: 'conflict' });
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
        await keepFolderCopy(backups, pending.bytes);
        resolved();
        // Writes over only the copy the user saw; a newer one asks again.
        // A failure is told by the sync, as for every sync.
        const replaces = await folderCopyId(pending.bytes, pending.revision);
        await syncOnce(session, replaces).catch(() => undefined);
      });
    },
    [afterSyncs, holdFor, syncOnce]
  );

  const replaceFolderCopy = useCallback(
    async (revision: string | null): Promise<void> => {
      const session = unlockedRef.current;
      if (!session) throw new Error('HemoIO is locked');
      await afterSyncs(async () => {
        const provider = new FileSystemStorageProvider();
        const bytes = await keepCurrentFolderCopy({ key: session.key, backups: provider, folder: provider });
        const id = bytes && (await folderCopyId(bytes, revision));
        // Locked meanwhile: the choice was for a session that has ended
        if (unlockedRef.current?.key !== session.key) return;
        // The sync that the hold's end starts writes over the copy kept
        replaceNextRef.current = id === null ? null : { key: session.key, id };
      });
    },
    [afterSyncs]
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
        replaceNextRef.current = null;
        setAsked(null);
        holdFor(null);
      }),
    [holdFor]
  );

  // A choice to replace the folder copy holds for the session it was made in:
  // locking, or another session, drops it
  useEffect(
    () => () => {
      replaceNextRef.current = null;
    },
    [encryptionKey]
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
    replaceFolderCopy,
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
