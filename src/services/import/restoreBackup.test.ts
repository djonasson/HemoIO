import { describe, it, expect, afterEach, vi } from 'vitest';
import { openTestDb } from '@data/db/testDb';
import { restoreBackup } from './restoreBackup';
import type { ParsedBackupData } from './jsonImport';
import type { EncryptedDb } from '@data/db/encryptedDb';

afterEach(() => {
  vi.restoreAllMocks();
});

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

/** Records with IDs 1–30, so restored records cannot get their backup IDs back */
async function seedExisting(db: EncryptedDb): Promise<void> {
  for (let i = 0; i < 30; i++) {
    const labResultId = await db.addLabResult({
      date: now,
      labName: 'Old lab',
      createdAt: now,
      updatedAt: now,
    });
    await db.addTestValue({
      labResultId,
      biomarkerKey: 'old',
      value: 9,
      unit: 'u',
      createdAt: now,
      updatedAt: now,
    });
    await db.addNote({ labResultId, content: 'old note', tags: [], createdAt: now, updatedAt: now });
  }
}

describe('restoreBackup', () => {
  it('replaces existing data', async () => {
    const { db } = await openTestDb();
    await seedExisting(db);

    await restoreBackup(db, backup());

    expect((await db.getAllLabResults()).map((r) => r.labName)).toEqual(['Quest', 'Quest']);
    expect(await db.getAllTestValues()).toHaveLength(2);
    expect((await db.getAllNotes()).map((n) => n.content).sort()).toEqual([
      'on biomarker',
      'on result 2',
      'on value 11',
    ]);
  });

  it('links test values to the new IDs of their lab results', async () => {
    const { db } = await openTestDb();
    await seedExisting(db);

    await restoreBackup(db, backup());

    const results = await db.getAllLabResults();
    const values = await db.getAllTestValues();
    const resultIds = new Set(results.map((r) => r.id));
    expect(values.every((tv) => resultIds.has(tv.labResultId))).toBe(true);
    expect(new Set(values.map((tv) => tv.labResultId)).size).toBe(2);
  });

  it('links notes to the new IDs of their lab results and test values', async () => {
    const { db } = await openTestDb();
    await seedExisting(db);

    await restoreBackup(db, backup());

    const value2 = (await db.getAllTestValues()).find((tv) => tv.value === 2)!;
    const notes = await db.getAllNotes();
    expect(notes.find((n) => n.content === 'on result 2')?.labResultId).toBe(value2.labResultId);
    expect(notes.find((n) => n.content === 'on value 11')?.testValueId).toBe(value2.id);
  });

  it('keeps notes that only reference a biomarker', async () => {
    const { db } = await openTestDb();

    await restoreBackup(db, backup());

    const note = (await db.getAllNotes()).find((n) => n.content === 'on biomarker');
    expect(note).toMatchObject({ biomarkerKey: 'marker-5' });
    expect(note?.labResultId).toBeUndefined();
    expect(note?.testValueId).toBeUndefined();
  });

  it('skips test values whose lab result is not in the backup', async () => {
    const { db } = await openTestDb();
    const data = backup();
    data.testValues.push({
      id: 12, labResultId: 99, biomarkerKey: 'marker-5', value: 3, unit: 'u', createdAt: now, updatedAt: now,
    });

    const summary = await restoreBackup(db, data);

    expect((await db.getAllTestValues()).map((tv) => tv.value).sort()).toEqual([1, 2]);
    expect(summary).toEqual({ labResults: 2, testValues: 2, notes: 3 });
  });

  it('keeps the encrypted fields readable', async () => {
    const { db } = await openTestDb();
    const data = backup();
    data.testValues[0].rawText = 'Glucose';

    await restoreBackup(db, data);

    expect((await db.getAllTestValues()).find((tv) => tv.value === 1)?.rawText).toBe('Glucose');
  });

  it('keeps existing preferences when the backup has none', async () => {
    const { db } = await openTestDb();
    await db.savePreferences({
      unitPreferences: {},
      personalTargets: { glucose: { high: 99 } },
      theme: 'dark',
      dateFormat: 'MM/DD/YYYY',
    });

    await restoreBackup(db, backup({ userPreferences: null }));

    expect((await db.getPreferences())?.personalTargets).toEqual({ glucose: { high: 99 } });
  });

  it('restores preferences from the backup', async () => {
    const { db } = await openTestDb();
    const fromBackup = { id: 7, unitPreferences: { glucose: 'mmol/L' }, personalTargets: {}, theme: 'light' as const, dateFormat: 'YYYY-MM-DD' as const };

    await restoreBackup(db, backup({ userPreferences: fromBackup }));

    expect(await db.getPreferences()).toEqual(
      expect.objectContaining({ unitPreferences: { glucose: 'mmol/L' }, theme: 'light', dateFormat: 'YYYY-MM-DD' })
    );
  });

  it('leaves existing data untouched when a restore fails part-way', async () => {
    const { db, database } = await openTestDb();
    await seedExisting(db);
    vi.spyOn(database.userNotes, 'bulkAdd').mockRejectedValue(new Error('Disk full'));

    await expect(restoreBackup(db, backup())).rejects.toThrow('Disk full');

    expect(await db.getAllLabResults()).toHaveLength(30);
    expect(await db.getAllTestValues()).toHaveLength(30);
    expect(await db.getAllNotes()).toHaveLength(30);
  });
});
