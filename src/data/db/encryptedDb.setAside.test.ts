import { describe, it, expect, vi } from 'vitest';
import { EncryptedDb } from './encryptedDb';
import { onSetAsideChanged } from './setAsideEvents';
import { openTestDb } from './testDb';
import type { HemoIODatabase } from './index';

const at = new Date('2024-01-15T10:00:00Z');

const result = (labName: string) => ({ date: at, labName, createdAt: at, updatedAt: at });
const value = (labResultId: number, biomarkerKey: string) => ({
  labResultId,
  biomarkerKey,
  value: 95,
  unit: 'mg/dL',
  createdAt: at,
  updatedAt: at,
});
const preferences = (theme: 'light' | 'dark') => ({
  unitPreferences: {},
  personalTargets: {},
  theme,
  dateFormat: 'MM/DD/YYYY' as const,
});

function newKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** A database with this key's db, and another key's db on the same tables */
async function twoKeys(): Promise<{ db: EncryptedDb; other: EncryptedDb; database: HemoIODatabase }> {
  const { db, database } = await openTestDb();
  return { db, database, other: new EncryptedDb(await newKey(), database) };
}

/** A lab result with two values, sealed by the given db */
async function addResultWithValues(db: EncryptedDb, labName: string): Promise<number> {
  const [id] = await db.addLabResultsWithValues([
    {
      labResult: result(labName),
      testValues: [
        { biomarkerKey: '2345-7', value: 95, unit: 'mg/dL', createdAt: at, updatedAt: at },
        { biomarkerKey: '718-7', value: 14, unit: 'g/dL', createdAt: at, updatedAt: at },
      ],
    },
  ]);
  return id;
}

