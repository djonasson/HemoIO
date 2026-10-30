/**
 * Folder sync: what the folder copy may be replaced with
 *
 * The folder copy may be a user's only full copy of their lab data, so a sync
 * never replaces one that holds data with one that has none, and never
 * replaces one it cannot open. To tell, it decrypts the folder copy in memory
 * with the session key: a plaintext record count would leak how much health
 * data a person has.
 */

import { decrypt, encrypt } from '@data/encryption';
import type { EncryptedDb } from '@data/db/encryptedDb';

/**
 * Format version of the encrypted sync file. Version 2 stores biomarker keys
 * (version 1 stored dictionary positions); a future reader must migrate v1.
 */
export const FOLDER_SYNC_FILE_VERSION = 2;

/** Everything a sync writes: the database as exported */
export type FolderSyncData = Awaited<ReturnType<EncryptedDb['exportAllData']>>;

/** The decrypted folder copy */
export interface FolderSyncFile {
  version: number;
  exportedAt: string;
  data: FolderSyncData;
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
 * so what it holds is unknown (`unreadable`); or a newer HemoIO wrote it, in a
 * format this one would lose parts of (`newer`)
 */
export type FolderProtectionReason = 'empty' | 'unreadable' | 'newer';

export type FolderSyncOutcome =
  | { status: 'written' }
  | { status: 'unchanged' }
  | { status: 'protected'; reason: FolderProtectionReason };

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

/** A copy's content, `null` for no copy or an empty file, `'unreadable'` when the key cannot read it */
async function open(
  encrypted: ArrayBuffer | null,
  key: CryptoKey
): Promise<FolderSyncFile | null | 'unreadable'> {
  // An interrupted first write can leave an empty file; there is nothing to lose
  if (!encrypted || encrypted.byteLength === 0) return null;

  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(await decrypt(encrypted, key)));
    return isSyncFile(parsed) ? parsed : 'unreadable';
  } catch {
    // Another password, or a damaged file. Not logged: a log would add nothing
    return 'unreadable';
  }
}

/**
 * Whether the copy being replaced should become the previous copy. The
 * previous copy is never one holding less than the one already kept: a
 * browser that lost its data and then gains a result or two must not push the
 * full history out with its second write. One that cannot be read stays too.
 */
async function keepsAsPrevious(
  store: FolderCopyStore,
  replaced: FolderSyncFile,
  key: CryptoKey
): Promise<boolean> {
  const replacedRecords = healthRecords(replaced.data);
  if (replacedRecords === 0) return false;

  const previous = await open(await store.loadPrevious(), key);
  if (previous === 'unreadable') return false;
  return !previous || replacedRecords >= healthRecords(previous.data);
}

/**
 * Write the data to the folder copy, unless that could lose data there.
 * A copy with the same data is not rewritten, so the previous copy stays the
 * one from before the last real change.
 */
export async function writeFolderCopy(
  store: FolderCopyStore,
  data: FolderSyncData,
  key: CryptoKey
): Promise<FolderSyncOutcome> {
  const encrypted = await store.loadCurrent();
  const existing = await open(encrypted, key);
  // Dates serialise to the ISO strings the decrypted copy holds, so equal data compares equal
  const dataJson = JSON.stringify(data);

  if (existing === 'unreadable') {
    return { status: 'protected', reason: 'unreadable' };
  }
  if (existing) {
    if (existing.version > FOLDER_SYNC_FILE_VERSION) {
      return { status: 'protected', reason: 'newer' };
    }
    if (existing.version === FOLDER_SYNC_FILE_VERSION && JSON.stringify(existing.data) === dataJson) {
      return { status: 'unchanged' };
    }
    if (healthRecords(existing.data) > 0 && healthRecords(data) === 0) {
      return { status: 'protected', reason: 'empty' };
    }
  }

  // Built around the string already made, so the data is serialised once
  const file = `{"version":${FOLDER_SYNC_FILE_VERSION},"exportedAt":"${new Date().toISOString()}","data":${dataJson}}`;
  const sealed = await encrypt(new TextEncoder().encode(file).buffer as ArrayBuffer, key);
  const keep = existing && encrypted && (await keepsAsPrevious(store, existing, key));
  await store.save(sealed, keep ? encrypted : undefined);
  return { status: 'written' };
}
