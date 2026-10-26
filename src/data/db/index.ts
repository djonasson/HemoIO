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

    // Version 4: biomarker keys and note tags are stored encrypted, so they
    // are no longer indexed. Records stored readable are encrypted after
    // unlock (EncryptedDb.encryptReadableFields): this upgrade has no key.
    this.version(4).stores({
      labResults: '++id, date, labName',
      testValues: '++id, labResultId',
      biomarkers: '++id, name, category',
      userPreferences: '++id',
      settings: '++id',
      userNotes: '++id, labResultId, testValueId, createdAt',
    });

    // Version 5: records are sealed (everything but IDs and links encrypted),
    // so lab dates and names, and note dates, are no longer indexed. Records
    // stored with readable fields are sealed after unlock
    // (EncryptedDb.encryptReadableFields): this upgrade has no key.
    this.version(5).stores({
      labResults: '++id',
      testValues: '++id, labResultId',
      biomarkers: '++id, name, category',
      userPreferences: '++id',
      settings: '++id',
      userNotes: '++id, labResultId, testValueId',
    });
  }
}

export const db = new HemoIODatabase();

export { EncryptedDb, createEncryptedDb } from './encryptedDb';
