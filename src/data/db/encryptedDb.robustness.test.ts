import { describe, it, expect, vi } from 'vitest';
import { EncryptedDb } from './encryptedDb';
import { openTestDb } from './testDb';

const now = new Date('2024-01-15T10:00:00Z');
const invalid = new Date('not a date');

const value = (overrides: object = {}) => ({
  labResultId: 1,
  biomarkerKey: 'glucose',
  value: 95,
  unit: 'mg/dL',
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

describe('EncryptedDb: stored values come back as they were', () => {
  it('keeps numbers that JSON cannot hold', async () => {
    const { db } = await openTestDb();
    const id = await db.addTestValue(
      value({ referenceRangeLow: -Infinity, referenceRangeHigh: NaN, intervalHigh: Infinity })
    );

    const stored = await db.getTestValue(id);

    expect(stored?.referenceRangeLow).toBe(-Infinity);
    expect(stored?.referenceRangeHigh).toBeNaN();
    expect(stored?.intervalHigh).toBe(Infinity);
  });

  it('does not show how long a record is', async () => {
    const { db, database } = await openTestDb();
    await db.addTestValue(value({ rawText: 'Glucose' }));
    await db.addTestValue(
      value({
        biomarkerKey: 'unknown:hiv12antibodies',
        rawText: 'HIV 1/2 Antibodies',
        unit: 'S/CO',
      })
    );

    const lengths = (await database.testValues.toArray()).map(
      (row) => (row as unknown as { encrypted: string }).encrypted.length
    );

    expect(new Set(lengths).size).toBe(1);
  });
});

describe('EncryptedDb: records with an invalid date', () => {
  it('are left out of the lists, as the date indexes left them out', async () => {
    const { db } = await openTestDb();
    const add = (date: Date, labName: string) =>
      db.addLabResult({ date, labName, createdAt: now, updatedAt: now });
    await add(new Date('2024-02-01'), 'February');
    const broken = await add(invalid, 'Broken');
    await add(new Date('2024-01-01'), 'January');
    await add(new Date('2023-06-01'), 'June');
    await db.addNote({ content: 'broken', tags: [], createdAt: invalid, updatedAt: invalid });
    await db.addNote({ content: 'fine', tags: [], createdAt: now, updatedAt: now });

    expect((await db.getAllLabResults()).map((r) => r.labName)).toEqual([
      'February',
      'January',
      'June',
    ]);
    expect((await db.getAllNotes()).map((n) => n.content)).toEqual(['fine']);
    // Still there, by its ID
    expect((await db.getLabResult(broken))?.labName).toBe('Broken');
  });
});

describe('EncryptedDb: records with an invalid date, exported and listed apart', () => {
  async function seed() {
    const { db } = await openTestDb();
    const add = (date: Date, labName: string) =>
      db.addLabResult({ date, labName, createdAt: now, updatedAt: now });
    await add(invalid, 'Undated');
    await add(new Date('2024-01-01'), 'January');
    await add(new Date('2024-02-01'), 'February');
    await db.addNote({ content: 'broken', tags: [], createdAt: invalid, updatedAt: invalid });
    await db.addNote({ content: 'fine', tags: [], createdAt: now, updatedAt: now });
    return db;
  }

  it('exportAllData keeps a lab result and a note whose date is invalid, after the dated ones', async () => {
    const exported = await (await seed()).exportAllData();

    expect(exported.labResults.map((r) => r.labName)).toEqual(['February', 'January', 'Undated']);
    expect(exported.userNotes.map((n) => n.content)).toEqual(['fine', 'broken']);
  });

  it('getUndatedLabResults returns only results without a valid date', async () => {
    const db = await seed();

    expect((await db.getUndatedLabResults()).map((r) => r.labName)).toEqual(['Undated']);
  });
});

describe('EncryptedDb: a record that cannot be decrypted', () => {
  it('is skipped, so the others are still listed', async () => {
    const first = await openTestDb();
    await first.db.addLabResult({
      date: now,
      labName: 'Other key',
      createdAt: now,
      updatedAt: now,
    });
    const otherKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const db = new EncryptedDb(otherKey, first.database);
    await db.addLabResult({ date: now, labName: 'Readable', createdAt: now, updatedAt: now });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect((await db.getAllLabResults()).map((r) => r.labName)).toEqual(['Readable']);
    // Says so without the record's content
    expect(warn).toHaveBeenCalledWith('Skipped a stored record that could not be decrypted');
  });

  it('is counted for an export that asks, which still holds the others', async () => {
    const first = await openTestDb();
    await first.db.addLabResult({ date: now, labName: 'Other key', createdAt: now, updatedAt: now });
    await first.db.addNote({ content: 'other key', tags: [], createdAt: now, updatedAt: now });
    const otherKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const db = new EncryptedDb(otherKey, first.database);
    await db.addLabResult({ date: now, labName: 'Readable', createdAt: now, updatedAt: now });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const skipped = vi.fn();

    const exported = await db.exportAllData(skipped);

    expect(exported.labResults.map((r) => r.labName)).toEqual(['Readable']);
    expect(skipped.mock.calls.reduce((sum, [count]) => sum + count, 0)).toBe(2);
  });

  it('as preferences, reads as none and is replaced by the next save', async () => {
    const first = await openTestDb();
    await first.db.savePreferences({
      unitPreferences: {},
      personalTargets: {},
      theme: 'dark',
      dateFormat: 'MM/DD/YYYY',
    });
    const otherKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const db = new EncryptedDb(otherKey, first.database);
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await db.getPreferences()).toBeUndefined();
    await db.updatePreferences(() => ({ theme: 'light' }));

    expect(await db.getPreferences()).toEqual(expect.objectContaining({ theme: 'light' }));
  });
});

describe('EncryptedDb.hasLabData', () => {
  const at = new Date('2024-01-15T10:00:00Z');

  it('is false for an empty database, settings and preferences aside', async () => {
    const { db } = await openTestDb();
    await db.savePreferences({ unitPreferences: {}, personalTargets: {}, theme: 'dark', dateFormat: 'MM/DD/YYYY' });

    expect(await db.hasLabData()).toBe(false);
  });

  it('is true with a lab result, a test value or a note', async () => {
    const withResult = await openTestDb();
    await withResult.db.addLabResult({ date: at, labName: 'Lab', createdAt: at, updatedAt: at });
    const withValue = await openTestDb();
    await withValue.db.addTestValue(value());
    const withNote = await openTestDb();
    await withNote.db.addNote({ content: 'Tired', tags: [], createdAt: at, updatedAt: at });

    expect(await withResult.db.hasLabData()).toBe(true);
    expect(await withValue.db.hasLabData()).toBe(true);
    expect(await withNote.db.hasLabData()).toBe(true);
  });
});
