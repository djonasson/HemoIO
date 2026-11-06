/**
 * Dated backups in the folder: the side the user did not choose
 *
 * When the folder copy and this browser both changed, the user chooses which
 * to keep, and the other is kept here, so that a wrong choice can be undone.
 * Only the newest few are kept: a synced folder must not fill up with copies
 * of health data. A backup is sealed like the folder copy, but never carries
 * the password lock: only the current copy does (an old lock left in a
 * backup would let an old password open the data key).
 */

import { openEnvelope, sealEnvelope } from './folderEnvelope';

export const MAX_FOLDER_BACKUPS = 10;

/** The folder's backups, as the folder storage provider keeps them */
export interface FolderBackupStore {
  listBackups(): Promise<string[]>;
  saveBackup(name: string, bytes: ArrayBuffer): Promise<void>;
  loadBackup(name: string): Promise<ArrayBuffer>;
  deleteBackup(name: string): Promise<void>;
}

const BACKUP_NAME = /^hemoio-backup-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z\.encrypted$/;

/** 'hemoio-backup-20261106T101500123Z.encrypted': UTC to the millisecond, so names sort by time */
export function backupFileName(at: Date): string {
  return `hemoio-backup-${at.toISOString().replace(/[-:.]/g, '')}.encrypted`;
}

/** When the backup of this name was made; null for a name that is not a backup's */
export function backupDate(name: string): Date | null {
  const match = BACKUP_NAME.exec(name);
  if (!match) return null;
  const [year, month, day, hours, minutes, seconds, ms] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds, ms));
  // Date.UTC rolls a 13th month or a 61st second over; such a name is no backup's
  return backupFileName(date) === name ? date : null;
}

/**
 * Saves the bytes as a dated backup, then deletes all but the
 * MAX_FOLDER_BACKUPS newest. A failed save deletes nothing. Returns the name.
 */
export async function keepFolderBackup(
  store: FolderBackupStore,
  bytes: ArrayBuffer,
  at: Date = new Date()
): Promise<string> {
  const existing = new Set(await store.listBackups());
  let time = at.getTime();
  // Two backups in one millisecond: the later one is named a millisecond on
  while (existing.has(backupFileName(new Date(time)))) time += 1;
  const name = backupFileName(new Date(time));
  await store.saveBackup(name, bytes);

  const newestFirst = [...existing, name]
    .map((backup) => ({ backup, date: backupDate(backup) }))
    .filter((entry): entry is { backup: string; date: Date } => entry.date !== null)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  for (const { backup } of newestFirst.slice(MAX_FOLDER_BACKUPS)) {
    try {
      await store.deleteBackup(backup);
    } catch {
      // The backup is saved; an old one left behind is removed the next time
      console.error('Could not remove an old folder backup');
    }
  }
  return name;
}

/**
 * The folder copy as a backup: its content sealed again, unchanged (the same
 * revision), without the lock it carries. Rejects when the key does not open it.
 */
export async function sealedForBackup(folderBytes: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
  const { plain } = await openEnvelope(folderBytes, key);
  return sealEnvelope(new Uint8Array(plain), key, null);
}
