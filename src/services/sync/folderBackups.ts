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

/**
 * What a backup holds: the side of a conflict the user did not choose
 * (`conflict`), or this computer's data, kept before a newer folder copy was
 * loaded over it (`before-load`). Each kind keeps its own newest few, so
 * routine loads never push out the user's conflict backups.
 */
export type FolderBackupKind = 'conflict' | 'before-load';

const PREFIX: Record<FolderBackupKind, string> = {
  conflict: 'hemoio-backup-',
  'before-load': 'hemoio-autobackup-',
};

const BACKUP_NAME =
  /^(hemoio-backup-|hemoio-autobackup-)(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z\.encrypted$/;

/**
 * 'hemoio-backup-20261106T101500123Z.encrypted' ('hemoio-autobackup-…' before
 * a load): UTC to the millisecond, so names of a kind sort by time
 */
export function backupFileName(at: Date, kind: FolderBackupKind = 'conflict'): string {
  return `${PREFIX[kind]}${at.toISOString().replace(/[-:.]/g, '')}.encrypted`;
}

/** The kind of backup of this name; null for a name that is not a backup's */
export function backupKind(name: string): FolderBackupKind | null {
  return backupDate(name) === null ? null : name.startsWith(PREFIX.conflict) ? 'conflict' : 'before-load';
}

/** When the backup of this name was made; null for a name that is not a backup's */
export function backupDate(name: string): Date | null {
  const match = BACKUP_NAME.exec(name);
  if (!match) return null;
  const [year, month, day, hours, minutes, seconds, ms] = match.slice(2).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds, ms));
  const kind: FolderBackupKind = match[1] === PREFIX.conflict ? 'conflict' : 'before-load';
  // Date.UTC rolls a 13th month or a 61st second over; such a name is no backup's
  return backupFileName(date, kind) === name ? date : null;
}

export interface KeepFolderBackupOptions {
  kind: FolderBackupKind;
  /** When the backup is made; now by default */
  at?: Date;
  /** Backups never to delete, such as the one about to be restored */
  protect?: string[];
}

/**
 * Backups shown for restoring in this tab, by how many confirmations show
 * them: no backup kept meanwhile, by a sync or a choice, prunes them
 */
const shownForRestore = new Map<string, number>();

/**
 * Protect a backup from pruning while a restore confirmation shows it.
 * Returns the release, which only the first call undoes.
 */
export function protectFolderBackup(name: string): () => void {
  shownForRestore.set(name, (shownForRestore.get(name) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = (shownForRestore.get(name) ?? 1) - 1;
    if (count > 0) shownForRestore.set(name, count);
    else shownForRestore.delete(name);
  };
}

/**
 * Saves the bytes as a dated backup of its kind, then deletes the oldest
 * others of that kind, so that MAX_FOLDER_BACKUPS are left, the new one
 * among them. Protected backups, and those shown for restoring, are not
 * deleted, so a few more may be left. A failed save deletes nothing.
 * Returns the name.
 */
export async function keepFolderBackup(
  store: FolderBackupStore,
  bytes: ArrayBuffer,
  { kind, at = new Date(), protect = [] }: KeepFolderBackupOptions
): Promise<string> {
  const existing = new Set(await store.listBackups());
  let time = at.getTime();
  // Two backups in one millisecond: the later one is named a millisecond on
  while (existing.has(backupFileName(new Date(time), kind))) time += 1;
  const name = backupFileName(new Date(time), kind);
  await store.saveBackup(name, bytes);

  // The one just saved always stays, whatever the clocks of the computers
  // that made the others said: the newest of the rest make up the number
  const othersNewestFirst = [...existing]
    .filter((backup) => backupKind(backup) === kind)
    .map((backup) => ({ backup, date: backupDate(backup)! }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  for (const { backup } of othersNewestFirst.slice(MAX_FOLDER_BACKUPS - 1)) {
    if (protect.includes(backup) || shownForRestore.has(backup)) continue;
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
