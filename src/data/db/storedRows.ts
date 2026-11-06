/**
 * The rows this browser holds, counted and cleared without the data key:
 * setup uses them to find data an earlier setup left behind
 */

import { db as defaultDb, type HemoIODatabase } from './index';

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
