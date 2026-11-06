/**
 * Restore a parsed backup into the database, replacing existing lab data
 * (results, values, notes) and, when the backup has them, preferences.
 * Device settings (storage location, AI configuration) are left alone.
 *
 * Records get new IDs on insert (IndexedDB auto-increment does not reset when
 * tables are cleared), so references between records are rewritten from the
 * backup's IDs to the newly assigned ones.
 */

import type { LabResult, TestValue, UserNote, UserPreferences } from '@/types';
import type { ParsedBackupData } from './jsonImport';

/** The records a restore stores */
interface RestoredData {
  labResults: LabResult[];
  testValues: TestValue[];
  userNotes: UserNote[];
  userPreferences?: Omit<UserPreferences, 'id'>;
}

/**
 * The database operation a restore needs (implemented by EncryptedDb)
 */
export interface RestoreTarget {
  replaceLabData(data: RestoredData): Promise<RestoreSummary>;
}

/** A database that can restore only while nothing changed its data (implemented by EncryptedDb) */
export interface GuardedRestoreTarget {
  replaceLabDataIfUnchanged(data: RestoredData, stamp: string): Promise<RestoreSummary | null>;
}

export interface RestoreSummary {
  labResults: number;
  testValues: number;
  notes: number;
}

/**
 * Replace all data with the backup's contents, in one transaction: a restore
 * that fails part-way leaves the existing data in place.
 *
 * Test values whose lab result is not in the backup are skipped, since they
 * would reference a record that does not exist.
 */
export async function restoreBackup(
  db: RestoreTarget,
  data: ParsedBackupData
): Promise<RestoreSummary> {
  return db.replaceLabData(restoredData(data));
}

/**
 * As restoreBackup, but only while the stored data is as it was when
 * `stamp` was taken: resolves null, replacing nothing, when a change was
 * saved since
 */
export async function restoreBackupIfUnchanged(
  db: GuardedRestoreTarget,
  data: ParsedBackupData,
  stamp: string
): Promise<RestoreSummary | null> {
  return db.replaceLabDataIfUnchanged(restoredData(data), stamp);
}

function restoredData(data: ParsedBackupData): RestoredData {
  return {
    labResults: data.labResults,
    testValues: data.testValues,
    userNotes: data.userNotes,
    userPreferences: data.userPreferences ? withoutId(data.userPreferences) : undefined,
  };
}

function withoutId<T extends { id?: number }>(record: T): Omit<T, 'id'> {
  const copy = { ...record };
  delete copy.id;
  return copy;
}
