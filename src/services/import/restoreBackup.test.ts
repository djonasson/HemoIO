import { describe, it, expect } from 'vitest';
import { restoreBackup, type RestoreTarget } from './restoreBackup';
import type { ParsedBackupData } from './jsonImport';
import type { LabResult, TestValue, UserNote } from '@/types';

/**
 * In-memory stand-in for the encrypted database. IDs continue from an
 * offset because IndexedDB auto-increment does not reset when tables are
 * cleared, so restored records never get their backup IDs back.
 */
function createFakeDb(idOffset = 100) {
  let nextId = idOffset;
  const db = {
    labResults: [] as LabResult[],
    testValues: [] as TestValue[],
    notes: [] as UserNote[],
    calls: [] as string[],
    async clearAllData() {
      db.calls.push('clear');
      db.labResults = [];
      db.testValues = [];
      db.notes = [];
    },
    async addLabResult(labResult: Omit<LabResult, 'id'>) {
      const id = nextId++;
      db.labResults.push({ ...labResult, id });
      return id;
    },
    async addTestValue(testValue: Omit<TestValue, 'id'>) {
      const id = nextId++;
      db.testValues.push({ ...testValue, id });
      return id;
    },
    async addUserNote(note: Omit<UserNote, 'id'>) {
      const id = nextId++;
      db.notes.push({ ...note, id });
      return id;
    },
  };
  return db satisfies RestoreTarget;
}

const now = new Date('2024-01-15T10:00:00Z');

function backup(overrides: Partial<ParsedBackupData> = {}): ParsedBackupData {
  return {
    labResults: [
      { id: 1, date: now, labName: 'Quest', createdAt: now, updatedAt: now },
      // Same date and lab as #1: must still be told apart
      { id: 2, date: now, labName: 'Quest', createdAt: now, updatedAt: now },
    ],
    testValues: [
      { id: 10, labResultId: 1, biomarkerKey: 'marker-5', value: 1, unit: 'u', createdAt: now, updatedAt: now },
      { id: 11, labResultId: 2, biomarkerKey: 'marker-5', value: 2, unit: 'u', createdAt: now, updatedAt: now },
    ],
    userNotes: [
      { id: 20, labResultId: 2, content: 'on result 2', tags: [], createdAt: now, updatedAt: now },
      { id: 21, testValueId: 11, content: 'on value 11', tags: [], createdAt: now, updatedAt: now },
      { id: 22, biomarkerKey: 'marker-5', content: 'on biomarker', tags: [], createdAt: now, updatedAt: now },
    ],
    settings: null,
    userPreferences: null,
    schemaVersion: 1,
    exportedAt: now,
    ...overrides,
  };
}

describe('restoreBackup', () => {
  it('replaces existing data before restoring', async () => {
    const db = createFakeDb();
    db.labResults.push({ id: 1, date: now, labName: 'Old', createdAt: now, updatedAt: now });

    await restoreBackup(db, backup());

    expect(db.calls[0]).toBe('clear');
    expect(db.labResults.map((r) => r.labName)).toEqual(['Quest', 'Quest']);
  });

  it('links test values to the new IDs of their lab results', async () => {
    const db = createFakeDb();

    await restoreBackup(db, backup());

    const [first, second] = db.labResults;
    expect(db.testValues.find((tv) => tv.value === 1)?.labResultId).toBe(first.id);
    expect(db.testValues.find((tv) => tv.value === 2)?.labResultId).toBe(second.id);
  });

  it('links notes to the new IDs of their lab results and test values', async () => {
    const db = createFakeDb();

    await restoreBackup(db, backup());

    const secondResult = db.labResults[1];
    const value11 = db.testValues.find((tv) => tv.value === 2)!;
    expect(db.notes.find((n) => n.content === 'on result 2')?.labResultId).toBe(secondResult.id);
    expect(db.notes.find((n) => n.content === 'on value 11')?.testValueId).toBe(value11.id);
  });

  it('keeps notes that only reference a biomarker', async () => {
    const db = createFakeDb();

    await restoreBackup(db, backup());

    const note = db.notes.find((n) => n.content === 'on biomarker');
    expect(note).toMatchObject({ biomarkerKey: 'marker-5', labResultId: undefined, testValueId: undefined });
  });

  it('skips test values whose lab result is not in the backup', async () => {
    const db = createFakeDb();
    const data = backup();
    data.testValues.push({
      id: 12, labResultId: 99, biomarkerKey: 'marker-5', value: 3, unit: 'u', createdAt: now, updatedAt: now,
    });

    const summary = await restoreBackup(db, data);

    expect(db.testValues.map((tv) => tv.value)).toEqual([1, 2]);
    expect(summary).toEqual({ labResults: 2, testValues: 2, notes: 3 });
  });

  it('does not reuse backup IDs for new records', async () => {
    const db = createFakeDb();

    await restoreBackup(db, backup());

    const ids = [...db.labResults, ...db.testValues, ...db.notes].map((r) => r.id);
    expect(ids.every((id) => id! >= 100)).toBe(true);
  });
});
