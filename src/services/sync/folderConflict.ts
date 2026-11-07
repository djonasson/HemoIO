/**
 * Keeping the side that is about to be replaced, before anything is replaced
 *
 * Every time the folder copy or this browser's data is replaced by the
 * other (a newer copy loaded, the user's choice in a conflict, or "Replace
 * folder copy" when restoring), the side replaced is first kept as a dated
 * backup in the folder, sealed without the lock (P23). If that backup cannot
 * be saved, the caller replaces nothing.
 */

import { keepFolderBackup, type FolderBackupKind, type FolderBackupStore } from './folderBackups';
import { resealWithoutLock, sealDamagedCopy } from './folderEnvelope';
import { digestFolderData, folderDataJson, sealFolderCopy } from './folderSync';
import type { EncryptedDb } from '@data/db/encryptedDb';
import type { FolderCopySource } from './folderCopy';

interface BrowserDataBackup {
  db: Pick<EncryptedDb, 'exportAllData'>;
  key: CryptoKey;
  backups: FolderBackupStore;
}

/**
 * Keep this browser's data as a backup of the given kind. Given
 * `unchangedSince` (a digest), only when the data still has that digest:
 * the export checked is the one kept, so a change saved meanwhile is never
 * left out of the backup. Resolves false, keeping nothing, when it changed;
 * rejects when the backup cannot be saved.
 */
export async function keepBrowserData(
  { db, key, backups }: BrowserDataBackup,
  { kind, unchangedSince }: { kind: FolderBackupKind; unchangedSince?: string }
): Promise<boolean> {
  const data = await db.exportAllData();
  if (unchangedSince !== undefined && (await digestFolderData(folderDataJson(data))) !== unchangedSince) {
    return false;
  }
  const { bytes } = await sealFolderCopy(data, key, null);
  await keepFolderBackup(backups, bytes, { kind });
  return true;
}

/**
 * Keep a folder copy, as its bytes were read, as a conflict backup: its
 * content unchanged, without its lock. Rejects when the key does not open it
 * or the backup cannot be saved.
 */
export async function keepFolderCopy(
  { key, backups, protect }: { key: CryptoKey; backups: FolderBackupStore; protect?: string[] },
  bytes: ArrayBuffer
): Promise<void> {
  await keepFolderBackup(backups, await resealWithoutLock(bytes, key), { kind: 'conflict', protect });
}

/**
 * Keep the copy now in the folder as a conflict backup, before the user's
 * choice writes over it. Returns its bytes, or null when the folder holds none.
 */
export async function keepCurrentFolderCopy({
  key,
  backups,
  folder,
  protect,
}: {
  key: CryptoKey;
  backups: FolderBackupStore;
  folder: FolderCopySource;
  /** Backups that keeping must not prune */
  protect?: string[];
}): Promise<ArrayBuffer | null> {
  const bytes = await folder.loadCurrent();
  if (bytes === null || bytes.byteLength === 0) return null;
  await keepFolderCopy({ key, backups, protect }, bytes);
  return bytes;
}

/**
 * Keep the file now in the folder, one that cannot be read as a current
 * copy, as a conflict backup before the user's choice writes over it. A
 * file the key opens (a copy saved before LOINC, say) is sealed again
 * without its lock; any other is sealed whole under the key (P41), so no
 * lock it carries is ever kept in plain text. Returns its bytes, or null
 * when the folder holds none; rejects, keeping nothing, when the backup
 * cannot be saved.
 */
export async function keepUnreadableFolderCopy({
  key,
  backups,
  folder,
}: {
  key: CryptoKey;
  backups: FolderBackupStore;
  folder: FolderCopySource;
}): Promise<ArrayBuffer | null> {
  const bytes = await folder.loadCurrent();
  if (bytes === null || bytes.byteLength === 0) return null;
  let sealed: ArrayBuffer;
  try {
    sealed = await resealWithoutLock(bytes, key);
  } catch {
    // Another key, a damaged file, or a damaged header: kept as it lay
    sealed = await sealDamagedCopy(bytes, key);
  }
  await keepFolderBackup(backups, sealed, { kind: 'conflict' });
  return bytes;
}

/**
 * Whether the folder holds a copy that the key opens, and so can be kept as
 * a backup. False when there is none or it cannot be opened (damaged, or
 * another setup's); rejects when the folder cannot be read.
 */
export async function canKeepFolderCopy({
  key,
  folder,
}: {
  key: CryptoKey;
  folder: FolderCopySource;
}): Promise<boolean> {
  const bytes = await folder.loadCurrent();
  if (bytes === null || bytes.byteLength === 0) return false;
  try {
    await resealWithoutLock(bytes, key);
    return true;
  } catch {
    return false;
  }
}