describe('EncryptedDb.settleUnreadable', () => {
  it('settleUnreadable moves rows another key sealed into setAside', async () => {
    const { db, other, database } = await twoKeys();
    await addResultWithValues(other, 'Other key');
    const ownId = await addResultWithValues(db, 'This key');

    expect(await db.settleUnreadable()).toEqual({ returned: 0, setAside: 3 });

    expect((await database.labResults.toArray()).map((r) => r.id)).toEqual([ownId]);
    expect(await database.testValues.count()).toBe(2);
    expect((await db.getAllLabResults()).map((r) => r.labName)).toEqual(['This key']);
    expect(await db.countSetAside()).toEqual({ total: 3, unsaved: 3 });
  });

  it('keeps each row aside exactly as it was stored', async () => {
    const { db, other, database } = await twoKeys();
    await other.addNote({ labResultId: 7, content: 'Tired', tags: [], createdAt: at, updatedAt: at });
    const [stored] = await database.userNotes.toArray();

    await db.settleUnreadable();

    expect(await db.exportSetAside()).toEqual([
      { id: expect.any(Number), table: 'userNotes', row: stored, savedToFile: 0 },
    ]);
  });

  it('settleUnreadable returns rows that open with the current key, with their links rewritten', async () => {
    const { db, other } = await twoKeys();
    const originalId = await addResultWithValues(other, 'Other key');
    await db.settleUnreadable();

    expect(await other.settleUnreadable()).toEqual(expect.objectContaining({ returned: 3 }));

    const [returned] = await other.getAllLabResults();
    expect(returned.labName).toBe('Other key');
    // Its ID is free, so it is kept
    expect(returned.id).toBe(originalId);
    expect(await other.getTestValuesByLabResult(returned.id!)).toHaveLength(2);
  });

  it('gives a returned row a new ID only when its ID is taken, and relinks its values', async () => {
    const { db, other, database } = await twoKeys();
    const asideId = await addResultWithValues(other, 'Set aside');
    await db.settleUnreadable();
    // The other key stores a result under the same ID meanwhile
    const laterId = await other.addLabResult(result('Later'));
    const later = (await database.labResults.get(laterId))!;
    await database.labResults.delete(laterId);
    await database.labResults.put({ ...later, id: asideId });

    expect(await other.settleUnreadable()).toEqual({ returned: 3, setAside: 0 });

    const results = await other.getAllLabResults();
    const returned = results.find((r) => r.labName === 'Set aside')!;
    expect(results.find((r) => r.labName === 'Later')!.id).toBe(asideId);
    expect(returned.id).not.toBe(asideId);
    expect(await other.getTestValuesByLabResult(returned.id!)).toHaveLength(2);
    expect(await other.getTestValuesByLabResult(asideId)).toHaveLength(0);
  });

  it('returns preferences sealed under the recovered key at the same unlock', async () => {
    const { db, other, database } = await twoKeys();
    await other.savePreferences(preferences('dark'));
    await db.settleUnreadable();
    await db.savePreferences(preferences('light'));

    expect(await other.settleUnreadable()).toEqual({ returned: 1, setAside: 1 });

    expect(await database.userPreferences.count()).toBe(1);
    expect(await other.getPreferences()).toEqual(expect.objectContaining({ theme: 'dark' }));
    // This key's preferences wait aside in turn
    expect((await other.exportSetAside()).map((r) => r.table)).toEqual(['userPreferences']);
  });

  it('rewrites a returned note to the returned result and value, and keeps other links', async () => {
    const { db, other } = await twoKeys();
    const resultId = await addResultWithValues(other, 'Other key');
    const [valueId] = (await other.getTestValuesByLabResult(resultId)).map((tv) => tv.id!);
    await other.addNote({ labResultId: resultId, testValueId: valueId, content: 'Linked', tags: [], createdAt: at, updatedAt: at });
    await other.addNote({ labResultId: 999, content: 'Elsewhere', tags: [], createdAt: at, updatedAt: at });
    await db.settleUnreadable();

    await other.settleUnreadable();

    const [returned] = await other.getAllLabResults();
    const values = await other.getTestValuesByLabResult(returned.id!);
    const notes = await other.getAllNotes();
    const linked = notes.find((n) => n.content === 'Linked')!;
    expect(linked.labResultId).toBe(returned.id);
    expect(values.map((tv) => tv.id)).toContain(linked.testValueId);
    expect(notes.find((n) => n.content === 'Elsewhere')!.labResultId).toBe(999);
  });

  it('a returned preferences row waits while preferences exist', async () => {
    const { db, other, database } = await twoKeys();
    await other.savePreferences(preferences('dark'));
    await db.settleUnreadable();
    // The other key saves preferences again: its first row would open, but
    // preferences exist, so it waits aside
    await other.savePreferences(preferences('light'));

    const settled = await other.settleUnreadable();

    expect(settled.returned).toBe(0);
    expect(await database.userPreferences.count()).toBe(1);
    expect((await other.exportSetAside()).map((r) => r.table)).toEqual(['userPreferences']);
  });

  it('a returned preferences row goes back when there are none', async () => {
    const { db, other } = await twoKeys();
    await other.savePreferences(preferences('dark'));
    await db.settleUnreadable();

    expect(await other.settleUnreadable()).toEqual({ returned: 1, setAside: 0 });
    expect(await other.getPreferences()).toEqual(expect.objectContaining({ theme: 'dark' }));
  });

  it('does nothing, and writes nothing, when every row opens', async () => {
    const { db, database } = await openTestDb();
    await addResultWithValues(db, 'Lab');
    const listener = vi.fn();
    const stop = onSetAsideChanged(listener);
    const transaction = vi.spyOn(database, 'transaction');

    expect(await db.settleUnreadable()).toEqual({ returned: 0, setAside: 0 });
    stop();

    // One read-only pass, no write transaction
    expect(transaction.mock.calls.map(([mode]) => mode)).toEqual(['r']);
    expect(listener).not.toHaveBeenCalled();
    expect(await db.countSetAside()).toEqual({ total: 0, unsaved: 0 });
  });
});

