/**
 * Folder sync: what the folder copy may be replaced with
 *
 * The folder copy may be a user's only full copy of their lab data, so a sync
 * never replaces one that holds data with one that has none, and never
 * replaces one it cannot open. To tell, it decrypts the folder copy in memory
 * with the session key: a plaintext record count would leak how much health
 * data a person has.
 */

import { isLaterLock, type StoredCredentialsV2 } from '@data/encryption/keyWrapping';
import { BACKUP_SCHEMA_VERSION } from '@services/export/jsonExport';
import { isPreLoincBackupVersion } from '@services/import';
import { openEnvelope, readEnvelopeHeader, sealEnvelope } from './folderEnvelope';
import type { EncryptedDb } from '@data/db/encryptedDb';

/**
 * Format version of the encrypted sync file. Its records are those of the
 * backup schema of the same number, so a restore reads a copy back as it
 * reads a backup; a copy saved before tests were identified by LOINC (before
 * version 4) cannot be restored, and is never written over.
 */
export const FOLDER_SYNC_FILE_VERSION = BACKUP_SCHEMA_VERSION;

/** Everything a sync writes: the database as exported */
export type FolderSyncData = Awaited<ReturnType<EncryptedDb['exportAllData']>>;

/** The decrypted folder copy */
export interface FolderSyncFile {
  version: number;
  exportedAt: string;
  /** New with every write; absent from a copy written before the lock was kept beside it */
  revision?: string;
  data: FolderSyncData;
}

/** What a sync knows besides the data */
export interface FolderWriteContext {
  /** This browser's lock, kept beside the copy; null when it has none */
  lock: StoredCredentialsV2 | null;
  /** Records set aside that are not yet saved */
  setAsideUnsaved: number;
}

/** The folder, as the sync reads and writes it */
export interface FolderCopyStore {
  /** The folder copy's bytes, or null when there is none */
  loadCurrent(): Promise<ArrayBuffer | null>;
  /** The previous copy's bytes, or null when there is none */
  loadPrevious(): Promise<ArrayBuffer | null>;
  /** Write the folder copy; given `previous`, keep those bytes as the previous copy first */
  save(data: ArrayBuffer, previous?: ArrayBuffer): Promise<void>;
}

/**
 * Why a sync left the folder copy alone: the browser has no health data but
 * the folder copy does (`empty`); the session key cannot read the folder copy,
 * so what it holds is unknown (`unreadable`); the copy carries a lock but the
 * session key does not open it: another setup made it, with another data key,
 * or its lock was edited (`another-setup`); a newer HemoIO wrote it, in a
 * format this one would lose parts of (`newer`); or an earlier HemoIO wrote
 * it before tests were identified by LOINC, so it cannot be restored and may
 * be the only copy of that history (`before-loinc`); or stored records that
 * cannot be opened are set aside and not yet saved, and the folder copy may
 * still hold them (`set-aside`)
 */
export type FolderProtectionReason =
  | 'empty'
  | 'unreadable'
  | 'another-setup'
  | 'newer'
  | 'before-loinc'
  | 'set-aside';

/**
 * `folderLock` is always the lock found in the folder, given whenever the
 * copy there opened (null for none, or a copy without one). It opened under
 * the session key with the lock sealed to it, so only a holder of the data
 * key can have written it.
 */
export type FolderSyncOutcome =
  | { status: 'written'; folderLock: StoredCredentialsV2 | null }
  | { status: 'unchanged'; folderLock: StoredCredentialsV2 | null }
  | { status: 'protected'; reason: FolderProtectionReason; folderLock?: StoredCredentialsV2 | null };

type CopyProblem = Exclude<FolderProtectionReason, 'empty' | 'set-aside'>;

/** A copy that opened, and the lock it carries */
interface OpenedCopy {
  file: FolderSyncFile;
  lock: StoredCredentialsV2 | null;
}

/**
 * How much a person would lose: lab results, test values and notes. Settings
 * and preferences do not count: a fresh setup has them too.
 */
function healthRecords(data: FolderSyncData): number {
  return data.labResults.length + data.testValues.length + data.userNotes.length;
}

function isSyncFile(value: unknown): value is FolderSyncFile {
  if (typeof value !== 'object' || value === null) return false;
  const { version, data } = value as Partial<FolderSyncFile>;
  return (
    typeof version === 'number' &&
    typeof data === 'object' &&
    data !== null &&
    Array.isArray(data.labResults) &&
    Array.isArray(data.testValues) &&
    Array.isArray(data.userNotes)
  );
}

