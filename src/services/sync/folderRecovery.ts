/**
 * Setting HemoIO up from a folder copy, outside React
 *
 * The folder and the password that made the lock are all it needs. Nothing
 * is stored until a copy has opened with the password (unlockFolderCopy):
 * a wrong password, or a folder where nothing opens, leaves the browser as
 * it was. When the current copy is missing or damaged, the previous copy or
 * a dated backup that opens is restored instead, and the damaged copy is
 * kept as a dated backup, then replaced with what was restored, so syncing
 * goes on.
 *
 * Never logs anything but fixed text: the folder's path, the key and the
 * records stay out of the console.
 */

import { createEncryptedDb, type EncryptedDb } from '@data/db';
import { restoreBackup } from '@services/import';
import { FOLDER_SYNC_LOCK } from '@/utils/locks';
import { withWebLock } from '@/utils/withWebLock';
import { logFailure } from '@/utils/logFailure';
import { keepFolderBackup, type FolderBackupStore } from './folderBackups';
import { unlockFolderCopy, type FolderCopyOrigin, type FolderRecoverySource, type FolderUnlockProblem } from './folderCopy';
import { openEnvelope, sealDamagedCopy } from './folderEnvelope';
import { keepLockFile, type FolderLockStore } from './folderLockFile';
import { markFolderCopySeen, sealFolderCopy } from './folderSync';
import type { StoredCredentialsV2 } from '@data/encryption/keyWrapping';

/** The chosen folder, as recovery reads and writes it */
export interface RecoveryFolder extends FolderRecoverySource, FolderLockStore, FolderBackupStore {
  save(data: ArrayBuffer, previous?: ArrayBuffer): Promise<void>;
}

/**
 * Saves the lock as the credentials, runs `onSaved`, settles stored rows
 * against the key, then `prepare` (AuthContext.recoverFromFolder)
 */
export type SaveRecoveredLock = (
  lock: StoredCredentialsV2,
  key: CryptoKey,
  prepare: (key: CryptoKey) => Promise<void>,
  onSaved: () => Promise<void>
) => Promise<'created' | 'unlocked-existing' | 'existing-locked'>;

/** The previous copy or a backup was restored, because the current copy was missing or damaged */
export interface EarlierCopyRestored {
  from: Exclude<FolderCopyOrigin, { file: 'current' }>;
  /** When the file restored was saved; Invalid Date when unknown */
  savedAt: Date;
  /** Whether it was written as the new folder copy */
  replaced: boolean;
}

export type FolderRecoveryOutcome =
  /** Nothing opened with the password: nothing was stored */
  | { status: 'refused'; problem: FolderUnlockProblem }
  /** Another tab set up meanwhile: nothing was stored, and the unlock screen shows */
  | { status: 'existing-locked' }
  | {
      status: 'recovered';
      /** False when the file could not be loaded into this browser */
      restored: boolean;
      /** False when the folder choice could not be kept */
      folderKept: boolean;
      /** Set when the previous copy or a backup was restored */
      earlier: EarlierCopyRestored | null;
    };

export interface RecoverFromFolderCopyOptions {
  folder: RecoveryFolder;
  password: string;
  saveLock: SaveRecoveredLock;
  /**
   * Keeps folder storage on and this folder chosen; throws when it cannot.
   * Run once the lock is saved, before the sweep: a reload then still finds
   * the folder. Not before: another tab may have set up meanwhile.
   */
  keepFolder: () => Promise<void>;
}

/**
 * The current copy is missing or damaged, and the proven key does not open
 * it: keep its bytes, if any, as a dated backup, sealed whole under the key
 * with no lock (sealDamagedCopy: a half-synced cloud file is never lost,
 * and no old lock is kept in plain text); then write the data
 * just restored as the copy, carrying the lock, built on the one restored.
 * The backup restored from is never pruned to make room. Returns the new
 * copy's revision, or null when nothing was written: a failed backup writes
 * no copy, and a copy that opens by now is left as it is.
 */
