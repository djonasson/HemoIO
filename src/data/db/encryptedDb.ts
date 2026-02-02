/**
 * Encrypted Database Operations
 *
 * This module provides encryption middleware for Dexie operations.
 * It encrypts sensitive data before storing and decrypts when reading.
 *
 * Only certain fields are encrypted to maintain queryability on non-sensitive
 * fields like IDs and timestamps.
 */

import { db, HemoIODatabase } from './index';
import { encryptString, decryptString } from '@data/encryption';
import type {
  LabResult,
  TestValue,
  Settings,
  UserPreferences,
  UserNote,
} from '@/types';

/**
 * Fields that should be encrypted for each table
 */
const ENCRYPTED_FIELDS: Record<string, string[]> = {
  labResults: ['labName', 'notes'],
  testValues: ['rawText'],
  settings: ['aiApiKey'],
  userPreferences: [], // Preferences are not sensitive
  userNotes: ['content'], // Note content is sensitive
};

/**
 * Encrypt an object's specified fields
 */
async function encryptFields<T>(
  obj: T,
  fieldsToEncrypt: string[],
  key: CryptoKey
): Promise<T> {
  const encrypted = { ...obj } as Record<string, unknown>;

  for (const field of fieldsToEncrypt) {
    const value = encrypted[field];
    if (value !== undefined && value !== null && typeof value === 'string') {
      encrypted[field] = await encryptString(value, key);
    }
  }

  return encrypted as T;
}

/**
 * Decrypt an object's specified fields
 */
async function decryptFields<T>(
  obj: T,
  fieldsToEncrypt: string[],
  key: CryptoKey
): Promise<T> {
  const decrypted = { ...obj } as Record<string, unknown>;

  for (const field of fieldsToEncrypt) {
    const value = decrypted[field];
    if (value !== undefined && value !== null && typeof value === 'string') {
      try {
        decrypted[field] = await decryptString(value, key);
      } catch {
        // If decryption fails, leave the field as-is (might be unencrypted data)
        console.warn(`Failed to decrypt field ${field}, leaving as-is`);
      }
    }
  }

  return decrypted as T;
}

/**
 * Encrypted database operations wrapper
 */
export class EncryptedDb {
  private key: CryptoKey;
  private db: HemoIODatabase;

  constructor(encryptionKey: CryptoKey) {
    this.key = encryptionKey;
    this.db = db;
  }

  // ============ Lab Results ============

  async addLabResult(labResult: Omit<LabResult, 'id'>): Promise<number> {
    const encrypted = await encryptFields(
      labResult,
      ENCRYPTED_FIELDS.labResults,
      this.key
    );
    const id = await this.db.labResults.add(encrypted as LabResult);
    return id!;
  }

  async getLabResult(id: number): Promise<LabResult | undefined> {
    const result = await this.db.labResults.get(id);
    if (!result) return undefined;
    return decryptFields(result, ENCRYPTED_FIELDS.labResults, this.key);
  }

  async getAllLabResults(): Promise<LabResult[]> {
    const results = await this.db.labResults.orderBy('date').reverse().toArray();
    return Promise.all(
      results.map((r) => decryptFields(r, ENCRYPTED_FIELDS.labResults, this.key))
    );
  }

  async getLabResultsByDateRange(
    startDate: Date,
    endDate: Date
  ): Promise<LabResult[]> {
    const results = await this.db.labResults
      .where('date')
      .between(startDate, endDate)
      .toArray();
    return Promise.all(
      results.map((r) => decryptFields(r, ENCRYPTED_FIELDS.labResults, this.key))
    );
  }

  async updateLabResult(
    id: number,
    changes: Partial<LabResult>
  ): Promise<number> {
    const encrypted = await encryptFields(
      changes,
      ENCRYPTED_FIELDS.labResults,
      this.key
    );
    return this.db.labResults.update(id, encrypted);
  }

  async deleteLabResult(id: number): Promise<void> {
    // Also delete associated test values
    await this.db.testValues.where('labResultId').equals(id).delete();
    await this.db.labResults.delete(id);
  }

