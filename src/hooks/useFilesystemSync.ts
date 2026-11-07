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
import { showPersistentNotice } from '@components/common/showPersistentNotice';
import { notifyFolderSyncPaused } from '@components/storage/notifyFolderSyncPaused';
import { useEncryptedDb } from './useEncryptedDb';
import { useAuth } from '@contexts';
import { currentFolder } from '@data/storage/StorageProviderFactory';
import { onFolderAccessChanged } from '@data/storage/folderAccessEvents';
import { isFolderStorageOn } from '@data/storage/storageChoice';
import { onSetAsideChanged } from '@data/db/setAsideEvents';
import {
  folderCopyId,
  keepBrowserData,
  keepCurrentFolderCopy,
  keepFolderCopy,
  keepFolderFilesBeforeReplace,
  markFolderCopySeen,
} from '@services/sync';
import {
  loadNewerFolderCopy,
  recordFolderCopySeen,
  runFolderSync,
  type ReplacementToTake,
  type SyncSession,
} from '@services/sync/folderSyncRun';
import { isNothingToKeep, sealLockIntoFolderCopy, type FolderSyncOutcome } from '@services/sync/folderSync';
import { setFolderLockPush } from '@services/sync/folderLockPush';
import { loadStoredCredentials } from '@contexts/credentialsStorage';
import { isCredentialsV2, isLaterLock, type StoredCredentialsV2 } from '@data/encryption/keyWrapping';
import { FOLDER_SYNC_LOCK } from '@/utils/locks';
import { withWebLock } from '@/utils/withWebLock';
import { formatDateTime } from '@/utils/formatDateTime';
import { logFailure } from '@/utils/logFailure';
import { hasUnsavedEdits } from '@/utils/unsavedEdits';
import type { FolderToken } from '@data/storage/FileSystemStorageProvider';
import type { ParsedBackupData } from '@services/import';
import type { ApplyFolderCopy } from './useApplyFolderCopy';
import type { ChangedElsewhereReason, FolderProtectionReason, FolderSide } from '@services/sync';

/** The notice that this browser took on a password changed on another computer */
const FOLDER_LOCK_ADOPTED_NOTICE_ID = 'folder-lock-adopted';

/** What the user is told about the folder sync: why it held back, or that it failed */
export type FolderSyncIssue = FolderProtectionReason | 'failed';

/**
 * A folder copy that cannot be read, as the user was asked about it: the
 * file (folderCopyId(bytes, null)) and the folder it was found in. A choice
 * to replace it is carried out only for that file, in that folder.
 */
export interface UnreadableCopyTarget {
  fileId: string;
  folder: FolderToken | null;
}

/**
 * What the user chose to replace: a copy offered for restore, by its
 * revision (`copy`), or a copy that cannot be read (`unreadable`)
 */
export type FolderReplaceChoice =
  | { kind: 'copy'; revision: string | null }
  | ({ kind: 'unreadable' } & UnreadableCopyTarget);

/**
 * 'replaced': kept as a backup, and the next sync writes over it.
 * 'changed': the folder, or the file in it, is no longer the one the user
 * was asked about (or folder storage is off): nothing was kept, and the
 * question is to be asked again.
 */
export type FolderReplaceResult = 'replaced' | 'changed';

/**
 * What the user is shown to choose: both the folder copy and this browser
 * changed (`both-changed`); or this browser changed nothing, but the folder
 * copy is not a newer version of the one it last saw (`not-newer`), or is
 * one that holds no health records while this browser does (`empties`)
 */
export interface FolderConflict {
  reason: Exclude<ChangedElsewhereReason, 'newer'>;
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
   * is as stamped: resolves null, replacing nothing, when it changed.
   * Otherwise resolves the stamp the load left.
   * Runs inside a sync, which holds the folder-sync lock: it must never wait
   * for another sync (syncNow), which would wait for it in turn.
   */
  applyFolderCopy: ApplyFolderCopy;
}

/** What the last sync found to tell, and for a copy the user may replace, which file and folder */
interface Found {
  issue: FolderSyncIssue;
  target: UnreadableCopyTarget | null;
}

function sameFound(a: Found | null, b: Found | null): boolean {
  if (a === null || b === null) return a === b;
  return a.issue === b.issue && a.target?.fileId === b.target?.fileId && a.target?.folder === b.target?.folder;
}

/** A conflict waiting for the user: the copy and its bytes as the sync found them */
interface PendingConflict {
  session: SyncSession;
  copy: ParsedBackupData;
  revision: string | null;
  bytes: ArrayBuffer;
  /** This browser holds no health records and the copy does: never written over, so not to be kept */
  nothingToKeep: boolean;
}

