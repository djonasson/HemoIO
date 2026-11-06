/**
 * What HemoIO keeps in this browser outside its database: the localStorage
 * keys and the chosen folder's handle. Start over, and setup's "clear it
 * and set up anew", remove it all; the database is cleared by storedRows.
 */

import { clearFolderHandleStore } from './FileSystemStorageProvider';

/** Every localStorage key HemoIO writes starts with this */
const LOCAL_STORAGE_PREFIX = 'hemoio_';

/**
 * Removes every localStorage key starting with 'hemoio_' (credentials, sync
 * state, API key, provider choices, the LocalStorageProvider backup) and
 * FileSystemStorageProvider's handle store. The folder and its files are
 * not touched, nor is anything else in this origin's storage.
 */
export async function clearLocalHemoIOStorage(): Promise<void> {
  // The folder choice first, so a tab sent to setup by the credentials'
  // removal is not offered it; its failure still lets the keys go
  let handleStoreCleared = true;
  try {
    await clearFolderHandleStore();
  } catch {
    handleStoreCleared = false;
  }
  // All in one task: other tabs hear of the removals only once all are done
  Object.keys(localStorage)
    .filter((key) => key.startsWith(LOCAL_STORAGE_PREFIX))
    .forEach((key) => localStorage.removeItem(key));
  // Fixed text: the caller logs it, and it names no stored data
  if (!handleStoreCleared) throw new Error('Could not forget the chosen folder');
}
