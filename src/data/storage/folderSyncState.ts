/**
 * What this browser last read from or wrote to the folder copy
 *
 * The revision of that copy and a digest of this browser's data as it was
 * then: a later sync tells from them whether the folder copy was written
 * elsewhere since, and whether this browser changed anything since. Kept in
 * localStorage, sealed with the session key, so nothing about the folder copy
 * can be read there without the password.
 */

import { decryptString, encryptString } from '@data/encryption';

export const FOLDER_SYNC_STATE_KEY = 'hemoio_folder_sync_state';

export interface FolderSyncState {
  /** The folder copy's revision; null for a copy written before revisions were kept */
  revision: string | null;
  /** SHA-256 (base64) of this browser's data when it last read or wrote that revision */
  digest: string;
}

function isFolderSyncState(value: unknown): value is FolderSyncState {
  if (typeof value !== 'object' || value === null) return false;
  const { revision, digest } = value as Partial<FolderSyncState>;
  return (revision === null || typeof revision === 'string') && typeof digest === 'string';
}

/** The state saved with this key; null when there is none, or it cannot be read with this key */
export async function loadFolderSyncState(key: CryptoKey): Promise<FolderSyncState | null> {
  try {
    const stored = localStorage.getItem(FOLDER_SYNC_STATE_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(await decryptString(stored, key));
    return isFolderSyncState(parsed) ? parsed : null;
  } catch {
    // Another setup's key, or a damaged value: as if this browser never read the copy
    return null;
  }
}

export async function saveFolderSyncState(state: FolderSyncState, key: CryptoKey): Promise<void> {
  const text = JSON.stringify(state);
  localStorage.setItem(FOLDER_SYNC_STATE_KEY, await encryptString(text, key));
}
