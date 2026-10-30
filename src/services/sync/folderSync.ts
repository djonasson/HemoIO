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
import type { StorageProvider } from '@/types';

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

/**
 * Why a sync left the folder copy alone: the browser has no health data but
 * the folder copy does (`empty`), or the folder copy cannot be opened with the
 * session key, so what it holds is unknown (`unreadable`)
 */
export type FolderProtectionReason = 'empty' | 'unreadable';

export type FolderSyncOutcome =
  | { status: 'written' }
  | { status: 'unchanged' }
  | { status: 'protected'; reason: FolderProtectionReason };

/**
 * Lab results, test values and notes are what a person would lose. Settings
 * and preferences do not count: a fresh setup has them too.
 */
function holdsHealthData(data: FolderSyncData): boolean {
  return data.labResults.length > 0 || data.testValues.length > 0 || data.userNotes.length > 0;
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

/** The folder copy, `null` when there is none, `'unreadable'` when the key cannot open it */
async function readFolderCopy(
  store: StorageProvider,
  key: CryptoKey
): Promise<FolderSyncFile | null | 'unreadable'> {
  if (!(await store.exists())) return null;
  const encrypted = await store.load();
  // An interrupted first write can leave an empty file; there is nothing to lose
  if (encrypted.byteLength === 0) return null;

  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(await decrypt(encrypted, key)));
    return isSyncFile(parsed) ? parsed : 'unreadable';
  } catch {
    // Another password, or a damaged file. The error says nothing about the
    // content, but it is not logged either: there is nothing a log would add.
    return 'unreadable';
  }
}

/**
 * Write the data to the folder copy, unless that could lose data there.
 * A copy with the same data is not rewritten, so the storage keeps the copy
 * from before the last real change as its previous copy.
 */
export async function writeFolderCopy(
  store: StorageProvider,
  data: FolderSyncData,
  key: CryptoKey
): Promise<FolderSyncOutcome> {
  const existing = await readFolderCopy(store, key);

  if (existing === 'unreadable') {
    return { status: 'protected', reason: 'unreadable' };
  }
  if (existing) {
    // Dates serialise to the ISO strings the decrypted copy holds, so equal data compares equal
    const unchanged =
      existing.version === FOLDER_SYNC_FILE_VERSION &&
      JSON.stringify(existing.data) === JSON.stringify(data);
    if (unchanged) {
      return { status: 'unchanged' };
    }
    if (holdsHealthData(existing.data) && !holdsHealthData(data)) {
      return { status: 'protected', reason: 'empty' };
    }
  }

  const file: FolderSyncFile = {
    version: FOLDER_SYNC_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
  const plain = new TextEncoder().encode(JSON.stringify(file));
  await store.save(await encrypt(plain.buffer as ArrayBuffer, key));
  return { status: 'written' };
}
