/**
 * Tests for replacing the lab data only while nothing else changed it
 */

import { describe, it, expect } from 'vitest';
import { openTestDb } from './testDb';

const at = new Date('2024-01-15T10:00:00Z');
const result = (labName: string) => ({ date: at, labName, createdAt: at, updatedAt: at });
const restored = {
  labResults: [{ id: 1, ...result('From the folder') }],
  testValues: [],
  userNotes: [],
};

describe('EncryptedDb.replaceLabData with a stamp', () => {
  it('replaces the data while the stored rows are as stamped', async () => {
    const { db } = await openTestDb();
    await db.addLabResult(result('Here'));
    const stamp = await db.storedDataStamp();

    expect(await db.replaceLabData(restored, stamp)).toMatchObject({ labResults: 1, testValues: 0, notes: 0 });
    expect((await db.getAllLabResults()).map((r) => r.labName)).toEqual(['From the folder']);
  });

  it('gives the stamp the replace left, which a later change alters', async () => {
    const { db } = await openTestDb();

    const replaced = await db.replaceLabData(restored);

    expect(replaced.stamp).toBe(await db.storedDataStamp());
    await db.addLabResult(result('Saved after the load'));
    expect(await db.storedDataStamp()).not.toBe(replaced.stamp);
  });

  it('replaces nothing when a change was saved after the stamp', async () => {
    const { db } = await openTestDb();
    await db.addLabResult(result('Here'));
    const stamp = await db.storedDataStamp();
    // Saved while the folder copy was being loaded
    await db.addLabResult(result('Saved meanwhile'));

    expect(await db.replaceLabData(restored, stamp)).toBeNull();
    expect((await db.getAllLabResults()).map((r) => r.labName).sort()).toEqual(['Here', 'Saved meanwhile']);
  });

  it('replaces nothing when preferences were saved after the stamp', async () => {
    const { db } = await openTestDb();
    const stamp = await db.storedDataStamp();
    await db.updatePreferences(() => ({ theme: 'dark' }));

    expect(await db.replaceLabData(restored, stamp)).toBeNull();
    expect(await db.getAllLabResults()).toEqual([]);
  });

  it('gives the same stamp while nothing is written', async () => {
    const { db } = await openTestDb();
    await db.addLabResult(result('Here'));

    expect(await db.storedDataStamp()).toBe(await db.storedDataStamp());
  });

  it('changes when a row is saved again with the same content: each save has a new IV', async () => {
    const { db } = await openTestDb();
    const id = await db.addLabResult(result('Here'));
    const stamp = await db.storedDataStamp();

    await db.updateLabResult(id, { labName: 'Here' });

    expect(await db.storedDataStamp()).not.toBe(stamp);
  });

  it('holds no ciphertext beyond each row\'s IV', async () => {
    const { db, database } = await openTestDb();
    await db.addLabResult(result('A lab name long enough to make a long ciphertext'));
    const [row] = await database.table('labResults').toArray();

    const stamp = await db.storedDataStamp();

    expect(stamp).toContain(row.encrypted.slice(0, 16));
    expect(stamp).not.toContain(row.encrypted.slice(0, 17));
  });
});
