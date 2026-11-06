/**
 * The folder copy: the encrypted file folder sync keeps in the user's folder
 *
 * Its format, and reading it back: when the browser has lost its data the
 * folder copy may be the only one left, so before sync writes over it the
 * app checks whether it holds something worth restoring.
 */

import { isPreLoincBackupVersion, type ParsedBackupData } from '@services/import';
import { backupDate } from './folderBackups';
import { openEnvelope, readEnvelopeHeader, type FolderEnvelopeHeader } from './folderEnvelope';
import { readLockFile } from './folderLockFile';
import { FOLDER_SYNC_FILE_VERSION, isFolderSyncFile, parseFolderCopyData } from './folderSync';
import { isCredentialsV2, unlockV2, type StoredCredentialsV2 } from '@data/encryption/keyWrapping';

export type FolderCopyProblem =
  /** A copy without a lock, under another key (another password or an earlier setup), or damaged: AES-GCM cannot tell */
  | 'cannot-decrypt'
  /** A copy whose lock the session key does not open: another setup's, made with another data key */
  | 'another-setup'
  /** Decrypts, but is not a folder copy HemoIO can read */
  | 'not-a-copy'
  | 'newer-version'
  /** Saved before tests were identified by LOINC: its values cannot be restored */
  | 'before-loinc'
  /** The file could not be read from the folder */
  | 'read-failed';

export type FolderCopyReading =
  | {
      status: 'readable';
      data: ParsedBackupData;
      /** The write that made the copy; null for a copy from before the lock was kept beside it */
      revision: string | null;
      /** The lock beside the copy, null when it has none */
      lock: StoredCredentialsV2 | null;
    }
  | { status: 'unreadable'; reason: Exclude<FolderCopyProblem, 'read-failed'> };

/**
 * Decrypt and parse the folder copy with the session key. Never throws, and
 * logs nothing: the content is health data.
 */
export async function readFolderCopy(bytes: ArrayBuffer, key: CryptoKey): Promise<FolderCopyReading> {
  const read = readEnvelopeHeader(bytes);
  // 'not-a-copy' here and 'unreadable' in the sync: both name a damaged header
  if (read === 'damaged') return { status: 'unreadable', reason: 'not-a-copy' };
  const header: FolderEnvelopeHeader | null = read;

  let plain: ArrayBuffer;
  try {
    plain = (await openEnvelope(bytes, key)).plain;
  } catch {
    return { status: 'unreadable', reason: header?.lock ? 'another-setup' : 'cannot-decrypt' };
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return { status: 'unreadable', reason: 'not-a-copy' };
  }
  // Its version first: a newer HemoIO may lay its data out in a way this one cannot check
  const version = (envelope as { version?: unknown } | null)?.version;
  if (typeof version === 'number' && version > FOLDER_SYNC_FILE_VERSION) {
    return { status: 'unreadable', reason: 'newer-version' };
  }
  if (!isFolderSyncFile(envelope) || !Number.isInteger(envelope.version) || envelope.version < 1) {
    return { status: 'unreadable', reason: 'not-a-copy' };
  }
  if (isPreLoincBackupVersion(envelope.version)) {
    return { status: 'unreadable', reason: 'before-loinc' };
  }

  try {
    return {
      status: 'readable',
      data: parseFolderCopyData(envelope),
      revision: header && typeof envelope.revision === 'string' ? envelope.revision : null,
      lock: header?.lock ?? null,
    };
  } catch {
    return { status: 'unreadable', reason: 'not-a-copy' };
  }
}

/** Why a folder copy could not be opened with a password alone */
export type FolderUnlockProblem =
  /** The folder holds no copy, and no lock file */
  | 'no-copy'
  /** A copy without the lock saved in it: only a browser with its key can open it */
  | 'no-lock'
  | 'wrong-password'
  // With the password a lock opens, the copy is this setup's: never another's
  | Exclude<FolderCopyProblem, 'another-setup'>;

/** Which file in the folder a recovery restored */
export type FolderCopyOrigin =
  | { file: 'current' }
  /** The current copy was missing or damaged: the previous copy opened */
  | { file: 'previous' }
  /** The current and previous copies were missing or damaged: this dated backup opened */
  | { file: 'backup'; name: string };

export type FolderUnlockResult =
  | {
      ok: true;
      /** The data key, unwrapped from the lock */
      key: CryptoKey;
      lock: StoredCredentialsV2;
      copy: ParsedBackupData;
      revision: string | null;
      from: FolderCopyOrigin;
    }
  | { ok: false; problem: FolderUnlockProblem };

/** The folder, as recovery reads it: the copy, the previous copy, the backups and the lock file */
export interface FolderRecoverySource {
  /** The file, or null when there is none; throws when it cannot tell */
  loadCurrent(): Promise<ArrayBuffer | null>;
  loadPrevious(): Promise<ArrayBuffer | null>;
  listBackups(): Promise<string[]>;
  loadBackup(name: string): Promise<ArrayBuffer>;
  loadLock(): Promise<ArrayBuffer | null>;
}

/**
 * A current copy whose body did not open, or opened to something that is
 * no folder copy: damaged, so the earlier files are tried. Any other
 * reading opened, and is told.
 */
function didNotOpen(reason: FolderCopyProblem): reason is 'cannot-decrypt' | 'another-setup' | 'not-a-copy' {
  return reason === 'cannot-decrypt' || reason === 'another-setup' || reason === 'not-a-copy';
}

