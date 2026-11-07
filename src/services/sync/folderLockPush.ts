/**
 * Putting a changed password's lock into the folder at once, from outside
 * the folder sync: the password change asks, the folder sync (the one place
 * that knows the session and runs folder writes in turn) does it.
 */

/** Resolves whether the folder holds the lock now; false when it could not be put there */
type FolderLockPush = () => Promise<boolean>;

let push: FolderLockPush | null = null;

/** The folder sync registers how the lock is put into the folder; null when it stops */
export function setFolderLockPush(next: FolderLockPush | null): void {
  push = next;
}

/**
 * Put the stored lock into the folder now. True when the folder holds it,
 * or folder storage is off; false when it could not be put there (no access,
 * a copy this key does not open, a failed write) or no folder sync runs.
 * Never rejects.
 */
export async function pushLockToFolder(): Promise<boolean> {
  if (!push) return false;
  try {
    return await push();
  } catch {
    return false;
  }
}
