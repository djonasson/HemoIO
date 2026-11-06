/**
 * The folder copy: the encrypted file folder sync keeps in the user's folder
 *
 * Its format, and reading it back: when the browser has lost its data the
 * folder copy may be the only one left, so before sync writes over it the
 * app checks whether it holds something worth restoring.
 */

import { isPreLoincBackupVersion, type ParsedBackupData } from '@services/import';
import { openEnvelope, readEnvelopeHeader, type FolderEnvelopeHeader } from './folderEnvelope';
import { FOLDER_SYNC_FILE_VERSION, parseFolderCopyData } from './folderSync';
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

interface FolderCopyEnvelope {
  version: number;
  exportedAt: string;
  revision?: unknown;
  data: {
    labResults?: unknown;
    testValues?: unknown;
    userNotes?: unknown;
    preferences?: unknown;
  };
}

function isEnvelope(value: unknown): value is FolderCopyEnvelope {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as Partial<FolderCopyEnvelope>;
  return (
    typeof envelope.version === 'number' &&
    typeof envelope.exportedAt === 'string' &&
    // Shown to the user as the copy's date
    !Number.isNaN(new Date(envelope.exportedAt).getTime()) &&
    typeof envelope.data === 'object' &&
    envelope.data !== null
  );
}

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
  if (!isEnvelope(envelope)) {
    return { status: 'unreadable', reason: 'not-a-copy' };
  }
  if (envelope.version > FOLDER_SYNC_FILE_VERSION) {
    return { status: 'unreadable', reason: 'newer-version' };
  }
  if (!Number.isInteger(envelope.version) || envelope.version < 1) {
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
  /** The folder holds no copy */
  | 'no-copy'
  /** A copy without the lock beside it: only a browser with its key can open it */
  | 'no-lock'
  | 'wrong-password'
  // With the password a lock opens, the copy is this setup's: never another's
  | Exclude<FolderCopyProblem, 'another-setup'>;

export type FolderUnlockResult =
  | {
      ok: true;
      /** The data key, unwrapped from the lock */
      key: CryptoKey;
      lock: StoredCredentialsV2;
      copy: ParsedBackupData;
      revision: string | null;
    }
  | { ok: false; problem: FolderUnlockProblem };

/**
 * Open a folder copy with the password that made the lock beside it, as a
 * browser without credentials does. It succeeds only when the body opens with
 * the unwrapped key and the header as additional data, so a lock swapped into
 * the file is never accepted. Stores nothing, and never throws or logs: the
 * password, the key and the content stay out of errors.
 */
export async function unlockFolderCopy(
  bytes: ArrayBuffer | null,
  password: string
): Promise<FolderUnlockResult> {
  if (bytes === null) return { ok: false, problem: 'no-copy' };
  const header = readEnvelopeHeader(bytes);
  if (header === 'damaged') return { ok: false, problem: 'not-a-copy' };
  const lock = header?.lock ?? null;
  if (lock === null) return { ok: false, problem: 'no-lock' };
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

  const reading = await readFolderCopy(bytes, key);
  if (reading.status === 'unreadable') {
    // The lock opened, but the body did not open with it: damaged, or a lock put beside another body
    return { ok: false, problem: reading.reason === 'another-setup' ? 'cannot-decrypt' : reading.reason };
  }
  return { ok: true, key, lock, copy: reading.data, revision: reading.revision };
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
