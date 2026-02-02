import Dexie, { type EntityTable } from 'dexie';
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

  constructor() {
    super('HemoIO');

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
  }
}

export const db = new HemoIODatabase();

export { EncryptedDb, createEncryptedDb } from './encryptedDb';