/**
 * Hook that syncs database changes to the filesystem when filesystem storage is enabled
 */
export function useFilesystemSync({ enabled = true, applyFolderCopy }: UseFilesystemSyncOptions): {
  /** Sync now; rejects when the sync fails */
  syncNow: () => Promise<void>;
  /** Why the last sync left the folder copy alone or failed; null while syncs write or are held */
  issue: FolderSyncIssue | null;
  /** For an issue the user may resolve by replacing the copy: the file and folder found */
  issueTarget: UnreadableCopyTarget | null;
  /** Both sides changed: what the user is asked; null otherwise */
  conflict: FolderConflict | null;
  /** Syncs wait for the user's choice, or for the next session after "Decide later" */
  held: boolean;
  /**
   * Carry out the user's choice. Rejects when the backup of the side not
   * chosen cannot be saved, or the folder copy cannot be loaded; nothing is
   * replaced then, and the question stays.
   */
  resolveConflict: (choice: FolderConflictChoice) => Promise<void>;
  /**
   * Record a folder copy restored into this browser as seen, so its next
   * sync finds no conflict: only while the data is as the restore left it
   * (its stamp); a change saved since is written by the next sync
   */
  acknowledgeFolderCopy: (revision: string | null, loadedStamp: string) => Promise<void>;
  /**
   * "Replace folder copy", from the restore question or the sync notice:
   * keeps the copy in the folder as a backup (with the previous copy, for
   * one that cannot be read), then the next sync writes over that very copy
   * without asking. Rejects, keeping nothing chosen, when a backup cannot be
   * saved.
   */
  replaceFolderCopy: (choice: FolderReplaceChoice) => Promise<FolderReplaceResult>;
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
  const [found, setFound] = useState<Found | null>(null);
  const issue = found?.issue ?? null;
  // What the last sync found, read by the next: the same file found again keeps its folder token
  const foundRef = useRef<Found | null>(null);
  /** Told only when it changed: every sync sets it again */
  const setIssue = useCallback((next: FolderSyncIssue | null, target: UnreadableCopyTarget | null = null) => {
    const value = next === null ? null : { issue: next, target };
    if (!sameFound(foundRef.current, value)) foundRef.current = value;
    setFound(foundRef.current);
  }, []);
  // Kept with the key of the session they belong to: a new unlock is a new
  // key, and starts with no question and no hold
  const [asked, setAsked] = useState<{ key: CryptoKey; conflict: FolderConflict } | null>(null);
  const heldForRef = useRef<CryptoKey | null>(null);
  const [heldFor, setHeldFor] = useState<CryptoKey | null>(null);
  const pendingRef = useRef<PendingConflict | null>(null);
  // The copy the user chose to replace from the restore question or the
  // sync notice, for the next sync of the session it was chosen in;
  // `unreadable`: a copy that cannot be read, identified by its bytes
  const replaceNextRef = useRef<{ key: CryptoKey; choice: ReplacementToTake } | null>(null);
  // Whether the folder may not hold this browser's lock yet: unknown at
  // first, and after every password change, until a sync finds it there.
  // While it may not, a sync that leaves the data as they are, or a held
  // one, reads the copy to put the lock in it (P42).
  const lockBehindRef = useRef(true);
  // Held, the folder is looked at again: what the last sync found no longer applies
  if (!enabled && issue !== null) setFound(null);
  useEffect(() => {
    if (!enabled) foundRef.current = null;
  }, [enabled]);
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
        const provider = currentFolder();
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
            if (replaces != null) return { replaces };
            return chosen?.key === session.key ? chosen.choice : undefined;
          },
          isEnabled: () => enabledRef.current,
          lockMayBeBehind: lockBehindRef.current,
        });
        if (!run) return;
        const { outcome, lastSeen } = run;
        if (holdsLock(outcome, lockRef.current)) lockBehindRef.current = false;
        // A password changed on another computer: adopted when later than this
        // one's, and only for the session whose key opened the copy
        if (outcome.folderLock && sessionRef.current === session && adoptRef.current(outcome.folderLock)) {
          showPersistentNotice({
            id: FOLDER_LOCK_ADOPTED_NOTICE_ID,
            title: 'Password changed on another computer',
            message: 'Use the new password the next time you unlock HemoIO.',
          });
        }

        switch (outcome.status) {
          case 'written':
          case 'unchanged':
            await recordFolderCopySeen(outcome.state, lastSeen, session.key);
            setIssue(null);
            return;
          case 'protected': {
            const { fileId } = outcome;
            const last = foundRef.current;
            // The folder the provider read the file from; the same file found again is in the folder found before
            const target =
              fileId === undefined
                ? null
                : last?.issue === outcome.reason && last.target?.fileId === fileId
                  ? last.target
                  : { fileId, folder: (await provider.folderIdentity())?.token ?? null };
            setIssue(outcome.reason, target);
            return;
          }
          case 'changed-elsewhere':
            setIssue(null);
            if (!enabledRef.current || sessionRef.current !== session) return;
            if (outcome.reason === 'newer' && lastSeen) {
              // A note being typed would be lost with the views it is in:
              // the load waits, and the next sync finds the copy again (P44)
              if (await hasUnsavedEdits()) return;
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
              nothingToKeep: isNothingToKeep(outcome.browser, outcome.folder),
            };
            holdFor(session.key);
            setAsked({
              key: session.key,
              conflict: {
                // A 'newer' copy is loaded above and never asked about
                reason: outcome.reason === 'newer' ? 'both-changed' : outcome.reason,
                folder: outcome.folder,
                browser: outcome.browser,
                folderName: await provider.getDirectoryName(),
              },
            });
        }
      } catch (error) {
        // Fixed text: the error could name stored data
        logFailure('Failed to sync to the folder');
        setIssue('failed');
        throw error;
      }
    },
    [holdFor, setIssue]
  );

  /**
   * Put this browser's lock into the folder copy, leaving its data as they
   * are; run holding the folder-sync lock. True when the folder holds it,
   * or folder storage is off. Reads the lock as stored: a password change
   * asks for this before the new lock reaches React's state.
   */
  const putLockInFolder = useCallback(async (session: SyncSession): Promise<boolean> => {
    if (!isFolderStorageOn()) return true;
    const stored = loadStoredCredentials();
    if (!isCredentialsV2(stored)) return true;
    const provider = currentFolder();
    if ((await provider.getPermissionState()) !== 'granted') return false;
    const { status } = await sealLockIntoFolderCopy(provider, session.key, stored);
    if (status === 'not-opened') return false;
    if (lockRef.current?.kekSalt === stored.kekSalt) lockBehindRef.current = false;
    return true;
  }, []);

  const runSync = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !enabledRef.current) return;
    // Waiting for the user's choice, or held after "Decide later": nothing
    // is written, but a password change made here still reaches the folder
    // Checked again holding the lock: while this sync waited for another
    // tab's, this session may have ended, or folder storage been switched off
    const stillWanted = (): boolean =>
      sessionRef.current === session && enabledRef.current && isFolderStorageOn();
    if (heldForRef.current === session.key) {
      if (lockBehindRef.current) {
        await withWebLock(FOLDER_SYNC_LOCK, async () => {
          if (stillWanted()) await putLockInFolder(session);
        });
      }
      return;
    }
    // Nothing is held back when nothing is synced, so no notice either
    if (!isFolderStorageOn()) {
      setIssue(null);
      return;
    }
    await withWebLock(FOLDER_SYNC_LOCK, async () => {
      if (stillWanted()) await syncOnce(session);
    });
  }, [syncOnce, putLockInFolder, setIssue]);

  /** Runs `task` after everything already queued; its failure is its caller's, and the next still runs */
  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const next = lastRef.current.then(task);
    lastRef.current = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }, []);

  /** Runs `task` after the syncs already asked for, holding the folder-sync lock */
  const afterSyncs = useCallback(
    <T,>(task: () => Promise<T>): Promise<T> => enqueue(() => withWebLock(FOLDER_SYNC_LOCK, task)),
    [enqueue]
  );

  const syncNow = useCallback((): Promise<void> => {
    if (waitingRef.current) return waitingRef.current;
    const next = enqueue(() => {
      waitingRef.current = null;
      return runSync();
    });
    waitingRef.current = next;
    return next;
  }, [enqueue, runSync]);

  const resolveConflict = useCallback(
    async (choice: FolderConflictChoice): Promise<void> => {
      const pending = pendingRef.current;
      // A question from a session that has ended is no longer shown
      if (!pending || pending.session.key !== sessionRef.current?.key) return;
      if (choice === 'later') {
        // Syncs stay held for the session, as after "Not now"
        pendingRef.current = null;
        setAsked(null);
        notifyFolderSyncPaused();
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
        const provider = currentFolder();
        const backups = { db: session.db, key: session.key, backups: provider };
        if (choice === 'folder') {
          // Stamped before the backup's export, as for an automatic load: a
          // change saved after it (in another tab, while the backup is saved
          // to a cloud folder) stops the load in its transaction
          const stamp = await session.db.storedDataStamp();
          // This browser's data first, as a dated backup: if that fails, nothing is replaced
          await keepBrowserData(backups, { kind: 'conflict' });
          let loaded: string | null;
          try {
            loaded = await applyRef.current(pending.copy, stamp);
          } catch (error) {
            // Fixed text: the error could name stored data. Both sides are as
            // they were: the question stays, and says nothing was changed.
            logFailure('Failed to load the folder copy');
            throw error;
          }
          // Only once the data is replaced, or found changed: until then the question stays
          resolved();
          if (loaded === null) {
            // Changed meanwhile: nothing was replaced. Asked again, with both
            // sides as they are now; a failure is told by the sync.
            await syncOnce(session).catch(() => undefined);
            return;
          }
          try {
            await markFolderCopySeen(session.db, session.key, pending.revision, loaded);
          } catch {
            // The copy is loaded: the next sync finds the same data on both
            // sides and records it. Fixed text: the error could name stored data.
            logFailure('Could not record the folder copy as seen');
          }
          return;
        }
        // Checked before any backup: an empty browser never writes over a
        // copy with health records, so the choice could not be carried out
        if (pending.nothingToKeep) throw new Error('This computer holds no lab results to keep');
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
    async (choice: FolderReplaceChoice): Promise<FolderReplaceResult> => {
      const session = unlockedRef.current;
      if (!session) throw new Error('HemoIO is locked');
      // Folder storage switched off: nothing is replaced, and the notice goes with the next sync
      if (!isFolderStorageOn()) return 'changed';
      return afterSyncs(async (): Promise<FolderReplaceResult> => {
        if (!isFolderStorageOn()) return 'changed';
        const provider = currentFolder();
        let id: string | null;
        if (choice.kind === 'copy') {
          const bytes = await keepCurrentFolderCopy({ key: session.key, backups: provider, folder: provider });
          id = bytes && (await folderCopyId(bytes, choice.revision));
        } else {
          // Only the file the user saw, in the folder it was in: else asked again
          if (!(await provider.isCurrentFolder(choice.folder))) {
            // The next sync reads the folder afresh, even for the same file
            foundRef.current = null;
            return 'changed';
          }
          const kept = await keepFolderFilesBeforeReplace({
            key: session.key,
            ownLock: lockRef.current,
            backups: provider,
            folder: provider,
            fileId: choice.fileId,
          });
          if (!kept) return 'changed';
          id = choice.fileId;
        }
        // Locked meanwhile: the choice was for a session that has ended
        if (unlockedRef.current?.key !== session.key) return 'changed';
        // The sync that follows writes over the copy kept; nothing there to
        // keep (an offered copy gone meanwhile) writes as for an empty folder
        replaceNextRef.current =
          id === null
            ? null
            : { key: session.key, choice: choice.kind === 'unreadable' ? { replacesUnreadable: id } : { replaces: id } };
        return 'replaced';
      });
    },
    [afterSyncs]
  );

  const acknowledgeFolderCopy = useCallback(
    async (revision: string | null, loadedStamp: string): Promise<void> => {
      const session = unlockedRef.current;
      if (!session) return;
      await afterSyncs(() => markFolderCopySeen(session.db, session.key, revision, loadedStamp));
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
        // The same file found in another folder is not the one found before
        foundRef.current = null;
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
    lockBehindRef.current = true;
    if (sessionRef.current && isFolderStorageOn()) syncNow().catch(() => undefined);
  }, [lockSalt, syncNow]);

  // The password change puts the new lock into the folder at once, whatever
  // holds the data (a restore question, a hold, records set aside), and says
  // when it could not
  useEffect(() => {
    setFolderLockPush(() =>
      afterSyncs(async () => {
        const session = unlockedRef.current;
        return session ? putLockInFolder(session) : false;
      })
    );
    return () => setFolderLockPush(null);
  }, [afterSyncs, putLockInFolder]);

  return {
    syncNow,
    issue,
    issueTarget: found?.target ?? null,
    conflict: asked && asked.key === encryptionKey ? asked.conflict : null,
    held: heldFor !== null && heldFor === encryptionKey,
    resolveConflict,
    acknowledgeFolderCopy,
    replaceFolderCopy,
  };
}

/** Whether, after this sync, the folder copy holds `lock` (or a later one) */
function holdsLock(outcome: FolderSyncOutcome, lock: StoredCredentialsV2 | null): boolean {
  if (lock === null) return true;
  // A write carries the later of the two locks; a copy left unchanged had it already, or got it
  if (outcome.status === 'written') return true;
  return Boolean(outcome.folderLock) && !isLaterLock(lock, outcome.folderLock ?? null);
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