/**
 * The earlier files to try, in order: the previous copy, then the dated
 * backups of both kinds, newest first. Loaded one at a time, as they are
 * tried; one that cannot be loaded is skipped.
 */
async function* earlierCopies(
  source: FolderRecoverySource
): AsyncGenerator<{ bytes: ArrayBuffer; from: FolderCopyOrigin }> {
  const previous = await source.loadPrevious().catch(() => null);
  if (previous) yield { bytes: previous, from: { file: 'previous' } };
  const names = await source.listBackups().catch((): string[] => []);
  const newestFirst = names
    .map((name) => ({ name, date: backupDate(name) }))
    .filter((entry): entry is { name: string; date: Date } => entry.date !== null)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  for (const { name } of newestFirst) {
    const bytes = await source.loadBackup(name).catch(() => null);
    if (bytes) yield { bytes, from: { file: 'backup', name } };
  }
}

/**
 * Open the folder with the password that made its lock, as a browser
 * without credentials does.
 *
 * The lock is the current copy's, when its header can be read, else the
 * lock file's (folderLockFile.ts). Unwrapped with the password, its key is
 * tried on the current copy, then the previous copy, then the dated
 * backups, newest first. The first body that opens under it, with its
 * header as additional data, proves the key: AES-GCM authenticates it, so a
 * lock swapped into the copy or planted as the lock file is never accepted
 * unless a body in the folder opens under its key. A current copy that
 * opens but cannot be restored (a newer HemoIO's, or one from before LOINC)
 * is told as such, never passed over for an older one.
 *
 * Stores nothing, and never throws or logs: the password, the key and the
 * content stay out of errors.
 */
export async function unlockFolderCopy(
  source: FolderRecoverySource,
  password: string
): Promise<FolderUnlockResult> {
  let current: ArrayBuffer | null;
  try {
    current = await source.loadCurrent();
  } catch {
    return { ok: false, problem: 'read-failed' };
  }
  const header = current === null ? null : readEnvelopeHeader(current);
  let lock = header && header !== 'damaged' ? header.lock : null;
  if (lock === null) {
    lock = readLockFile(await source.loadLock().catch(() => null));
    if (lock === null) {
      if (current === null) return { ok: false, problem: 'no-copy' };
      return { ok: false, problem: header === 'damaged' ? 'not-a-copy' : 'no-lock' };
    }
  }
  // Checked again here: this lock is about to become the stored credentials
  if (!isCredentialsV2(lock)) return { ok: false, problem: 'not-a-copy' };

  let key: CryptoKey | null;
  try {
    key = await unlockV2(password, lock);
  } catch {
    // A lock whose fields do not decode: no password opens it
    return { ok: false, problem: 'cannot-decrypt' };
  }
  if (!key) return { ok: false, problem: 'wrong-password' };

  const unlocked = { ok: true as const, key, lock };
  const opened = (
    reading: Extract<FolderCopyReading, { status: 'readable' }>,
    from: FolderCopyOrigin
  ): FolderUnlockResult => ({ ...unlocked, copy: reading.data, revision: reading.revision, from });

  if (current !== null) {
    const reading = await readFolderCopy(current, key);
    if (reading.status === 'readable') return opened(reading, { file: 'current' });
    if (!didNotOpen(reading.reason)) return { ok: false, problem: reading.reason };
  }
  for await (const earlier of earlierCopies(source)) {
    const reading = await readFolderCopy(earlier.bytes, key);
    if (reading.status === 'readable') return opened(reading, earlier.from);
  }
  // The lock opened, but no body opened with it: damaged, or a lock put beside another body
  return { ok: false, problem: 'cannot-decrypt' };
}

/** The folder file, as the folder storage provider reads it */
export interface FolderCopySource {
  /** The file, or null when there is none; throws when it cannot tell */
  loadCurrent(): Promise<ArrayBuffer | null>;
}

export type FolderCopyAssessment =
  /** Nothing in the folder would be lost: sync may write */
  | { kind: 'sync' }
  /** The folder copy has data this browser lacks: ask before sync writes */
  | {
      kind: 'offer';
      data: ParsedBackupData;
      /** The copy's revision, for the restore to record as seen; null for a copy without one */
      revision: string | null;
    }
  /** The folder copy may have data but cannot be read: ask before sync writes */
  | { kind: 'unreadable'; reason: FolderCopyProblem };

/**
 * For a browser without lab data: whether sync may write over the folder
 * copy, or the user must first decide what happens to it
 */
export async function assessFolderCopy(
  folder: FolderCopySource,
  key: CryptoKey
): Promise<FolderCopyAssessment> {
  let bytes: ArrayBuffer | null;
  try {
    bytes = await folder.loadCurrent();
  } catch {
    return { kind: 'unreadable', reason: 'read-failed' };
  }
  if (bytes === null) return { kind: 'sync' };

  const reading = await readFolderCopy(bytes, key);
  if (reading.status === 'unreadable') {
    return { kind: 'unreadable', reason: reading.reason };
  }
  const { labResults, userNotes } = reading.data;
  return labResults.length > 0 || userNotes.length > 0
    ? { kind: 'offer', data: reading.data, revision: reading.revision }
    : { kind: 'sync' };
}