  // ============ Test Values ============

  async addTestValue(testValue: Omit<TestValue, 'id'>): Promise<number> {
    const encrypted = await encryptFields(
      testValue,
      ENCRYPTED_FIELDS.testValues,
      this.key
    );
    const id = await this.db.testValues.add(encrypted as TestValue);
    return id!;
  }

  async addTestValues(testValues: Omit<TestValue, 'id'>[]): Promise<number[]> {
    const encrypted = await Promise.all(
      testValues.map((tv) =>
        encryptFields(tv, ENCRYPTED_FIELDS.testValues, this.key)
      )
    );
    const keys = await this.db.testValues.bulkAdd(encrypted as TestValue[], {
      allKeys: true,
    });
    return keys.filter((k): k is number => k !== undefined);
  }

  async getTestValue(id: number): Promise<TestValue | undefined> {
    const result = await this.db.testValues.get(id);
    if (!result) return undefined;
    return decryptFields(result, ENCRYPTED_FIELDS.testValues, this.key);
  }

  async getTestValuesByLabResult(labResultId: number): Promise<TestValue[]> {
    const results = await this.db.testValues
      .where('labResultId')
      .equals(labResultId)
      .toArray();
    return Promise.all(
      results.map((r) => decryptFields(r, ENCRYPTED_FIELDS.testValues, this.key))
    );
  }

  async getAllTestValues(): Promise<TestValue[]> {
    const results = await this.db.testValues.toArray();
    return Promise.all(
      results.map((r) => decryptFields(r, ENCRYPTED_FIELDS.testValues, this.key))
    );
  }

  async getTestValuesByBiomarker(biomarkerId: number): Promise<TestValue[]> {
    const results = await this.db.testValues
      .where('biomarkerId')
      .equals(biomarkerId)
      .toArray();
    return Promise.all(
      results.map((r) => decryptFields(r, ENCRYPTED_FIELDS.testValues, this.key))
    );
  }

  async updateTestValue(
    id: number,
    changes: Partial<TestValue>
  ): Promise<number> {
    const encrypted = await encryptFields(
      changes,
      ENCRYPTED_FIELDS.testValues,
      this.key
    );
    return this.db.testValues.update(id, encrypted);
  }

  async deleteTestValue(id: number): Promise<void> {
    await this.db.testValues.delete(id);
  }

  // ============ Settings ============

  async getSettings(): Promise<Settings | undefined> {
    const settings = await this.db.settings.toCollection().first();
    if (!settings) return undefined;
    return decryptFields(settings, ENCRYPTED_FIELDS.settings, this.key);
  }

  async saveSettings(settings: Omit<Settings, 'id'>): Promise<number> {
    const encrypted = await encryptFields(
      settings,
      ENCRYPTED_FIELDS.settings,
      this.key
    );

    // Check if settings already exist
    const existing = await this.db.settings.toCollection().first();
    if (existing?.id !== undefined) {
      await this.db.settings.update(existing.id, encrypted);
      return existing.id;
    }

    const id = await this.db.settings.add(encrypted as Settings);
    return id!;
  }

  // ============ User Preferences ============

  async getPreferences(): Promise<UserPreferences | undefined> {
    return this.db.userPreferences.toCollection().first();
  }

  async savePreferences(
    preferences: Omit<UserPreferences, 'id'>
  ): Promise<number> {
    const existing = await this.db.userPreferences.toCollection().first();
    if (existing?.id !== undefined) {
      await this.db.userPreferences.update(existing.id, preferences);
      return existing.id;
    }

    const id = await this.db.userPreferences.add(preferences as UserPreferences);
    return id!;
  }

  // ============ Biomarkers ============

  async getBiomarker(id: number) {
    return this.db.biomarkers.get(id);
  }

  async getAllBiomarkers() {
    return this.db.biomarkers.toArray();
  }

  async getBiomarkersByCategory(category: string) {
    return this.db.biomarkers.where('category').equals(category).toArray();
  }

