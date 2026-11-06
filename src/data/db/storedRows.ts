/**
 * The rows this browser holds, counted and cleared without the data key:
 * setup uses them to find data an earlier setup left behind, and Start over
 * clears them, except the rows set aside: those may open again with a key
 * recovered from a folder. What HemoIO keeps outside the database is
 * cleared by clearLocalHemoIOStorage (data/storage/browserStorage.ts).
 */

import { db as defaultDb, type HemoIODatabase } from './index';

/** The tables that hold lab data: the sealed ones, and the rows set aside from them */
const DATA_TABLES = ['labResults', 'testValues', 'userNotes', 'userPreferences', 'setAside'] as const;

/** How many rows of lab data are stored (settings are not counted) */
export async function countStoredRows(database: HemoIODatabase = defaultDb): Promise<number> {
  const counts = await Promise.all(DATA_TABLES.map((name) => database.table(name).count()));
  return counts.reduce((total, count) => total + count, 0);
}

/** Empties the tables in one transaction: all or nothing */
async function clearTables(database: HemoIODatabase, tables: HemoIODatabase['tables']): Promise<void> {
  // Each clear() is an IndexedDB request, so the transaction stays open
  // until the last one completes
  await database.transaction('rw', tables, () => Promise.all(tables.map((table) => table.clear())));
}

/** Empties every table, settings included, in one transaction: all or nothing */
export async function clearStoredData(database: HemoIODatabase = defaultDb): Promise<void> {
  await clearTables(database, database.tables);
}

/**
 * Start over: empties every table but the rows set aside, in one transaction.
 * Those are records no key this browser held could open; a key recovered
 * from a folder copy may open them, so setup offers to recover, keep or
 * clear them, and nothing is deleted unasked.
 */
export async function clearStoredDataButSetAside(database: HemoIODatabase = defaultDb): Promise<void> {
  await clearTables(database, database.tables.filter((table) => table.name !== 'setAside'));
}
