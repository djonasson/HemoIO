import { describe, it, expect } from 'vitest';
import { openTestDb, storeAsEarlierVersion, type TestDb } from './testDb';
import type { HemoIODatabase } from './index';
import type { EncryptedDb } from './encryptedDb';

/**
 * Everything stored, as someone without the password would read it. Sealed
 * ciphertext is left out: being random, it can contain any short text.
 */
async function stored(database: HemoIODatabase): Promise<string> {
  const tables = await Promise.all(database.tables.map((table) => table.toArray()));
  return JSON.stringify(tables, (field, value) => (field === 'encrypted' ? undefined : value));
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
      const { db, database } = await openTestDb();
      await addValues(db);

      const raw = await stored(database);
      expect(raw).not.toContain('glucose');
      expect(raw).not.toContain('hiv12');
    });

    it('reads the biomarker key back by every query', async () => {
      const { db } = await openTestDb();
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
      const { db, database } = await openTestDb();
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
      const { db, database } = await openTestDb();
      await addNotes(db);

      const raw = await stored(database);
      expect(raw).not.toContain('hiv12');
      expect(raw).not.toContain('diabetes');
      expect(raw).not.toContain('fasting');
    });

    it('finds notes by biomarker and by tag', async () => {
      const { db } = await openTestDb();
      const id = await addNotes(db);

      expect((await db.getNotesByBiomarker(UNKNOWN)).map((n) => n.id)).toEqual([id]);
      expect((await db.getNotesByTag('medication')).map((n) => n.id)).toEqual([id]);
      expect(await db.getNote(id)).toMatchObject({
        biomarkerKey: UNKNOWN,
        tags: ['diabetes', 'medication'],
      });
    });

    it('stores changed tags encrypted', async () => {
      const { db, database } = await openTestDb();
      const id = await addNotes(db);

      await db.updateNote(id, { tags: ['insulin'] });

      expect(await stored(database)).not.toContain('insulin');
      expect((await db.getNote(id))?.tags).toEqual(['insulin']);
    });
  });

  describe('preferences', () => {
    it('stores the biomarker-keyed preferences encrypted', async () => {
      const { db, database } = await openTestDb();
      await db.savePreferences(PREFERENCES);
      await db.updatePreferences(() => ({ unitPreferences: { hemoglobin: 'g/L' } }));

      const raw = await stored(database);
      for (const text of ['glucose', 'hiv12', 'hemoglobin', 'mmol', '2024-01-15']) {
        expect(raw).not.toContain(text);
      }
    });

    it('reads and updates them as before', async () => {
      const { db } = await openTestDb();
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
      const { db, database } = await openTestDb();

      await db.updatePreferences(() => ({ personalTargets: { glucose: { low: 1 } } }));

      expect(await stored(database)).not.toContain('glucose');
      expect((await db.getPreferences())?.personalTargets).toEqual({ glucose: { low: 1 } });
    });
  });

  describe('restoring a backup', () => {
    it('stores the restored data encrypted, keeping preferences the backup lacks', async () => {
      const { db, database } = await openTestDb();
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
    async function seedReadable(test: TestDb): Promise<void> {
      await storeAsEarlierVersion(test, 'testValues', {
        labResultId: 1,
        biomarkerKey: 'glucose',
        value: 5,
        unit: 'mg/dL',
        createdAt: now,
        updatedAt: now,
      });
      await storeAsEarlierVersion(test, 'userNotes', {
        biomarkerKey: 'glucose',
        content: 'c',
        tags: ['fasting'],
        createdAt: now,
        updatedAt: now,
      });
      await storeAsEarlierVersion(test, 'userPreferences', PREFERENCES);
    }

    it('is still read correctly', async () => {
      const test = await openTestDb();
      const { db } = test;
      await seedReadable(test);

      expect((await db.getAllTestValues())[0].biomarkerKey).toBe('glucose');
      expect((await db.getNotesByTag('fasting'))[0].biomarkerKey).toBe('glucose');
      expect(await db.getPreferences()).toEqual(expect.objectContaining(PREFERENCES));
    });

    it('is encrypted by the migration, and reads the same afterwards', async () => {
      const test = await openTestDb();
      const { db, database } = test;
      await seedReadable(test);

      await db.migrateLegacyRecords();
      expect(await db.migrateLegacyRecords()).toBe(0);

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

  describe('everything but IDs and links', () => {
    /** The fields of each stored record, which someone without the password sees */
    async function storedFields(database: HemoIODatabase): Promise<Record<string, string[]>> {
      const fields: Record<string, string[]> = {};
      for (const table of database.tables) {
        if (table.name === 'settings') continue;
        const rows = (await table.toArray()) as Record<string, unknown>[];
        fields[table.name] = [
          ...new Set(rows.flatMap((row) => Object.keys(row).filter((k) => row[k] !== undefined))),
        ].sort();
      }
      return fields;
    }

    async function addEverything(db: EncryptedDb): Promise<{ labResultId: number; valueId: number; noteId: number }> {
      const labResultId = await db.addLabResult({
        date: new Date('2024-03-01T12:00:00Z'),
        labName: 'Quest',
        notes: 'fasting',
        createdAt: now,
        updatedAt: now,
      });
      const [valueId] = await db.addTestValues([
        {
          labResultId,
          biomarkerKey: 'hba1c',
          value: 48,
          unit: 'mmol/mol',
          referenceRangeLow: 20,
          referenceRangeHigh: 42,
          method: 'HPLC',
          confidence: 0.9,
          createdAt: now,
          updatedAt: now,
        },
      ]);
      const noteId = await db.addNote({
        labResultId,
        testValueId: valueId,
        content: 'c',
        tags: [],
        createdAt: now,
        updatedAt: now,
      });
      await db.savePreferences(PREFERENCES);
      return { labResultId, valueId, noteId };
    }

    it('stores only IDs and links readable', async () => {
      const { db, database } = await openTestDb();
      await addEverything(db);

      expect(await storedFields(database)).toEqual({
        biomarkers: [],
        labResults: ['encrypted', 'id'],
        testValues: ['encrypted', 'id', 'labResultId'],
        userNotes: ['encrypted', 'id', 'labResultId', 'testValueId'],
        userPreferences: ['encrypted', 'id'],
      });
      const raw = await stored(database);
      for (const text of ['mmol/mol', '2024-03-01', '2024-01-15', 'HPLC', 'Quest', '48']) {
        expect(raw).not.toContain(text);
      }
    });

    it('reads back every field with its type', async () => {
      const { db } = await openTestDb();
      const { labResultId, valueId, noteId } = await addEverything(db);

      expect(await db.getLabResult(labResultId)).toEqual({
        id: labResultId,
        date: new Date('2024-03-01T12:00:00Z'),
        labName: 'Quest',
        notes: 'fasting',
        createdAt: now,
        updatedAt: now,
      });
      expect(await db.getTestValue(valueId)).toEqual({
        id: valueId,
        labResultId,
        biomarkerKey: 'hba1c',
        value: 48,
        unit: 'mmol/mol',
        referenceRangeLow: 20,
        referenceRangeHigh: 42,
        method: 'HPLC',
        confidence: 0.9,
        createdAt: now,
        updatedAt: now,
      });
      expect(await db.getNote(noteId)).toEqual({
        id: noteId,
        labResultId,
        testValueId: valueId,
        content: 'c',
        tags: [],
        createdAt: now,
        updatedAt: now,
      });
      expect(await db.getPreferences()).toEqual(expect.objectContaining(PREFERENCES));
    });

    it('keeps qualitative values as they were', async () => {
      const { db } = await openTestDb();
      const [text, flag] = await db.addTestValues(
        ['positive', true].map((value) => ({
          labResultId: 1, biomarkerKey: 'k', value, unit: '', createdAt: now, updatedAt: now,
        }))
      );

      expect((await db.getTestValue(text))?.value).toBe('positive');
      expect((await db.getTestValue(flag))?.value).toBe(true);
    });

    it('changes only the fields an update gives', async () => {
      const { db } = await openTestDb();
      const { labResultId, valueId, noteId } = await addEverything(db);
      const later = new Date('2024-05-01T00:00:00Z');

      await db.updateLabResult(labResultId, { labName: 'LabCorp', updatedAt: later });
      await db.updateTestValue(valueId, { value: 50 });
      await db.updateNote(noteId, { content: 'edited', updatedAt: later });

      expect(await db.getLabResult(labResultId)).toMatchObject({
        labName: 'LabCorp', notes: 'fasting', date: new Date('2024-03-01T12:00:00Z'), updatedAt: later,
      });
      expect(await db.getTestValue(valueId)).toMatchObject({ value: 50, unit: 'mmol/mol', biomarkerKey: 'hba1c' });
      expect(await db.getNote(noteId)).toMatchObject({ content: 'edited', createdAt: now, updatedAt: later });
    });

    it('removes a field an update sets to undefined', async () => {
      const { db } = await openTestDb();
      const { labResultId } = await addEverything(db);

      await db.updateLabResult(labResultId, { notes: undefined });

      expect(await db.getLabResult(labResultId)).not.toHaveProperty('notes');
    });

    it('lists lab results newest first and finds them by date range', async () => {
      const { db } = await openTestDb();
      const add = (day: string) =>
        db.addLabResult({ date: new Date(`${day}T12:00:00Z`), labName: day, createdAt: now, updatedAt: now });
      await add('2024-02-01');
      await add('2024-04-01');
      await add('2024-03-01');

      expect((await db.getAllLabResults()).map((r) => r.labName)).toEqual([
        '2024-04-01',
        '2024-03-01',
        '2024-02-01',
      ]);
      const inRange = await db.getLabResultsByDateRange(
        new Date('2024-02-15T00:00:00Z'),
        new Date('2024-04-01T12:00:00Z')
      );
      // As the date index did: the start is included, the end is not
      expect(inRange.map((r) => r.labName)).toEqual(['2024-03-01']);
    });

    it('lists notes newest first', async () => {
      const { db } = await openTestDb();
      for (const day of ['2024-01-02', '2024-01-03', '2024-01-01']) {
        const at = new Date(`${day}T00:00:00Z`);
        await db.addNote({ content: day, tags: [], createdAt: at, updatedAt: at });
      }

      expect((await db.getAllNotes()).map((n) => n.content)).toEqual([
        '2024-01-03',
        '2024-01-02',
        '2024-01-01',
      ]);
    });

    it('no longer indexes dates or lab names', async () => {
      const { database } = await openTestDb();
      await database.open();

      expect(database.labResults.schema.indexes).toEqual([]);
      expect(database.userNotes.schema.indexes.map((index) => index.name).sort()).toEqual([
        'labResultId',
        'testValueId',
      ]);
    });

    describe('records as earlier versions stored them', () => {
      async function seedEarlierVersion(test: TestDb) {
        const labResultId = await storeAsEarlierVersion(test, 'labResults', {
          date: new Date('2024-03-01T12:00:00Z'),
          labName: 'Quest',
          createdAt: now,
          updatedAt: now,
        });
        const valueId = await storeAsEarlierVersion(test, 'testValues', {
          labResultId,
          biomarkerKey: 'hba1c',
          value: 48,
          unit: 'mmol/mol',
          rawText: 'HbA1c',
          createdAt: now,
          updatedAt: now,
        });
        const noteId = await storeAsEarlierVersion(test, 'userNotes', {
          labResultId,
          content: 'c',
          tags: ['diabetes'],
          createdAt: now,
          updatedAt: now,
        });
        return { labResultId, valueId, noteId };
      }

      it('are read and updated correctly', async () => {
        const test = await openTestDb();
        const { db } = test;
        const { labResultId, valueId, noteId } = await seedEarlierVersion(test);

        await db.updateTestValue(valueId, { value: 50 });

        expect(await db.getLabResult(labResultId)).toMatchObject({ labName: 'Quest', date: new Date('2024-03-01T12:00:00Z') });
        expect(await db.getTestValue(valueId)).toMatchObject({ value: 50, unit: 'mmol/mol', rawText: 'HbA1c' });
        expect(await db.getNote(noteId)).toMatchObject({ content: 'c', tags: ['diabetes'] });
      });

      it('are encrypted whole by the migration', async () => {
        const test = await openTestDb();
        const { db, database } = test;
        const { labResultId, valueId } = await seedEarlierVersion(test);

        await db.migrateLegacyRecords();

        const fields = await storedFields(database);
        expect(fields.labResults).toEqual(['encrypted', 'id']);
        expect(fields.testValues).toEqual(['encrypted', 'id', 'labResultId']);
        expect(fields.userNotes).toEqual(['encrypted', 'id', 'labResultId']);
        expect(await db.getLabResult(labResultId)).toMatchObject({ labName: 'Quest' });
        expect(await db.getTestValue(valueId)).toMatchObject({ value: 48, rawText: 'HbA1c', biomarkerKey: 'hba1c' });
      });
    });
  });
});