/**
 * A copy's content and lock: `null` for no copy or an empty file, or why it
 * cannot be read as a current copy
 */
async function open(encrypted: ArrayBuffer | null, key: CryptoKey): Promise<OpenedCopy | null | CopyProblem> {
  // An interrupted first write can leave an empty file; there is nothing to lose
  if (!encrypted || encrypted.byteLength === 0) return null;

  const header = readEnvelopeHeader(encrypted);
  if (header === 'damaged') return 'unreadable';
  let plain: ArrayBuffer;
  try {
    plain = (await openEnvelope(encrypted, key)).plain;
  } catch {
    // Another key, a damaged file, or an edited lock. Not logged: a log would add nothing
    return header?.lock ? 'another-setup' : 'unreadable';
  }

  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(plain));
    // Checked first: a newer HemoIO may lay its data out in a way this one cannot check
    const version = (parsed as { version?: unknown } | null)?.version;
    if (typeof version === 'number' && version > FOLDER_SYNC_FILE_VERSION) return 'newer';
    if (typeof version === 'number' && isPreLoincBackupVersion(version)) return 'before-loinc';
    return isSyncFile(parsed) ? { file: parsed, lock: header?.lock ?? null } : 'unreadable';
  } catch {
    return 'unreadable';
  }
}

/**
 * Whether the copy being replaced should become the previous copy. It must
 * hold at least half the records of the one already kept: a browser that lost
 * its data and then gains a result or two must not push the full history out
 * with its second write, while a cleanup that removes some records still lets
 * the previous copy move on. One that cannot be read is no copy to undo to.
 */
async function keepsAsPrevious(
  store: FolderCopyStore,
  replaced: FolderSyncFile,
  key: CryptoKey
): Promise<boolean> {
  const replacedRecords = healthRecords(replaced.data);
  if (replacedRecords === 0) return false;

  const previous = await open(await store.loadPrevious(), key);
  // A newer or pre-LOINC copy cannot be counted, but it is one to undo to
  if (previous === 'newer' || previous === 'before-loinc') return false;
  if (!previous || typeof previous === 'string') return true;
  return replacedRecords * 2 >= healthRecords(previous.file.data);
}

/**
 * Write the data to the folder copy, unless that could lose data there.
 * A copy with the same data is not rewritten, so the previous copy stays the
 * one from before the last real change, unless this browser's lock is later
 * than the one beside it (a password change): then the lock must reach the
 * folder. The lock written is the later of the two, so an earlier one never
 * replaces a password change made elsewhere.
 *
 * While records that cannot be opened are set aside and unsaved, the folder
 * copy may be the only place that still holds them, and the export leaves
 * them out: it is left as it is, and not even read.
 */
export async function writeFolderCopy(
  store: FolderCopyStore,
  data: FolderSyncData,
  key: CryptoKey,
  context: FolderWriteContext
): Promise<FolderSyncOutcome> {
  if (context.setAsideUnsaved > 0) {
    return { status: 'protected', reason: 'set-aside' };
  }
  const encrypted = await store.loadCurrent();
  const existing = await open(encrypted, key);
  // Dates serialise to the ISO strings the decrypted copy holds, so equal data compares equal
  const dataJson = JSON.stringify(data);

  if (typeof existing === 'string') {
    return { status: 'protected', reason: existing };
  }
  const folderLock = existing?.lock ?? null;
  const lockIsLater = context.lock !== null && isLaterLock(context.lock, folderLock);
  const sameData = existing !== null && JSON.stringify(existing.file.data) === dataJson;
  if (sameData && !lockIsLater) {
    return { status: 'unchanged', folderLock };
  }
  if (existing && !sameData && healthRecords(existing.file.data) > 0 && healthRecords(data) === 0) {
    return { status: 'protected', reason: 'empty', folderLock };
  }

  // Built around the string already made, so the data is serialised once.
  // The version leads: the format is told by it before anything else.
  const file =
    `{"version":${FOLDER_SYNC_FILE_VERSION},"exportedAt":"${new Date().toISOString()}",` +
    `"revision":"${crypto.randomUUID()}","data":${dataJson}}`;
  const lock = lockIsLater || folderLock === null ? context.lock : folderLock;
  const sealed = await sealEnvelope(new TextEncoder().encode(file), key, lock);
  // Only the lock changed: the previous copy stays the one from before the last change of data
  const keep =
    existing && encrypted && !sameData && (await keepsAsPrevious(store, existing.file, key));
  await store.save(sealed, keep ? encrypted : undefined);
  return { status: 'written', folderLock };
}
