import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import Dexie from 'dexie';
import { HemoIODatabase } from './index';
import { EncryptedDb } from './encryptedDb';
import { encryptString } from '@data/encryption';

const opened: HemoIODatabase[] = [];
afterEach(async () => {
  // Close first: deleting an open database makes Dexie warn
  await Promise.all(
    opened.splice(0).map((database) => {
      database.close();
      return Dexie.delete(database.name);
    })
  );
});

let dbCount = 0;
async function openDb(): Promise<{ db: EncryptedDb; database: HemoIODatabase; key: CryptoKey }> {
  const database = new HemoIODatabase(`at-rest-test-${++dbCount}`);
  opened.push(database);
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  return { db: new EncryptedDb(key, database), database, key };
}

/** Everything stored, as someone without the password would read it */
async function stored(database: HemoIODatabase): Promise<string> {
  const tables = await Promise.all(database.tables.map((table) => table.toArray()));
  return JSON.stringify(tables);
}

const now = new Date('2024-01-15T10:00:00Z');
const UNKNOWN = 'unknown:hiv12antibodies';

async function addValues(db: EncryptedDb): Promise<number[]> {
  const labResultId = await db.addLabResult({
    date: now,
    labName: 'Lab',
    createdAt: now,
    updatedAt: now,
  });
  return db.addTestValues(
    ['glucose', UNKNOWN].map((biomarkerKey, i) => ({
      labResultId,
      biomarkerKey,
      value: i + 1,
      unit: 'mg/dL',
      createdAt: now,
      updatedAt: now,
    }))
  );
}

const PREFERENCES = {
  unitPreferences: { glucose: 'mmol/L' },
  personalTargets: { [UNKNOWN]: { low: 7, high: 9 } },
  acknowledgedAlerts: { glucose: '2024-01-15T00:00:00.000Z' },
  theme: 'dark' as const,
  dateFormat: 'YYYY-MM-DD' as const,
};

