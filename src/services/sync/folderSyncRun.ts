/**
 * One folder sync, outside React
 *
 * What useFilesystemSync runs while holding the folder-sync lock: export,
 * compare with the folder copy and write it when that loses nothing, and
 * load a newer copy written elsewhere. The hook keeps what belongs to the
 * session and the screen: which session is current, the hold, the question
 * to the user and the notices.
 */

import { loadFolderSyncState, saveFolderSyncState, type FolderSyncState } from '@data/storage/folderSyncState';
import { keepBrowserData } from './folderConflict';
import { FolderWriteHeld, markFolderCopySeen, writeFolderCopy } from './folderSync';
import type { EncryptedDb } from '@data/db/encryptedDb';
import type { StoredCredentialsV2 } from '@data/encryption/keyWrapping';
import type { ParsedBackupData } from '@services/import';
import type { FolderBackupStore } from './folderBackups';
import type { FolderCopyStore, FolderSyncOutcome, FolderWriteContext } from './folderSync';

/** The copy the user chose to replace, as the sync is given it */
export type ReplacementToTake = Pick<FolderWriteContext, 'replaces' | 'replacesUnreadable'>;

/** The unlocked database and the key a sync seals with */
export interface SyncSession {
  db: EncryptedDb;
  key: CryptoKey;
}

export type ChangedElsewhere = Extract<FolderSyncOutcome, { status: 'changed-elsewhere' }>;

/** What one sync found, and what this browser had seen of the folder before it */
export interface FolderSyncRun {
  outcome: FolderSyncOutcome;
  lastSeen: FolderSyncState | null;
}

export interface RunFolderSyncOptions {
  /** This browser's lock, written beside the copy */
  lock: StoredCredentialsV2 | null;
  /**
   * The copy the user chose to replace, if any: one that opened
   * (`replaces`), or one that cannot be read (`replacesUnreadable`). Asked
   * for once the sync is past the hold's first check, and only when no
   * set-aside record keeps the copy from being read, so a choice is used up
   * only by a sync that goes on to read the folder. One that then fails to
   * read it asks again.
   */
  takeReplaces: () => ReplacementToTake | undefined;
  /** False once the hold begins: checked before the folder copy is decrypted, and at the save */
  isEnabled: () => boolean;
  /** False once the folder is known to hold `lock` (FolderWriteContext.lockMayBeBehind) */
  lockMayBeBehind?: boolean;
}

/**
 * Write this browser's data to the folder copy, unless that could lose data
 * there (writeFolderCopy decides). Resolves null when the hold began while
 * the sync was under way: nothing was written then.
 */
export async function runFolderSync(
  session: SyncSession,
  folder: FolderCopyStore,
  { lock, takeReplaces, isEnabled, lockMayBeBehind }: RunFolderSyncOptions
): Promise<FolderSyncRun | null> {
  // Records the export could not open (sealed since the unlock under
  // another key) protect the copy as set-aside ones do: saved without them,
  // it would lose them on the other computers too
  let skipped = 0;
  // The state is read beside the export; the set-aside count after it, so
  // a row another tab moves aside while the export runs is counted
  const [data, lastSeen] = await Promise.all([
    session.db.exportAllData((count) => {
      skipped += count;
    }),
    loadFolderSyncState(session.key),
  ]);
  const setAside = await session.db.countSetAside();
  const unsaved = setAside.unsaved + skipped;
  // The hold may begin while this sync is under way: checked here, so a
  // held sync does not decrypt the folder copy, and again at the save
  if (!isEnabled()) return null;
  const store: FolderCopyStore = {
    loadCurrent: () => folder.loadCurrent(),
    loadPrevious: () => folder.loadPrevious(),
    loadLock: () => folder.loadLock(),
    save: (bytes, previous) => (isEnabled() ? folder.save(bytes, previous) : Promise.reject(new FolderWriteHeld())),
    saveLock: (bytes) => (isEnabled() ? folder.saveLock(bytes) : Promise.reject(new FolderWriteHeld())),
  };
  // Not while set-aside records keep the copy from being read for its data:
  // the choice waits for a sync that can act on it
  const replaces = unsaved > 0 ? undefined : takeReplaces();
  try {
    const outcome = await writeFolderCopy(store, data, session.key, {
      lock,
      setAsideUnsaved: unsaved,
      lastSeen,
      ...replaces,
      ...(lockMayBeBehind !== undefined && { lockMayBeBehind }),
    });
    return { outcome, lastSeen };
  } catch (error) {
    if (error instanceof FolderWriteHeld) return null;
    throw error;
  }
}

/**
 * Record the copy a sync wrote, or found unchanged, as the one this browser
 * has seen. Saved again only when it changed: every save is a new
 * ciphertext in localStorage.
 */
export async function recordFolderCopySeen(
  state: FolderSyncState,
  lastSeen: FolderSyncState | null,
  key: CryptoKey
): Promise<void> {
  if (state.revision !== lastSeen?.revision || state.digest !== lastSeen.digest) {
    await saveFolderSyncState(state, key);
  }
}

export interface LoadNewerCopyOptions {
  /**
   * Replace this browser's data with the copy, only while the stored data
   * is as `unchangedSince` stamps it (EncryptedDb.storedDataStamp): the
   * stamp the load left, or null when it changed and nothing was replaced
   */
  apply: (data: ParsedBackupData, unchangedSince: string) => Promise<string | null>;
  /** False once the session ended or the hold began: nothing more is done then */
  isCurrent: () => boolean;
  /** The data was replaced: told before the copy is recorded as seen */
  onLoaded: () => void;
}

/**
 * Load a newer copy written elsewhere, after keeping this browser's data as
 * a backup; a failed backup loads nothing. Nothing either when this browser
 * changed something while the copy was read, or while it was kept or
 * loaded: the next sync asks instead.
 */
export async function loadNewerFolderCopy(
  session: SyncSession,
  backups: FolderBackupStore,
  outcome: ChangedElsewhere,
  lastSeen: FolderSyncState,
  { apply, isCurrent, onLoaded }: LoadNewerCopyOptions
): Promise<void> {
  if (!isCurrent()) return;
  // Stamped before the backup's export: a change saved at any moment after
  // it, even after the export was checked, stops the load in its transaction
  const stamp = await session.db.storedDataStamp();
  const kept = await keepBrowserData(
    { db: session.db, key: session.key, backups },
    { kind: 'before-load', unchangedSince: lastSeen.digest }
  );
  if (!kept || !isCurrent()) return;
  const loaded = await apply(outcome.copy, stamp);
  if (loaded === null) return;
  // Told first: the data is replaced, whatever happens to the record of it
  onLoaded();
  await markFolderCopySeen(session.db, session.key, outcome.revision, loaded);
}
