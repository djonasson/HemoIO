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

describe('EncryptedDb.replaceLabDataIfUnchanged', () => {
  it('replaces the data while the stored rows are as stamped', async () => {
    const { db } = await openTestDb();
    await db.addLabResult(result('Here'));
    const stamp = await db.storedDataStamp();

    expect(await db.replaceLabDataIfUnchanged(restored, stamp)).toEqual({ labResults: 1, testValues: 0, notes: 0 });
    expect((await db.getAllLabResults()).map((r) => r.labName)).toEqual(['From the folder']);
  });

  it('replaces nothing when a change was saved after the stamp', async () => {
    const { db } = await openTestDb();
    await db.addLabResult(result('Here'));
    const stamp = await db.storedDataStamp();
    // Saved while the folder copy was being loaded
    await db.addLabResult(result('Saved meanwhile'));

    expect(await db.replaceLabDataIfUnchanged(restored, stamp)).toBeNull();
    expect((await db.getAllLabResults()).map((r) => r.labName).sort()).toEqual(['Here', 'Saved meanwhile']);
  });

  it('replaces nothing when preferences were saved after the stamp', async () => {
    const { db } = await openTestDb();
    const stamp = await db.storedDataStamp();
    await db.updatePreferences(() => ({ theme: 'dark' }));

    expect(await db.replaceLabDataIfUnchanged(restored, stamp)).toBeNull();
    expect(await db.getAllLabResults()).toEqual([]);
  });

  it('gives the same stamp while nothing is written', async () => {
    const { db } = await openTestDb();
    await db.addLabResult(result('Here'));

    expect(await db.storedDataStamp()).toBe(await db.storedDataStamp());
  });
});