describe('EncryptedDb: writes that meet unreadable rows', () => {
  it('replaceLabData moves unreadable rows aside instead of clearing them', async () => {
    const { db, database } = await openTestDb();
    await db.settleUnreadable();
    await database.labResults.add({ encrypted: 'AAAA' } as never);

    await db.replaceLabData({
      labResults: [{ id: 1, ...result('Restored') }],
      testValues: [{ id: 1, ...value(1, '2345-7') }],
      userNotes: [],
    });

    expect((await db.countSetAside()).total).toBe(1);
    expect((await db.getAllLabResults()).map((r) => r.labName)).toEqual(['Restored']);
  });

  it('updatePreferences moves unreadable preferences aside first', async () => {
    const { db, other, database } = await twoKeys();
    await other.savePreferences(preferences('dark'));
    const [unreadable] = await database.userPreferences.toArray();

    await db.updatePreferences(() => ({ theme: 'light' }));

    expect(await db.getPreferences()).toEqual(expect.objectContaining({ theme: 'light' }));
    expect(await db.exportSetAside()).toEqual([
      expect.objectContaining({ table: 'userPreferences', row: unreadable }),
    ]);
    // Under a new ID: the unreadable row is not overwritten
    expect((await database.userPreferences.toArray()).map((p) => p.id)).not.toContain(unreadable.id);
  });

  it('getSettings leaves an undecryptable API key unset', async () => {
    const { db, other } = await twoKeys();
    await other.saveSettings({ storageProvider: 'local', aiProvider: 'openai', language: 'en', aiApiKey: 'sk-secret' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const settings = await db.getSettings();

    expect(settings?.aiApiKey).toBeUndefined();
    expect(settings?.aiProvider).toBe('openai');
    expect(warn).toHaveBeenCalledWith('Failed to decrypt field aiApiKey, leaving it unset');
  });
});

describe('EncryptedDb.hasLabData with rows this key cannot open', () => {
  it('counts only rows that open, even before any sweep', async () => {
    const { db, other } = await twoKeys();
    await addResultWithValues(other, 'Other key');

    expect(await db.hasLabData()).toBe(false);
    expect(await other.hasLabData()).toBe(true);
  });
});

describe('EncryptedDb: the set-aside rows', () => {
  it('deleteSetAside deletes only set-aside rows', async () => {
    const { db, other } = await twoKeys();
    await addResultWithValues(other, 'Other key');
    await addResultWithValues(db, 'This key');
    await db.settleUnreadable();

    expect(await db.deleteSetAside()).toBe(3);

    expect(await db.countSetAside()).toEqual({ total: 0, unsaved: 0 });
    expect(await db.getAllTestValues()).toHaveLength(2);
    expect((await db.getAllLabResults()).map((r) => r.labName)).toEqual(['This key']);
  });

  it('markSetAsideSaved makes unsaved 0', async () => {
    const { db, other } = await twoKeys();
    await addResultWithValues(other, 'Other key');
    await db.settleUnreadable();
    const rows = await db.exportSetAside();

    await db.markSetAsideSaved(rows.map((r) => r.id!));

    expect(await db.countSetAside()).toEqual({ total: 3, unsaved: 0 });
  });

  it('every set-aside change notifies listeners once committed', async () => {
    const { db, other } = await twoKeys();
    await other.savePreferences(preferences('dark'));
    await addResultWithValues(other, 'Other key');
    const changes: unknown[] = [];
    // Read when told: the change is already committed
    const stop = onSetAsideChanged(async (change) => {
      changes.push({ change, total: (await db.countSetAside()).total });
    });

    await db.updatePreferences(() => ({ theme: 'light' }));
    await vi.waitFor(() => expect(changes).toHaveLength(1));
    await db.settleUnreadable();
    await vi.waitFor(() => expect(changes).toHaveLength(2));
    await db.markSetAsideSaved((await db.exportSetAside()).map((r) => r.id!));
    await vi.waitFor(() => expect(changes).toHaveLength(3));
    await db.deleteSetAside();
    await vi.waitFor(() => expect(changes).toHaveLength(4));
    stop();

    expect(changes).toEqual([
      { change: { movedAside: ['userPreferences'] }, total: 1 },
      { change: { movedAside: ['labResults', 'testValues'] }, total: 4 },
      { change: { movedAside: [] }, total: 4 },
      { change: { movedAside: [] }, total: 0 },
    ]);
  });
});
