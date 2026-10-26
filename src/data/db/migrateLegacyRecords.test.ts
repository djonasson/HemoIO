import { describe, it, expect } from 'vitest';
import { deriveKey, generateSalt } from '@data/encryption';
import { openTestDb, storeAsEarlierVersion } from './testDb';

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

  it('does nothing once every record is sealed', async () => {
    const { db } = await setup();
    await db.addTestValue({
      labResultId: 1, biomarkerKey: 'unknown:zorblatin', rawText: 'Zorblatin',
      value: 3, unit: 'U/L', createdAt: now, updatedAt: now,
    });

    expect(await db.migrateLegacyRecords()).toBe(0);
  });
});