describe('EncryptedDb: biomarker data at rest', () => {
  describe('test values', () => {
    it('stores the biomarker key encrypted', async () => {
      const { db, database } = await openDb();
      await addValues(db);

      const raw = await stored(database);
      expect(raw).not.toContain('glucose');
      expect(raw).not.toContain('hiv12');
    });

    it('reads the biomarker key back by every query', async () => {
      const { db } = await openDb();
      const [glucoseId] = await addValues(db);

      expect((await db.getAllTestValues()).map((tv) => tv.biomarkerKey)).toEqual([
        'glucose',
        UNKNOWN,
      ]);
      expect((await db.getTestValue(glucoseId))?.biomarkerKey).toBe('glucose');
      expect((await db.getTestValuesByBiomarker(UNKNOWN)).map((tv) => tv.value)).toEqual([2]);
      const { labResultId } = (await db.getTestValue(glucoseId))!;
      expect(await db.getTestValuesByLabResult(labResultId)).toHaveLength(2);
    });

    it('stores a changed biomarker key encrypted', async () => {
      const { db, database } = await openDb();
      const [id] = await addValues(db);

      await db.updateTestValue(id, { biomarkerKey: 'hemoglobin' });

      expect(await stored(database)).not.toContain('hemoglobin');
      expect((await db.getTestValue(id))?.biomarkerKey).toBe('hemoglobin');
    });
  });

  describe('notes', () => {
    async function addNotes(db: EncryptedDb): Promise<number> {
      await db.addNote({ content: 'other', tags: ['fasting'], createdAt: now, updatedAt: now });
      return db.addNote({
        biomarkerKey: UNKNOWN,
        content: 'note',
        tags: ['diabetes', 'medication'],
        createdAt: now,
        updatedAt: now,
      });
    }

    it('stores the biomarker key and tags encrypted', async () => {
      const { db, database } = await openDb();
      await addNotes(db);

      const raw = await stored(database);
      expect(raw).not.toContain('hiv12');
      expect(raw).not.toContain('diabetes');
      expect(raw).not.toContain('fasting');
    });

    it('finds notes by biomarker and by tag', async () => {
      const { db } = await openDb();
      const id = await addNotes(db);

      expect((await db.getNotesByBiomarker(UNKNOWN)).map((n) => n.id)).toEqual([id]);
      expect((await db.getNotesByTag('medication')).map((n) => n.id)).toEqual([id]);
      expect(await db.getNote(id)).toMatchObject({
        biomarkerKey: UNKNOWN,
        tags: ['diabetes', 'medication'],
      });
    });

    it('stores changed tags encrypted', async () => {
      const { db, database } = await openDb();
      const id = await addNotes(db);

      await db.updateNote(id, { tags: ['insulin'] });

      expect(await stored(database)).not.toContain('insulin');
      expect((await db.getNote(id))?.tags).toEqual(['insulin']);
    });
  });

  describe('preferences', () => {
    it('stores the biomarker-keyed preferences encrypted', async () => {
      const { db, database } = await openDb();
      await db.savePreferences(PREFERENCES);
      await db.updatePreferences(() => ({ unitPreferences: { hemoglobin: 'g/L' } }));

      const raw = await stored(database);
      for (const text of ['glucose', 'hiv12', 'hemoglobin', 'mmol', '2024-01-15']) {
        expect(raw).not.toContain(text);
      }
    });

    it('reads and updates them as before', async () => {
      const { db } = await openDb();
      await db.savePreferences(PREFERENCES);

      await db.updatePreferences((current) => ({
        personalTargets: { ...current?.personalTargets, glucose: { high: 99 } },
      }));

      expect(await db.getPreferences()).toEqual(
        expect.objectContaining({
          ...PREFERENCES,
          personalTargets: { [UNKNOWN]: { low: 7, high: 9 }, glucose: { high: 99 } },
        })
      );
    });

    it('creates the record encrypted when there is none', async () => {
      const { db, database } = await openDb();

      await db.updatePreferences(() => ({ personalTargets: { glucose: { low: 1 } } }));

      expect(await stored(database)).not.toContain('glucose');
      expect((await db.getPreferences())?.personalTargets).toEqual({ glucose: { low: 1 } });
    });
  });

  describe('restoring a backup', () => {
    it('stores the restored data encrypted, keeping preferences the backup lacks', async () => {
      const { db, database } = await openDb();
      await db.savePreferences(PREFERENCES);

      await db.replaceLabData({
        labResults: [{ id: 1, date: now, labName: 'Lab', createdAt: now, updatedAt: now }],
        testValues: [
          {
            id: 2,
            labResultId: 1,
            biomarkerKey: 'hemoglobin',
            value: 1,
            unit: 'g/dL',
            createdAt: now,
            updatedAt: now,
          },
        ],
        userNotes: [
          {
            id: 3,
            biomarkerKey: 'hemoglobin',
            content: 'n',
            tags: ['anemia'],
            createdAt: now,
            updatedAt: now,
          },
        ],
        userPreferences: {
          ...PREFERENCES,
          unitPreferences: { hemoglobin: 'g/L' },
          acknowledgedAlerts: undefined,
        },
      });

      const raw = await stored(database);
      expect(raw).not.toContain('hemoglobin');
      expect(raw).not.toContain('anemia');
      expect((await db.getAllTestValues())[0].biomarkerKey).toBe('hemoglobin');
      expect((await db.getAllNotes())[0]).toMatchObject({
        biomarkerKey: 'hemoglobin',
        tags: ['anemia'],
      });
      expect(await db.getPreferences()).toEqual(
        expect.objectContaining({
          unitPreferences: { hemoglobin: 'g/L' },
          acknowledgedAlerts: PREFERENCES.acknowledgedAlerts,
        })
      );
    });
  });

  describe('data stored readable by an earlier version', () => {
    // As an earlier version stored them: note content was already encrypted
    async function seedReadable(database: HemoIODatabase, key: CryptoKey): Promise<void> {
      await database.testValues.add({
        labResultId: 1,
        biomarkerKey: 'glucose',
        value: 5,
        unit: 'mg/dL',
        createdAt: now,
        updatedAt: now,
      });
      await database.userNotes.add({
        biomarkerKey: 'glucose',
        content: await encryptString('c', key),
        tags: ['fasting'],
        createdAt: now,
        updatedAt: now,
      });
      await database.userPreferences.add({ ...PREFERENCES });
    }

    it('is still read correctly', async () => {
      const { db, database, key } = await openDb();
      await seedReadable(database, key);

      expect((await db.getAllTestValues())[0].biomarkerKey).toBe('glucose');
      expect((await db.getNotesByTag('fasting'))[0].biomarkerKey).toBe('glucose');
      expect(await db.getPreferences()).toEqual(expect.objectContaining(PREFERENCES));
    });

    it('is encrypted by the migration, and reads the same afterwards', async () => {
      const { db, database, key } = await openDb();
      await seedReadable(database, key);

      await db.encryptReadableFields();
      await db.encryptReadableFields();

      const raw = await stored(database);
      expect(raw).not.toContain('glucose');
      expect(raw).not.toContain('fasting');
      expect((await db.getAllTestValues())[0]).toMatchObject({ biomarkerKey: 'glucose', value: 5 });
      expect((await db.getAllNotes())[0]).toMatchObject({
        biomarkerKey: 'glucose',
        tags: ['fasting'],
      });
      expect(await db.getPreferences()).toEqual(expect.objectContaining(PREFERENCES));
    });
  });
});
