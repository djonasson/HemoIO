import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import Dexie from 'dexie';
import { HemoIODatabase } from './index';

/** The v6 schema exactly as shipped before tests were identified by LOINC */
function openV6(name: string): Dexie {
  const legacy = new Dexie(name);
  legacy.version(6).stores({
    labResults: '++id',
    testValues: '++id, labResultId',
    biomarkers: '++id, name, category',
    userPreferences: '++id',
    settings: '++id',
    userNotes: '++id, labResultId, testValueId',
    meta: '&key',
  });
  return legacy;
}

const names: string[] = [];
afterEach(async () => {
  await Promise.all(names.splice(0).map((n) => Dexie.delete(n)));
});

async function seedV6(name: string): Promise<void> {
  names.push(name);
  const legacy = openV6(name);
  await legacy.table('labResults').add({ encrypted: 'enc:lab' });
  await legacy.table('testValues').bulkAdd([
    { labResultId: 1, encrypted: 'enc:v1' },
    { labResultId: 1, encrypted: 'enc:v2' },
  ]);
  await legacy.table('userNotes').add({ labResultId: 1, encrypted: 'enc:n1' });
  await legacy.table('userPreferences').add({ encrypted: 'enc:prefs' });
  await legacy.table('biomarkers').add({ name: 'Glucose', category: 'metabolic' });
  await legacy.table('meta').put({ key: 'migrate-records' });
  await legacy.table('settings').add({
    storageProvider: 'local',
    aiProvider: 'ollama',
    ollamaModel: 'llama3',
    language: 'en',
  });
  legacy.close();
}

describe('database upgrade to LOINC codes', () => {
  it('upgrade to v7 empties values and per-test preferences and keeps settings', async () => {
    await seedV6('upgrade-test-1');
    const db = new HemoIODatabase('upgrade-test-1');
    await db.open();

    expect(await db.labResults.count()).toBe(0);
    expect(await db.testValues.count()).toBe(0);
    expect(await db.userNotes.count()).toBe(0);
    // Sealed: the per-test maps cannot be cleared one by one
    expect(await db.userPreferences.count()).toBe(0);
    expect(await db.settings.toArray()).toEqual([
      expect.objectContaining({ aiProvider: 'ollama', ollamaModel: 'llama3', language: 'en' }),
    ]);
    db.close();
  });

  it('drops the legacy biomarker and marker tables', async () => {
    await seedV6('upgrade-test-2');
    const db = new HemoIODatabase('upgrade-test-2');
    await db.open();

    expect(db.tables.map((table) => table.name).sort()).toEqual([
      'labResults',
      'setAside',
      'settings',
      'testValues',
      'userNotes',
      'userPreferences',
    ]);
    db.close();
  });

  it('keeps the indexes that find a value or note by its lab result', async () => {
    await seedV6('upgrade-test-3');
    const db = new HemoIODatabase('upgrade-test-3');
    await db.open();

    expect(db.testValues.schema.indexes.map((index) => index.name)).toEqual(['labResultId']);
    db.close();
  });
});

/** The v7 schema exactly as shipped before unreadable records were set aside */
function openV7(name: string): Dexie {
  const legacy = new Dexie(name);
  legacy.version(7).stores({
    labResults: '++id',
    testValues: '++id, labResultId',
    userPreferences: '++id',
    settings: '++id',
    userNotes: '++id, labResultId, testValueId',
  });
  return legacy;
}

describe('database upgrade to set-aside records', () => {
  it('version 8 adds the setAside table and keeps the data', async () => {
    const name = 'upgrade-test-8';
    names.push(name);
    const legacy = openV7(name);
    await legacy.table('labResults').add({ encrypted: 'enc:lab' });
    await legacy.table('testValues').add({ labResultId: 1, encrypted: 'enc:v1' });
    await legacy.table('userNotes').add({ labResultId: 1, encrypted: 'enc:n1' });
    await legacy.table('userPreferences').add({ encrypted: 'enc:prefs' });
    await legacy.table('settings').add({ storageProvider: 'local', aiProvider: 'ollama', language: 'en' });
    legacy.close();

    const db = new HemoIODatabase(name);
    await db.open();

    expect(db.verno).toBe(8);
    expect(await db.setAside.count()).toBe(0);
    expect(await db.labResults.toArray()).toEqual([{ id: 1, encrypted: 'enc:lab' }]);
    expect(await db.testValues.toArray()).toEqual([{ id: 1, labResultId: 1, encrypted: 'enc:v1' }]);
    expect(await db.userNotes.toArray()).toEqual([{ id: 1, labResultId: 1, encrypted: 'enc:n1' }]);
    expect(await db.userPreferences.toArray()).toEqual([{ id: 1, encrypted: 'enc:prefs' }]);
    expect(await db.settings.count()).toBe(1);
    db.close();
  });
});
