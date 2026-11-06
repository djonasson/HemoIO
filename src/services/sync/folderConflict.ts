/**
 * Keeping the side that is about to be replaced, before anything is replaced
 *
 * Every time the folder copy or this browser's data is replaced by the
 * other (a newer copy loaded, the user's choice in a conflict, or "Replace
 * folder copy" when restoring), the side replaced is first kept as a dated
 * backup in the folder, sealed without the lock (P23). If that backup cannot
 * be saved, the caller replaces nothing.
 */

import { keepFolderBackup, sealedForBackup, type FolderBackupKind, type FolderBackupStore } from './folderBackups';
import { digestFolderData, folderDataJson, sealFolderCopy } from './folderSync';
import type { EncryptedDb } from '@data/db/encryptedDb';
import type { FolderCopySource } from './folderCopy';

export interface BrowserDataBackup {
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
  { key, backups }: { key: CryptoKey; backups: FolderBackupStore },
  bytes: ArrayBuffer
): Promise<void> {
  await keepFolderBackup(backups, await sealedForBackup(bytes, key), { kind: 'conflict' });
}

/**
 * Keep the copy now in the folder as a conflict backup, before the user's
 * choice writes over it. Returns its bytes, or null when the folder holds none.
 */
export async function keepCurrentFolderCopy({
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
  await keepFolderCopy({ key, backups }, bytes);
  return bytes;
}
