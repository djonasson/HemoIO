/**
 * The lock file: the current password lock, kept beside the folder copy
 *
 * `hemoio-lock.json` is JSON { format, version, lock }, rewritten whenever
 * the copy's lock is written, and only ever holding the current lock (P21:
 * no old lock is left behind for an old password to open). It lets a
 * browser without credentials unwrap the data key when the current copy is
 * missing, or so damaged that its header cannot be read, and then open the
 * previous copy or a dated backup, which carry no lock.
 *
 * The file proves nothing by itself: anyone who can write to the folder can
 * plant one. Recovery trusts its key only once a body in the folder opens
 * under it, which AES-GCM authenticates.
 */

import { isCredentialsV2, isLaterLock, type StoredCredentialsV2 } from '@data/encryption/keyWrapping';
import { cleanLock } from './folderEnvelope';

export const FOLDER_LOCK_FORMAT = 'hemoio-folder-lock';

/** The lock file, as the folder storage provider keeps it */
export interface FolderLockStore {
  /** The lock file's bytes, or null when there is none */
  loadLock(): Promise<ArrayBuffer | null>;
  saveLock(bytes: ArrayBuffer): Promise<void>;
}

/** The lock file's text for this lock */
function lockFileText(lock: StoredCredentialsV2): string {
  return JSON.stringify({ format: FOLDER_LOCK_FORMAT, version: 1, lock: cleanLock(lock) });
}

/** The lock in a lock file; null for none, or for a file that is not a valid lock file */
export function readLockFile(bytes: ArrayBuffer | null): StoredCredentialsV2 | null {
  if (bytes === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { format, version, lock } = parsed as Record<string, unknown>;
  if (format !== FOLDER_LOCK_FORMAT || version !== 1 || !isCredentialsV2(lock)) return null;
  return cleanLock(lock);
}

/**
 * Make the lock file hold this lock. Written only when it holds anything
 * else, so a sync that finds it current does not touch the folder, and
 * never over a later lock (isLaterLock). Rejects
 * when the file cannot be written.
 */
export async function keepLockFile(store: FolderLockStore, lock: StoredCredentialsV2): Promise<void> {
  const text = lockFileText(lock);
  let current: ArrayBuffer | null = null;
  try {
    current = await store.loadLock();
  } catch {
    // Unread is rewritten: the write says whether the folder can be used
  }
  if (current !== null && new TextDecoder().decode(current) === text) return;
  // Never back: the cloud may bring the lock file of a password change on
  // another computer before its copy, and the copy's older lock must not undo it
  const held = readLockFile(current);
  if (held !== null && isLaterLock(held, lock)) return;
  await store.saveLock(new TextEncoder().encode(text).buffer as ArrayBuffer);
}
