/**
 * Restore a parsed backup into the database, replacing existing data.
 *
 * Records get new IDs on insert (IndexedDB auto-increment does not reset when
 * tables are cleared), so references between records are rewritten from the
 * backup's IDs to the newly assigned ones.
 */

import type { LabResult, TestValue, UserNote } from '@/types';
import type { ParsedBackupData } from './jsonImport';

/**
 * The database operations a restore needs (implemented by EncryptedDb)
 */
export interface RestoreTarget {
  clearAllData(): Promise<void>;
  addLabResult(labResult: Omit<LabResult, 'id'>): Promise<number>;
  addTestValue(testValue: Omit<TestValue, 'id'>): Promise<number>;
  addUserNote(note: Omit<UserNote, 'id'>): Promise<number>;
}

export interface RestoreSummary {
  labResults: number;
  testValues: number;
  notes: number;
}

/**
 * Replace all data with the backup's contents.
 *
 * Test values whose lab result is not in the backup are skipped, since they
 * would reference a record that does not exist.
 */
export async function restoreBackup(
  db: RestoreTarget,
  data: ParsedBackupData
): Promise<RestoreSummary> {
  await db.clearAllData();
  const summary: RestoreSummary = { labResults: 0, testValues: 0, notes: 0 };

  const labResultIds = new Map<number, number>();
  for (const labResult of data.labResults) {
    const newId = await db.addLabResult(withoutId(labResult));
    if (labResult.id !== undefined) labResultIds.set(labResult.id, newId);
    summary.labResults++;
  }

  const testValueIds = new Map<number, number>();
  for (const testValue of data.testValues) {
    const labResultId = labResultIds.get(testValue.labResultId);
    if (labResultId === undefined) continue;
    const newId = await db.addTestValue({ ...withoutId(testValue), labResultId });
    if (testValue.id !== undefined) testValueIds.set(testValue.id, newId);
    summary.testValues++;
  }

  for (const note of data.userNotes) {
    await db.addUserNote({
      ...withoutId(note),
      labResultId: note.labResultId !== undefined ? labResultIds.get(note.labResultId) : undefined,
      testValueId: note.testValueId !== undefined ? testValueIds.get(note.testValueId) : undefined,
    });
    summary.notes++;
  }

  return summary;
}

function withoutId<T extends { id?: number }>(record: T): Omit<T, 'id'> {
  const copy = { ...record };
  delete copy.id;
  return copy;
}
