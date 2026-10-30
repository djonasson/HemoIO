/**
 * The folder copy: the encrypted file folder sync keeps in the user's folder
 *
 * Its format, and reading it back: when the browser has lost its data the
 * folder copy may be the only one left, so before sync writes over it the
 * app checks whether it holds something worth restoring.
 */

import { decrypt } from '@data/encryption';
import { parseBackupData, type ParsedBackupData } from '@services/import';

/**
 * Format version of the folder copy. Version 2 stores biomarker keys
 * (version 1 stored dictionary positions, and is not read back).
 */
export const SYNC_FILE_VERSION = 2;

/**
 * The backup schema the folder copy's records match: version 2 stores keys,
 * so the backup migrations from schema 2 on apply (they leave current
 * records unchanged)
 */
const BACKUP_SCHEMA_OF_COPY = 2;

export type FolderCopyProblem =
  /** Another key (another password or an earlier setup), or damaged: AES-GCM cannot tell */
  | 'cannot-decrypt'
  /** Decrypts, but is not a folder copy HemoIO can read */
  | 'not-a-copy'
  | 'newer-version'
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
  if (envelope.version > SYNC_FILE_VERSION) {
    return { status: 'unreadable', reason: 'newer-version' };
  }
  if (envelope.version < SYNC_FILE_VERSION) {
    return { status: 'unreadable', reason: 'not-a-copy' };
  }

  try {
    const { data } = envelope;
    const parsed = parseBackupData({
      schemaVersion: BACKUP_SCHEMA_OF_COPY,
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
  exists(): Promise<boolean>;
  load(): Promise<ArrayBuffer>;
}

export type FolderCopyAssessment =
  /** Nothing in the folder would be lost: sync may write */
  | { kind: 'sync' }
  /** The folder copy has data this browser lacks: ask before sync writes */
  | { kind: 'offer'; data: ParsedBackupData }
  /** The folder copy may have data but cannot be read: ask before sync writes */
  | { kind: 'unreadable'; reason: FolderCopyProblem };

/**
 * Whether sync may write to the folder, or the user must first decide what
 * happens to the copy there. Only a browser without lab data is at risk of
 * writing over a copy that has some.
 */
export async function assessFolderCopy({
  browserHasData,
  folder,
  key,
}: {
  browserHasData: boolean;
  folder: FolderCopySource;
  key: CryptoKey;
}): Promise<FolderCopyAssessment> {
  if (browserHasData) return { kind: 'sync' };

  let bytes: ArrayBuffer;
  try {
    if (!(await folder.exists())) return { kind: 'sync' };
    bytes = await folder.load();
  } catch {
    return { kind: 'unreadable', reason: 'read-failed' };
  }

  const reading = await readFolderCopy(bytes, key);
  if (reading.status === 'unreadable') {
    return { kind: 'unreadable', reason: reading.reason };
  }
  const { labResults, userNotes } = reading.data;
  return labResults.length > 0 || userNotes.length > 0
    ? { kind: 'offer', data: reading.data }
    : { kind: 'sync' };
}
