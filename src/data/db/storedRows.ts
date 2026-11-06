/**
 * The rows this browser holds, counted and cleared without the data key:
 * setup uses them to find data an earlier setup left behind, and Start over
 * clears them with the rest of what HemoIO keeps in this browser
 */

import { clearFolderHandleStore } from '@data/storage/FileSystemStorageProvider';
import { db as defaultDb, type HemoIODatabase } from './index';

/** Every localStorage key HemoIO writes starts with this */
const LOCAL_STORAGE_PREFIX = 'hemoio_';

/** The tables that hold lab data: the sealed ones, and the rows set aside from them */
const DATA_TABLES = ['labResults', 'testValues', 'userNotes', 'userPreferences', 'setAside'] as const;

/** How many rows of lab data are stored (settings are not counted) */
export async function countStoredRows(database: HemoIODatabase = defaultDb): Promise<number> {
  const counts = await Promise.all(DATA_TABLES.map((name) => database.table(name).count()));
  return counts.reduce((total, count) => total + count, 0);
}

/** Empties every table, settings included, in one transaction: all or nothing */
export async function clearStoredData(database: HemoIODatabase = defaultDb): Promise<void> {
  // Each clear() is an IndexedDB request, so the transaction stays open
  // until the last one completes
  await database.transaction('rw', database.tables, () =>
    Promise.all(database.tables.map((table) => table.clear()))
  );
}

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
