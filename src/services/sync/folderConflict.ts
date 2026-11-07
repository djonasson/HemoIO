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
import { resealWithoutLock, sealDamagedCopy, showsNoLock } from './folderEnvelope';
import {
  digestFolderData,
  folderCopyId,
  folderDataJson,
  isReplaceableFolderCopy,
  sealFolderCopy,
} from './folderSync';
import type { EncryptedDb } from '@data/db/encryptedDb';
import type { StoredCredentialsV2 } from '@data/encryption/keyWrapping';
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
 * Keep a folder file, as its bytes were read, as a conflict backup, as
 * backupOfFolderFile keeps it: the one rule for every file kept before it is
 * replaced. Resolves the backup's name; rejects when it cannot be saved.
 */
export async function keepFolderCopy(
  { key, backups, protect }: { key: CryptoKey; backups: FolderBackupStore; protect?: string[] },
  bytes: ArrayBuffer
): Promise<string> {
  return keepFolderBackup(backups, await backupOfFolderFile(bytes, key), { kind: 'conflict', protect });
}

/**
 * A folder file as it is kept as a backup. One the key opens is sealed again
 * without its lock (P23). One that shows no lock in plain text (the raw
 * format from before the envelope, under another password or an earlier
 * setup) is kept as it lies, so its owner can still restore it from their
 * own setup. Any other is sealed whole under the key (P41): a lock its
 * header shows is never kept in plain text.
 */
export async function backupOfFolderFile(bytes: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
  try {
    return await resealWithoutLock(bytes, key);
  } catch {
    return showsNoLock(bytes) ? bytes.slice(0) : sealDamagedCopy(bytes, key);
  }
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
 * Before a copy the user chose to replace is written over: keep it, and the
 * previous copy beside it, as conflict backups, neither pruning the other.
 * Only for the very file the user was asked about (`fileId`, by its bytes),
 * and only while the sync would replace it (isReplaceableFolderCopy):
 * otherwise nothing is kept and false is returned, so the question is asked
 * again. Rejects when a backup cannot be saved.
 */
export async function keepFolderFilesBeforeReplace({
  key,
  ownLock,
  backups,
  folder,
  fileId,
}: {
  key: CryptoKey;
  ownLock: StoredCredentialsV2 | null;
  backups: FolderBackupStore;
  folder: Required<FolderCopySource>;
  fileId: string;
}): Promise<boolean> {
  const bytes = await folder.loadCurrent();
  if (bytes === null || bytes.byteLength === 0) return false;
  if ((await folderCopyId(bytes, null)) !== fileId) return false;
  if (!(await isReplaceableFolderCopy(bytes, key, ownLock))) return false;
  const kept = await keepFolderCopy({ key, backups }, bytes);
  const previous = await folder.loadPrevious();
  if (previous !== null && previous.byteLength > 0) await keepFolderCopy({ key, backups, protect: [kept] }, previous);
  return true;
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
