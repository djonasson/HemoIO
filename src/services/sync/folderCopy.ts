/**
 * The folder copy: the encrypted file folder sync keeps in the user's folder
 *
 * Its format, and reading it back: when the browser has lost its data the
 * folder copy may be the only one left, so before sync writes over it the
 * app checks whether it holds something worth restoring.
 */

import { decrypt } from '@data/encryption';
import { isPreLoincBackupVersion, parseBackupData, type ParsedBackupData } from '@services/import';
import { FOLDER_SYNC_FILE_VERSION } from './folderSync';

export type FolderCopyProblem =
  /** Another key (another password or an earlier setup), or damaged: AES-GCM cannot tell */
  | 'cannot-decrypt'
  /** Decrypts, but is not a folder copy HemoIO can read */
  | 'not-a-copy'
  | 'newer-version'
  /** Saved before tests were identified by LOINC: its values cannot be restored */
  | 'before-loinc'
  /** The file could not be read from the folder */
  | 'read-failed';

export type FolderCopyReading =
  | { status: 'readable'; data: ParsedBackupData }
  | { status: 'unreadable'; reason: Exclude<FolderCopyProblem, 'read-failed'> };

interface FolderCopyEnvelope {
  version: number;
  exportedAt: string;
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
  let plain: ArrayBuffer;
  try {
    plain = await decrypt(bytes, key);
  } catch {
    return { status: 'unreadable', reason: 'cannot-decrypt' };
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
    const { data } = envelope;
    const parsed = parseBackupData({
      schemaVersion: envelope.version,
      exportedAt: envelope.exportedAt,
      appVersion: 'folder copy',
      labResults: data.labResults,
      testValues: data.testValues,
      userNotes: data.userNotes,
      userPreferences: data.preferences ?? null,
      // Storage and AI settings belong to this device, as with a backup
      settings: null,
    });
    return { status: 'readable', data: parsed };
  } catch {
    return { status: 'unreadable', reason: 'not-a-copy' };
  }
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
  | { kind: 'offer'; data: ParsedBackupData }
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
    ? { kind: 'offer', data: reading.data }
    : { kind: 'sync' };
}
