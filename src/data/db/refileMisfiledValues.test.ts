import { describe, it, expect, vi } from 'vitest';
import { openTestDb } from './testDb';

const now = new Date('2024-01-15T10:00:00Z');

async function setup({ withSettings = true } = {}) {
  const test = await openTestDb();
  const { db } = test;
  if (withSettings) await db.saveSettings({ storageProvider: 'local', aiProvider: 'ollama', language: 'en' });
  const add = (biomarkerKey: string, rawText: string, value: number, unit: string) =>
    db.addTestValue({ labResultId: 1, biomarkerKey, rawText, value, unit, createdAt: now, updatedAt: now });
  const ids = {
    urea: await add('blood-urea-nitrogen', 'Urea', 18, 'mg/dL'),
    bun: await add('blood-urea-nitrogen', 'BUN', 9, 'mg/dL'),
    redCells: await add('urine-blood', 'Eritrociti (urine)', 15, 'cell/µL'),
    dipstick: await add('urine-blood', 'Emoglobina (urine)', 0, 'mg/dL'),
  };
  return { ...test, ids };
}

describe('EncryptedDb.refileMisfiledValues', () => {
  it('files each stored value under the test it is', async () => {
    const { db, ids } = await setup();

    expect(await db.refileMisfiledValues()).toBe(2);

    const keyOf = async (id: number) => (await db.getTestValue(id))?.biomarkerKey;
    expect(await keyOf(ids.urea)).toBe('urea');
    expect(await keyOf(ids.bun)).toBe('blood-urea-nitrogen');
    expect(await keyOf(ids.redCells)).toBe('urine-red-blood-cells');
    expect(await keyOf(ids.dipstick)).toBe('urine-blood');
  });

  it('moves a preferred red cell count unit with the values', async () => {
    const { db } = await setup();
    await db.updatePreferences(() => ({ unitPreferences: { 'urine-blood': 'cells/µL' } }));

    await db.refileMisfiledValues();

    expect((await db.getPreferences())?.unitPreferences).toEqual({ 'urine-red-blood-cells': 'cells/µL' });
  });

  it('runs once: it decrypts every value, so later unlocks skip it', async () => {
    const { db } = await setup();
    await db.refileMisfiledValues();
    const readAll = vi.spyOn(db, 'getAllTestValues');

    expect(await db.refileMisfiledValues()).toBe(0);
    expect(readAll).not.toHaveBeenCalled();
  });

  it('creates no settings to record that it ran', async () => {
    const { db, database } = await setup({ withSettings: false });

    expect(await db.refileMisfiledValues()).toBe(2);
    expect(await database.settings.count()).toBe(0);
  });
});