async function replaceDamagedCopy(
  folder: RecoveryFolder,
  db: EncryptedDb,
  key: CryptoKey,
  lock: StoredCredentialsV2,
  restoredRevision: string | null,
  from: EarlierCopyRestored['from']
): Promise<string | null> {
  try {
    const damaged = await folder.loadCurrent();
    // Read again under the lock: a copy that opens now was written meanwhile
    // (by another computer), and is no longer damaged. Left to the first sync.
    if (damaged !== null && (await opensWith(damaged, key))) return null;
    if (damaged !== null) {
      await keepFolderBackup(folder, await sealDamagedCopy(damaged, key), {
        kind: 'conflict',
        protect: from.file === 'backup' ? [from.name] : [],
      });
    }
    const sealed = await sealFolderCopy(
      await db.exportAllData(),
      key,
      lock,
      restoredRevision === null ? [] : [restoredRevision]
    );
    await keepLockFile(folder, lock);
    await folder.save(sealed.bytes);
    return sealed.revision;
  } catch {
    logFailure('Could not replace the damaged folder copy');
    return null;
  }
}

/** Whether the key opens the file as a folder copy envelope */
async function opensWith(bytes: ArrayBuffer, key: CryptoKey): Promise<boolean> {
  try {
    await openEnvelope(bytes, key);
    return true;
  } catch {
    return false;
  }
}

/** Open the folder with the password and set HemoIO up from it */
export async function recoverFromFolderCopy({
  folder,
  password,
  saveLock,
  keepFolder,
}: RecoverFromFolderCopyOptions): Promise<FolderRecoveryOutcome> {
  const opened = await unlockFolderCopy(folder, password);
  if (!opened.ok) return { status: 'refused', problem: opened.problem };

  const { lock, key, copy, revision, from } = opened;
  let restored = true;
  let folderKept = true;
  let earlier: EarlierCopyRestored | null = null;

  // AuthContext logs the failure (fixed text) and goes on to unlock
  const onSaved = (): Promise<void> =>
    keepFolder().catch((error: unknown) => {
      folderKept = false;
      throw error;
    });

  // Sees only rows this key opens: the sweep has run
  const prepare = async (sessionKey: CryptoKey): Promise<void> => {
    try {
      const db = createEncryptedDb(sessionKey);
      // Data still in this browser is left for the first sync, which asks
      // when it differs from the copy: neither side is replaced unasked
      if (await db.hasLabData()) return;
      const { stamp } = await restoreBackup(db, copy);
      // Under the folder-sync lock (nested in setup's, the one order
      // allowed): the lock file, a backup and a replaced copy are folder writes
      await withWebLock(FOLDER_SYNC_LOCK, async () => {
        let seen = revision;
        if (from.file === 'current') {
          // The first sync writes it otherwise
          await keepLockFile(folder, lock).catch(() => logFailure('Could not write the lock file'));
        } else {
          const written = await replaceDamagedCopy(folder, db, sessionKey, lock, revision, from);
          earlier = { from, savedAt: copy.exportedAt, replaced: written !== null };
          // When nothing was written, the copy restored is the one seen; the first sync tells why
          seen = written ?? revision;
        }
        // Only while the data is as restored: a change saved since is written by the first sync
        try {
          await markFolderCopySeen(db, sessionKey, seen, stamp);
        } catch {
          // The copy is restored: the first sync finds the same data on both sides and records it
          logFailure('Could not record the folder copy as seen');
        }
      });
    } catch {
      restored = false;
      logFailure('Could not restore the folder copy');
    }
  };

  const outcome = await saveLock(lock, key, prepare, onSaved);
  if (outcome === 'existing-locked') return { status: 'existing-locked' };
  return { status: 'recovered', restored, folderKept, earlier: restored ? earlier : null };
}
