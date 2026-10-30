import Dexie, { type EntityTable } from 'dexie';
import {
  migrateNoteRecord,
  migratePreferenceMaps,
  migrateTestValueRecord,
} from '@data/migrations/biomarkerKeyMigration';
import type {
  LabResult,
  TestValue,
  Biomarker,
  UserPreferences,
  Settings,
  UserNote,
} from '@/types';

/** Set by the schema upgrade: records stored by an earlier version need migrating */
export const MIGRATE_RECORDS = 'migrate-records';

/**
 * HemoIO Database
 *
 * Uses Dexie.js as a wrapper around IndexedDB.
 * In production, data will be encrypted before storage.
 */
export class HemoIODatabase extends Dexie {
  labResults!: EntityTable<LabResult, 'id'>;
  testValues!: EntityTable<TestValue, 'id'>;
  biomarkers!: EntityTable<Biomarker, 'id'>;
  userPreferences!: EntityTable<UserPreferences, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  userNotes!: EntityTable<UserNote, 'id'>;
  /** Markers for the migrations that need the encryption key (see MIGRATE_RECORDS) */
  meta!: EntityTable<{ key: string }, 'key'>;

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
    // position in the dictionary (which shifted when entries were inserted)
    this.version(3)
      .stores({
        labResults: '++id, date, labName',
        testValues: '++id, labResultId, biomarkerKey, [labResultId+biomarkerKey]',
        biomarkers: '++id, name, category',
        userPreferences: '++id',
        settings: '++id',
        userNotes: '++id, labResultId, biomarkerKey, testValueId, createdAt, *tags',
      })
      .upgrade(async (tx) => {
        // Only unencrypted fields are touched, so no encryption key is needed
        await tx.table('testValues').toCollection().modify((record, ref) => {
          ref.value = migrateTestValueRecord(record);
        });
        await tx.table('userNotes').toCollection().modify((record, ref) => {
          ref.value = migrateNoteRecord(record);
        });
        await tx.table('userPreferences').toCollection().modify((record, ref) => {
          ref.value = migratePreferenceMaps(record);
        });
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

    // Version 6: marks a database upgraded from an earlier version, so the
    // records it stored are migrated once after unlock
    // (EncryptedDb.migrateLegacyRecords), which needs the encryption key. A
    // new database has nothing to migrate and is never marked.
    this.version(6)
      .stores({
        labResults: '++id',
        testValues: '++id, labResultId',
        biomarkers: '++id, name, category',
        userPreferences: '++id',
        settings: '++id',
        userNotes: '++id, labResultId, testValueId',
        meta: '&key',
      })
      .upgrade((tx) => tx.table('meta').put({ key: MIGRATE_RECORDS }));
  }
}

export const db = new HemoIODatabase();

export {
  EncryptedDb,
  createEncryptedDb,
  WRITE_TIMEOUT_MS,
  type EncryptedDbOptions,
  type LabResultWithValues,
} from './encryptedDb';
export { SaveError, saveErrorMessage, toSaveError, type SaveErrorKind } from './saveError';
