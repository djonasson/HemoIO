import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import Dexie from 'dexie';
import { HemoIODatabase } from './index';
import { EncryptedDb } from './encryptedDb';
import { deriveKey, encryptString, generateSalt } from '@data/encryption';
import type { TestValue } from '@/types';

const databases: HemoIODatabase[] = [];
afterEach(async () => {
  for (const database of databases.splice(0)) {
    database.close();
    await Dexie.delete(database.name);
  }
});

async function setup(name: string) {
  const database = new HemoIODatabase(name);
  databases.push(database);
  const key = await deriveKey('test-password', generateSalt());
  // Legacy keys exist only as the upgrade to biomarker keys left them:
  // readable, with the extracted name (rawText) already encrypted
  const addReadableValue = async (value: Omit<TestValue, 'id'>) =>
    (await database.testValues.add({
      ...value,
      rawText: value.rawText && (await encryptString(value.rawText, key)),
    })) as number;
  return { database, encryptedDb: new EncryptedDb(key, database), addReadableValue };
}

const now = new Date('2024-01-15');

describe('EncryptedDb.reconcileLegacyUnknownKeys', () => {
  it('gives upgraded unknown biomarkers the key new imports of their name get', async () => {
    const { database, encryptedDb, addReadableValue } = await setup('reconcile-1');
    const valueId = await addReadableValue({
      labResultId: 1, biomarkerKey: 'unknown:legacy-12345', rawText: 'Zorblatin',
      value: 3, unit: 'U/L', createdAt: now, updatedAt: now,
    });
    await addReadableValue({
      labResultId: 1, biomarkerKey: 'glucose', rawText: 'Glucose',
      value: 95, unit: 'mg/dL', createdAt: now, updatedAt: now,
    });
    await database.userNotes.add({
      biomarkerKey: 'unknown:legacy-12345', content: 'note', tags: [], createdAt: now, updatedAt: now,
    });
    await database.userPreferences.add({
      unitPreferences: {}, personalTargets: { 'unknown:legacy-12345': { high: 5 } },
      theme: 'system', dateFormat: 'MM/DD/YYYY',
    });

    const changed = await encryptedDb.reconcileLegacyUnknownKeys();

    expect(changed).toBe(1);
    expect((await encryptedDb.getTestValue(valueId))?.biomarkerKey).toBe('unknown:zorblatin');
    expect((await database.userNotes.toArray())[0].biomarkerKey).toBe('unknown:zorblatin');
    expect((await database.userPreferences.toArray())[0].personalTargets).toEqual({
      'unknown:zorblatin': { high: 5 },
    });
    // Other biomarkers are untouched
    expect(await encryptedDb.getTestValuesByBiomarker('glucose')).toHaveLength(1);
  });

  it('keys each value by its own name when two names shared a legacy hash', async () => {
    const { encryptedDb, addReadableValue } = await setup('reconcile-3');
    const shared = 'unknown:legacy-90902';
    const zorb = await addReadableValue({
      labResultId: 1, biomarkerKey: shared, rawText: 'Zorblatin',
      value: 3, unit: 'U/L', createdAt: now, updatedAt: now,
    });
    const hb = await addReadableValue({
      labResultId: 1, biomarkerKey: shared, rawText: 'HEMOGLOBIN.',
      value: 14, unit: 'g/dL', createdAt: now, updatedAt: now,
    });

    await encryptedDb.reconcileLegacyUnknownKeys();

    expect((await encryptedDb.getTestValue(zorb))?.biomarkerKey).toBe('unknown:zorblatin');
    expect((await encryptedDb.getTestValue(hb))?.biomarkerKey).toBe('hemoglobin');
  });

  it('does nothing when there are no legacy unknown keys', async () => {
    const { encryptedDb } = await setup('reconcile-2');
    await encryptedDb.addTestValue({
      labResultId: 1, biomarkerKey: 'unknown:zorblatin', rawText: 'Zorblatin',
      value: 3, unit: 'U/L', createdAt: now, updatedAt: now,
    });

    expect(await encryptedDb.reconcileLegacyUnknownKeys()).toBe(0);
  });
});
