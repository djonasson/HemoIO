import Dexie, { type EntityTable } from 'dexie';
import type {
  LabResult,
  TestValue,
  UserPreferences,
  Settings,
  UserNote,
} from '@/types';

/** The tables whose records are sealed: everything but IDs and links encrypted */
export type SealedTable = 'labResults' | 'testValues' | 'userNotes' | 'userPreferences';

/**
 * A record the session key could not open, kept aside instead of being
 * deleted: it may open with another key, such as one recovered later
 */
export interface SetAsideRow {
  id?: number;
  table: SealedTable;
  /** The row exactly as it was stored: readable IDs and links, and its ciphertext */
  row: Record<string, unknown>;
  /** 1 once it is in a downloaded file: folder sync no longer waits for it */
  savedToFile: 0 | 1;
}

/**
 * HemoIO Database
 *
 * Uses Dexie.js as a wrapper around IndexedDB.
 * In production, data will be encrypted before storage.
 */
export class HemoIODatabase extends Dexie {
  labResults!: EntityTable<LabResult, 'id'>;
  testValues!: EntityTable<TestValue, 'id'>;
  userPreferences!: EntityTable<UserPreferences, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  userNotes!: EntityTable<UserNote, 'id'>;
  setAside!: EntityTable<SetAsideRow, 'id'>;

  constructor(name = 'HemoIO') {
    super(name);

    this.version(1).stores({
      labResults: '++id, date, labName',
      testValues: '++id, labResultId, biomarkerId, [labResultId+biomarkerId]',
      biomarkers: '++id, name, category',
      userPreferences: '++id',
      settings: '++id',
    });

    // Version 2: Add user notes table
    this.version(2).stores({
      labResults: '++id, date, labName',
      testValues: '++id, labResultId, biomarkerId, [labResultId+biomarkerId]',
      biomarkers: '++id, name, category',
      userPreferences: '++id',
      settings: '++id',
      userNotes: '++id, labResultId, biomarkerId, testValueId, createdAt, *tags',
    });

    // Version 3: biomarkers are referenced by permanent keys instead of their
    // position in the dictionary
    this.version(3).stores({
      labResults: '++id, date, labName',
      testValues: '++id, labResultId, biomarkerKey, [labResultId+biomarkerKey]',
      biomarkers: '++id, name, category',
      userPreferences: '++id',
      settings: '++id',
      userNotes: '++id, labResultId, biomarkerKey, testValueId, createdAt, *tags',
    });

    // Version 5: records are sealed (everything but IDs and links encrypted),
    // so lab data is indexed by IDs and links only. (Version 4 was never
    // released.)
    this.version(5).stores({
      labResults: '++id',
      testValues: '++id, labResultId',
      biomarkers: '++id, name, category',
      userPreferences: '++id',
      settings: '++id',
      userNotes: '++id, labResultId, testValueId',
    });

    // Version 6: a marker table for migrations that needed the encryption key
    this.version(6).stores({
      labResults: '++id',
      testValues: '++id, labResultId',
      biomarkers: '++id, name, category',
      userPreferences: '++id',
      settings: '++id',
      userNotes: '++id, labResultId, testValueId',
      meta: '&key',
    });

    // Version 7: tests are identified by LOINC code, so the database starts
    // empty. Values, notes and preferences (sealed: their per-test maps, and
    // the theme and date format with them, cannot be edited without the
    // encryption key) are cleared; settings, which hold the AI configuration,
    // are kept. The legacy biomarker and marker tables are dropped.
    this.version(7)
      .stores({
        labResults: '++id',
        testValues: '++id, labResultId',
        biomarkers: null,
        userPreferences: '++id',
        settings: '++id',
        userNotes: '++id, labResultId, testValueId',
        meta: null,
      })
      .upgrade(async (tx) => {
        await Promise.all(
          ['labResults', 'testValues', 'userNotes', 'userPreferences'].map((name) =>
            tx.table(name).clear()
          )
        );
      });

    // Version 8: records the session key cannot open are moved aside, never
    // deleted. Nothing is migrated.
    this.version(8).stores({
      labResults: '++id',
      testValues: '++id, labResultId',
      userPreferences: '++id',
      settings: '++id',
      userNotes: '++id, labResultId, testValueId',
      setAside: '++id',
    });
  }
}

export const db = new HemoIODatabase();

export { EncryptedDb, createEncryptedDb } from './encryptedDb';