  async findBiomarkerByName(name: string) {
    return this.db.biomarkers.where('name').equalsIgnoreCase(name).first();
  }

  // ============ User Notes ============

  async addNote(note: Omit<UserNote, 'id'>): Promise<number> {
    const encrypted = await encryptFields(
      note,
      ENCRYPTED_FIELDS.userNotes,
      this.key
    );
    const id = await this.db.userNotes.add(encrypted as UserNote);
    return id!;
  }

  async getNote(id: number): Promise<UserNote | undefined> {
    const result = await this.db.userNotes.get(id);
    if (!result) return undefined;
    return decryptFields(result, ENCRYPTED_FIELDS.userNotes, this.key);
  }

  async getAllNotes(): Promise<UserNote[]> {
    const results = await this.db.userNotes.orderBy('createdAt').reverse().toArray();
    return Promise.all(
      results.map((r) => decryptFields(r, ENCRYPTED_FIELDS.userNotes, this.key))
    );
  }

  async getNotesByLabResult(labResultId: number): Promise<UserNote[]> {
    const results = await this.db.userNotes
      .where('labResultId')
      .equals(labResultId)
      .toArray();
    return Promise.all(
      results.map((r) => decryptFields(r, ENCRYPTED_FIELDS.userNotes, this.key))
    );
  }

  async getNotesByBiomarker(biomarkerId: number): Promise<UserNote[]> {
    const results = await this.db.userNotes
      .where('biomarkerId')
      .equals(biomarkerId)
      .toArray();
    return Promise.all(
      results.map((r) => decryptFields(r, ENCRYPTED_FIELDS.userNotes, this.key))
    );
  }

  async getNotesByTestValue(testValueId: number): Promise<UserNote[]> {
    const results = await this.db.userNotes
      .where('testValueId')
      .equals(testValueId)
      .toArray();
    return Promise.all(
      results.map((r) => decryptFields(r, ENCRYPTED_FIELDS.userNotes, this.key))
    );
  }

  async getNotesByTag(tag: string): Promise<UserNote[]> {
    const results = await this.db.userNotes
      .where('tags')
      .equals(tag)
      .toArray();
    return Promise.all(
      results.map((r) => decryptFields(r, ENCRYPTED_FIELDS.userNotes, this.key))
    );
  }

  async updateNote(id: number, changes: Partial<UserNote>): Promise<number> {
    const encrypted = await encryptFields(
      changes,
      ENCRYPTED_FIELDS.userNotes,
      this.key
    );
    return this.db.userNotes.update(id, encrypted);
  }

  async deleteNote(id: number): Promise<void> {
    await this.db.userNotes.delete(id);
  }

  // Alias for addNote - used by restore flow
  async addUserNote(note: Omit<UserNote, 'id'>): Promise<number> {
    return this.addNote(note);
  }

  // ============ Bulk Operations ============

  async exportAllData(): Promise<{
    labResults: LabResult[];
    testValues: TestValue[];
    userNotes: UserNote[];
    settings: Settings | undefined;
    preferences: UserPreferences | undefined;
  }> {
    const [labResults, testValues, userNotes, settings, preferences] = await Promise.all([
      this.getAllLabResults(),
      this.db.testValues.toArray().then((results) =>
        Promise.all(
          results.map((r) =>
            decryptFields(r, ENCRYPTED_FIELDS.testValues, this.key)
          )
        )
      ),
      this.getAllNotes(),
      this.getSettings(),
      this.getPreferences(),
    ]);

    return {
      labResults,
      testValues,
      userNotes,
      settings,
      preferences,
    };
  }

  async clearAllData(): Promise<void> {
    await Promise.all([
      this.db.labResults.clear(),
      this.db.testValues.clear(),
      this.db.userNotes.clear(),
      this.db.settings.clear(),
      this.db.userPreferences.clear(),
    ]);
  }
}

/**
 * Create an encrypted database instance with the given key
 */
export function createEncryptedDb(encryptionKey: CryptoKey): EncryptedDb {
  return new EncryptedDb(encryptionKey);
}
