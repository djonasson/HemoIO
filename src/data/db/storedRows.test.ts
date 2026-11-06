import { describe, it, expect } from 'vitest';
import { clearStoredData, countStoredRows } from './storedRows';
import { openTestDb } from './testDb';

const at = new Date('2024-01-15T10:00:00Z');
const settings = { storageProvider: 'local' as const, aiProvider: 'openai' as const, language: 'en' };

describe('storedRows', () => {
  it('counts rows without a key', async () => {
    const { db, database } = await openTestDb();
    await db.addLabResultsWithValues([
      {
        labResult: { date: at, labName: 'Lab', createdAt: at, updatedAt: at },
        testValues: [{ biomarkerKey: '2345-7', value: 95, unit: 'mg/dL', createdAt: at, updatedAt: at }],
      },
    ]);
    await database.setAside.add({ table: 'labResults', row: { id: 900, encrypted: 'x' }, savedToFile: 0 });
    // Settings hold no lab data: not counted
    await database.settings.add(settings);

    expect(await countStoredRows(database)).toBe(3);
  });

  it('counts nothing in an empty database', async () => {
    const { database } = await openTestDb();

    expect(await countStoredRows(database)).toBe(0);
  });

  it('clear empties every table', async () => {
    const { db, database } = await openTestDb();
    await db.addLabResultsWithValues([
      {
        labResult: { date: at, labName: 'Lab', createdAt: at, updatedAt: at },
        testValues: [{ biomarkerKey: '2345-7', value: 95, unit: 'mg/dL', createdAt: at, updatedAt: at }],
      },
    ]);
    // Sealed rows as stored: readable IDs and links, the rest ciphertext
    await database.table('userNotes').add({ id: 7, labResultId: 1, encrypted: 'x' });
    await database.table('userPreferences').add({ id: 1, encrypted: 'x' });
    await database.settings.add(settings);
    await database.setAside.add({ table: 'labResults', row: { id: 900 }, savedToFile: 0 });

    await clearStoredData(database);

    const counts = await Promise.all(database.tables.map((table) => table.count()));
    expect(database.tables.map((table) => table.name).sort()).toEqual(
      ['labResults', 'setAside', 'settings', 'testValues', 'userNotes', 'userPreferences'].sort()
    );
    expect(counts).toEqual(database.tables.map(() => 0));
  });
});
