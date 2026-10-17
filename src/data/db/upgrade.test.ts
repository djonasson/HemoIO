import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import Dexie from 'dexie';
import { HemoIODatabase } from './index';

/** The v2 schema exactly as shipped before biomarker keys */
function openV2(name: string): Dexie {
  const legacy = new Dexie(name);
  legacy.version(2).stores({
    labResults: '++id, date, labName',
    testValues: '++id, labResultId, biomarkerId, [labResultId+biomarkerId]',
    biomarkers: '++id, name, category',
    userPreferences: '++id',
    settings: '++id',
    userNotes: '++id, labResultId, biomarkerId, testValueId, createdAt, *tags',
  });
  return legacy;
}

const names: string[] = [];
afterEach(async () => {
  await Promise.all(names.splice(0).map((n) => Dexie.delete(n)));
});

async function seedV2(name: string) {
  names.push(name);
  const legacy = openV2(name);
  await legacy.table('testValues').bulkAdd([
    { labResultId: 1, biomarkerId: 3, value: 14.5, unit: 'g/dL', rawText: 'enc:abc' },
    { labResultId: 1, biomarkerId: 10042, value: 2, unit: 'U/L', rawText: 'enc:def' },
  ]);
  await legacy.table('userNotes').bulkAdd([
    { biomarkerId: 3, content: 'enc:n1', tags: [], createdAt: new Date() },
    { labResultId: 1, content: 'enc:n2', tags: [], createdAt: new Date() },
  ]);
  await legacy.table('userPreferences').add({
    theme: 'dark',
    dateFormat: 'MM/DD/YYYY',
    personalTargets: { 3: { low: 13 } },
    unitPreferences: { 3: 'g/L' },
  });
  legacy.close();
}

describe('database upgrade to biomarker keys', () => {
  it('converts stored biomarker IDs to keys without the encryption key', async () => {
    await seedV2('upgrade-test-1');
    const db = new HemoIODatabase('upgrade-test-1');

    const values = await db.testValues.orderBy('id').toArray();
    expect(values.map((v) => v.biomarkerKey)).toEqual(['hemoglobin', 'unknown:legacy-10042']);
    expect(values.every((v) => !('biomarkerId' in v))).toBe(true);
    // Encrypted fields are carried over untouched
    expect(values[0].rawText).toBe('enc:abc');

    const notes = await db.userNotes.orderBy('id').toArray();
    expect(notes[0].biomarkerKey).toBe('hemoglobin');
    expect(notes[1].biomarkerKey).toBeUndefined();

    const [prefs] = await db.userPreferences.toArray();
    expect(prefs.personalTargets).toEqual({ hemoglobin: { low: 13 } });
    expect(prefs.unitPreferences).toEqual({ hemoglobin: 'g/L' });
    db.close();
  });

  it('indexes test values by biomarker key', async () => {
    await seedV2('upgrade-test-2');
    const db = new HemoIODatabase('upgrade-test-2');

    expect(await db.testValues.where('biomarkerKey').equals('hemoglobin').count()).toBe(1);
    expect(
      await db.testValues.where('[labResultId+biomarkerKey]').equals([1, 'hemoglobin']).count()
    ).toBe(1);
    db.close();
  });
});
