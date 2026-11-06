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
import { BACKUP_SCHEMA_VERSION } from '@services/export/jsonExport';
import { isPreLoincBackupVersion } from '@services/import';
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
 * so what it holds is unknown (`unreadable`); a newer HemoIO wrote it, in a
 * format this one would lose parts of (`newer`); or an earlier HemoIO wrote
 * it before tests were identified by LOINC, so it cannot be restored and may
 * be the only copy of that history (`before-loinc`); or stored records that
 * cannot be opened are set aside and not yet saved, and the folder copy may
 * still hold them (`set-aside`)
 */
export type FolderProtectionReason =
  | 'empty'
  | 'unreadable'
  | 'newer'
  | 'before-loinc'
  | 'set-aside';

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

/**
 * A copy's content: `null` for no copy or an empty file, or why it cannot be
 * read as a current copy
 */
async function open(
  encrypted: ArrayBuffer | null,
  key: CryptoKey
): Promise<FolderSyncFile | null | Exclude<FolderProtectionReason, 'empty' | 'set-aside'>> {
  // An interrupted first write can leave an empty file; there is nothing to lose
  if (!encrypted || encrypted.byteLength === 0) return null;

  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(await decrypt(encrypted, key)));
    // Checked first: a newer HemoIO may lay its data out in a way this one cannot check
    const version = (parsed as { version?: unknown } | null)?.version;
    if (typeof version === 'number' && version > FOLDER_SYNC_FILE_VERSION) return 'newer';
    if (typeof version === 'number' && isPreLoincBackupVersion(version)) return 'before-loinc';
    return isSyncFile(parsed) ? parsed : 'unreadable';
  } catch {
    // Another password, or a damaged file. Not logged: a log would add nothing
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
  if (!previous || previous === 'unreadable') return true;
  return replacedRecords * 2 >= healthRecords(previous.data);
}

/**
 * Write the data to the folder copy, unless that could lose data there.
 * A copy with the same data is not rewritten, so the previous copy stays the
 * one from before the last real change.
 *
 * While records that cannot be opened are set aside and unsaved, the folder
 * copy may be the only place that still holds them, and the export leaves
 * them out: it is left as it is, and not even read.
 */
export async function writeFolderCopy(
  store: FolderCopyStore,
  data: FolderSyncData,
  key: CryptoKey,
  options: { setAsideUnsaved?: number } = {}
): Promise<FolderSyncOutcome> {
  if ((options.setAsideUnsaved ?? 0) > 0) {
    return { status: 'protected', reason: 'set-aside' };
  }
  const encrypted = await store.loadCurrent();
  const existing = await open(encrypted, key);
  // Dates serialise to the ISO strings the decrypted copy holds, so equal data compares equal
  const dataJson = JSON.stringify(data);

  if (typeof existing === 'string') {
    return { status: 'protected', reason: existing };
  }
  if (existing) {
    if (JSON.stringify(existing.data) === dataJson) {
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
