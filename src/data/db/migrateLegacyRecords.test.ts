import { describe, it, expect } from 'vitest';
import { deriveKey, generateSalt } from '@data/encryption';
import { encryptString } from '@data/encryption';
import { MIGRATE_RECORDS } from './index';
import { openTestDb, storeAsEarlierVersion, type TestDb } from './testDb';

const now = new Date('2024-01-15');

async function setup() {
  return openTestDb(await deriveKey('test-password', generateSalt()));
}

describe('EncryptedDb.migrateLegacyRecords', () => {
  // Legacy keys exist only as the upgrade to biomarker keys left them: in
  // records as earlier versions stored them, with the extracted name encrypted
  it('gives upgraded unknown biomarkers the key new imports of their name get', async () => {
    const test = await setup();
    const { db } = test;
    const valueId = await storeAsEarlierVersion(test, 'testValues', {
      labResultId: 1, biomarkerKey: 'unknown:legacy-12345', rawText: 'Zorblatin',
      value: 3, unit: 'U/L', createdAt: now, updatedAt: now,
    });
    await storeAsEarlierVersion(test, 'testValues', {
      labResultId: 1, biomarkerKey: 'glucose', rawText: 'Glucose',
      value: 95, unit: 'mg/dL', createdAt: now, updatedAt: now,
    });
    await storeAsEarlierVersion(test, 'userNotes', {
      biomarkerKey: 'unknown:legacy-12345', content: 'note', tags: [], createdAt: now, updatedAt: now,
    });
    await storeAsEarlierVersion(test, 'userPreferences', {
      unitPreferences: {}, personalTargets: { 'unknown:legacy-12345': { high: 5 } },
      theme: 'system', dateFormat: 'MM/DD/YYYY',
    });

    await db.migrateLegacyRecords();

    expect((await db.getTestValue(valueId))?.biomarkerKey).toBe('unknown:zorblatin');
    expect((await db.getAllNotes())[0].biomarkerKey).toBe('unknown:zorblatin');
    expect((await db.getPreferences())?.personalTargets).toEqual({
      'unknown:zorblatin': { high: 5 },
    });
    // Other biomarkers are untouched
    expect(await db.getTestValuesByBiomarker('glucose')).toHaveLength(1);
  });

  it('keys each value by its own name when two names shared a legacy hash', async () => {
    const test = await setup();
    const shared = 'unknown:legacy-90902';
    const zorb = await storeAsEarlierVersion(test, 'testValues', {
      labResultId: 1, biomarkerKey: shared, rawText: 'Zorblatin',
      value: 3, unit: 'U/L', createdAt: now, updatedAt: now,
    });
    const hb = await storeAsEarlierVersion(test, 'testValues', {
      labResultId: 1, biomarkerKey: shared, rawText: 'HEMOGLOBIN.',
      value: 14, unit: 'g/dL', createdAt: now, updatedAt: now,
    });

    await test.db.migrateLegacyRecords();

    expect((await test.db.getTestValue(zorb))?.biomarkerKey).toBe('unknown:zorblatin');
    expect((await test.db.getTestValue(hb))?.biomarkerKey).toBe('hemoglobin');
  });

  it('does nothing in a database no earlier version wrote', async () => {
    const { db, database } = await setup();
    const id = await db.addTestValue({
      labResultId: 1, biomarkerKey: 'blood-urea-nitrogen', rawText: 'Urea',
      value: 18, unit: 'mg/dL', createdAt: now, updatedAt: now,
    });
    const before = await database.testValues.get(id);

    expect(await db.migrateLegacyRecords()).toBe(0);
    expect(await database.testValues.get(id)).toEqual(before);
  });

  it('runs once per upgraded database', async () => {
    const test = await setup();
    await storeAsEarlierVersion(test, 'testValues', {
      labResultId: 1, biomarkerKey: 'glucose', value: 95, unit: 'mg/dL', createdAt: now, updatedAt: now,
    });

    expect(await test.db.migrateLegacyRecords()).toBe(1);
    expect(await test.db.migrateLegacyRecords()).toBe(0);
    expect(await test.database.meta.get(MIGRATE_RECORDS)).toBeUndefined();
  });

  it('does not stop at a value stored without a biomarker key', async () => {
    const test = await setup();
    await storeAsEarlierVersion(test, 'testValues', {
      labResultId: 1, biomarkerId: 22, value: 95, unit: 'mg/dL', createdAt: now, updatedAt: now,
    });
    const legacy = await storeAsEarlierVersion(test, 'testValues', {
      labResultId: 1, biomarkerKey: 'unknown:legacy-12345', rawText: 'Zorblatin',
      value: 3, unit: 'U/L', createdAt: now, updatedAt: now,
    });

    await test.db.migrateLegacyRecords();

    expect((await test.db.getAllTestValues()).map((tv) => tv.biomarkerKey).sort()).toEqual([
      'glucose',
      'unknown:zorblatin',
    ]);
    expect((await test.db.getTestValue(legacy))?.biomarkerKey).toBe('unknown:zorblatin');
  });

  it('also reconciles records sealed before it ran', async () => {
    const test = await setup();
    await storeAsEarlierVersion(test, 'testValues', {
      labResultId: 1, biomarkerKey: 'unknown:legacy-12345', rawText: 'Zorblatin',
      value: 3, unit: 'U/L', createdAt: now, updatedAt: now,
    });
    // Edited (and so sealed) in a session whose migration failed
    await test.db.addNote({
      biomarkerKey: 'unknown:legacy-12345', content: 'note', tags: [], createdAt: now, updatedAt: now,
    });

    await test.db.migrateLegacyRecords();

    expect((await test.db.getAllNotes())[0].biomarkerKey).toBe('unknown:zorblatin');
  });

  it('seals fields an older version wrote beside a sealed record', async () => {
    const test = await setup();
    const id = await test.db.addNote({ content: 'first', tags: [], createdAt: now, updatedAt: now });
    await test.database.userNotes.update(id, { content: await encryptString('edited', test.key), tags: ['x'] });
    await test.database.meta.put({ key: MIGRATE_RECORDS });

    await test.db.migrateLegacyRecords();

    const stored = (await test.database.userNotes.get(id)) as unknown as Record<string, unknown>;
    expect(Object.keys(stored).filter((field) => stored[field] !== undefined).sort()).toEqual([
      'encrypted',
      'id',
    ]);
    expect(await test.db.getNote(id)).toMatchObject({ content: 'edited', tags: ['x'] });
  });

  describe('values filed under the wrong biomarker', () => {
    // As this version stored them before urea and urine red cells had their
    // own entries: sealed, in a database the upgrade then marks
    async function storedMisfiled(test: TestDb) {
      const add = (biomarkerKey: string, rawText: string, value: number, unit: string) =>
        test.db.addTestValue({ labResultId: 1, biomarkerKey, rawText, value, unit, createdAt: now, updatedAt: now });
      const ids = {
        urea: await add('blood-urea-nitrogen', 'Urea', 18, 'mg/dL'),
        bun: await add('blood-urea-nitrogen', 'BUN', 9, 'mg/dL'),
        redCells: await add('urine-blood', 'Eritrociti (urine)', 15, 'cell/µL'),
        dipstick: await add('urine-blood', 'Emoglobina (urine)', 0, 'mg/dL'),
      };
      await test.database.meta.put({ key: MIGRATE_RECORDS });
      return ids;
    }

    it('are filed under the test they are', async () => {
      const test = await setup();
      const ids = await storedMisfiled(test);

      await test.db.migrateLegacyRecords();

      const keyOf = async (id: number) => (await test.db.getTestValue(id))?.biomarkerKey;
      expect(await keyOf(ids.urea)).toBe('urea');
      expect(await keyOf(ids.bun)).toBe('blood-urea-nitrogen');
      expect(await keyOf(ids.redCells)).toBe('urine-red-blood-cells');
      expect(await keyOf(ids.dipstick)).toBe('urine-blood');
    });

    it('take a preferred red cell count unit with them', async () => {
      const test = await setup();
      await test.db.updatePreferences(() => ({ unitPreferences: { 'urine-blood': 'cells/µL' } }));
      await storedMisfiled(test);

      await test.db.migrateLegacyRecords();

      expect((await test.db.getPreferences())?.unitPreferences).toEqual({
        'urine-red-blood-cells': 'cells/µL',
      });
    });
  });
});
