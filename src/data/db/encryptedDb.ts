/**
 * Encrypted Database Operations
 *
 * This module provides encryption middleware for Dexie operations.
 * It encrypts sensitive data before storing and decrypts when reading.
 *
 * Only certain fields are encrypted to maintain queryability on non-sensitive
 * fields like IDs and timestamps.
 */

import Dexie, { type Table } from 'dexie';
import { db, HemoIODatabase } from './index';
import { encryptString, decryptString } from '@data/encryption';
import {
  legacyUnknownKeyMapping,
  reconcileTestValueKey,
  remapPreferenceMaps,
} from '@data/migrations/biomarkerKeyMigration';
import { LEGACY_UNKNOWN_PREFIX } from '@data/migrations/legacyBiomarkerIds';
import type {
  LabResult,
  TestValue,
  Settings,
  UserPreferences,
  UserNote,
} from '@/types';

const DEFAULT_PREFERENCES: Omit<UserPreferences, 'id'> = {
  unitPreferences: {},
  personalTargets: {},
  theme: 'system',
  dateFormat: 'MM/DD/YYYY',
};

const DEFAULT_SETTINGS: Omit<Settings, 'id'> = {
  storageProvider: 'local',
  aiProvider: 'openai',
  language: 'en',
};

/**
 * A field stored encrypted. Biomarker keys are encrypted too, so the stored
 * data does not show which tests were done.
 */
interface EncryptedField {
  /** The field as the app sees it */
  field: string;
  /**
   * Where the ciphertext is stored, when not in the field itself: a readable
   * string left by an earlier version is then told apart from ciphertext
   */
  storedAs?: string;
  /** Not a string: encrypted as JSON. Ciphertext is a string, so readable values stay distinct. */
  json?: boolean;
}

const BIOMARKER_KEY: EncryptedField = { field: 'biomarkerKey', storedAs: 'encryptedBiomarkerKey' };

/**
 * Fields that should be encrypted for each table
 */
const ENCRYPTED_FIELDS: Record<string, EncryptedField[]> = {
  labResults: [{ field: 'labName' }, { field: 'notes' }],
  testValues: [{ field: 'rawText' }, BIOMARKER_KEY],
  settings: [{ field: 'aiApiKey' }],
  // Keyed by biomarker, and personal targets are health data
  userPreferences: [
    { field: 'unitPreferences', json: true },
    { field: 'personalTargets', json: true },
    { field: 'acknowledgedAlerts', json: true },
  ],
  userNotes: [{ field: 'content' }, BIOMARKER_KEY, { field: 'tags', json: true }],
};

/** Whether a stored record holds this field readable, as an earlier version stored it */
function isReadable(record: Record<string, unknown>, spec: EncryptedField): boolean {
  const value = record[spec.field];
  if (spec.storedAs) return typeof value === 'string';
  return spec.json === true && value !== undefined && value !== null && typeof value !== 'string';
}

/**
 * Encrypt an object's specified fields
 */
async function encryptFields<T>(
  obj: T,
  fieldsToEncrypt: EncryptedField[],
  key: CryptoKey
): Promise<T> {
  const encrypted = { ...obj } as Record<string, unknown>;

  for (const spec of fieldsToEncrypt) {
    const value = encrypted[spec.field];
    if (value === undefined || value === null) continue;
    if (!spec.json && typeof value !== 'string') continue;
    const ciphertext = await encryptString(
      spec.json ? JSON.stringify(value) : (value as string),
      key
    );
    if (spec.storedAs) {
      encrypted[spec.storedAs] = ciphertext;
      // Undefined, not deleted: an update then removes a readable copy
      encrypted[spec.field] = undefined;
    } else {
      encrypted[spec.field] = ciphertext;
    }
  }

  return encrypted as T;
}

/**
 * Decrypt an object's specified fields
 */
async function decryptFields<T>(
  obj: T,
  fieldsToEncrypt: EncryptedField[],
  key: CryptoKey
): Promise<T> {
  const decrypted = { ...obj } as Record<string, unknown>;

  for (const spec of fieldsToEncrypt) {
    const source = spec.storedAs ?? spec.field;
    const value = decrypted[source];
    // Anything else is absent or stored readable by an earlier version
    if (typeof value !== 'string') continue;
    try {
      const text = await decryptString(value, key);
      decrypted[spec.field] = spec.json ? JSON.parse(text) : text;
      if (spec.storedAs) delete decrypted[spec.storedAs];
    } catch {
      // If decryption fails, leave the field as-is (might be unencrypted data)
      console.warn(`Failed to decrypt field ${spec.field}, leaving as-is`);
    }
  }

  return decrypted as T;
}

/** Fields whose value is undefined are left out, so an update keeps them */
function definedFields<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

/**
 * Encrypted database operations wrapper
 */
export class EncryptedDb {
  private key: CryptoKey;
  private db: HemoIODatabase;

  constructor(encryptionKey: CryptoKey, database: HemoIODatabase = db) {
    this.key = encryptionKey;
    this.db = database;
  }

  // ============ Migrations needing the encryption key ============

  /**
   * Give unknown biomarkers stored before biomarker keys existed
   * ("unknown:legacy-<hash>") the key their extracted name gets today, so
   * their history joins values imported since. Needs rawText, which is
   * encrypted, so it runs after unlock rather than in the schema upgrade.
   *
   * @returns Number of legacy keys reconciled (0 when nothing to do)
   */
  async reconcileLegacyUnknownKeys(): Promise<number> {
    // Legacy keys are only in records stored readable, before keys were encrypted
    const isLegacy = (record: { biomarkerKey?: unknown }) =>
      typeof record.biomarkerKey === 'string' && record.biomarkerKey.startsWith(LEGACY_UNKNOWN_PREFIX);
    const legacyValues = await this.db.testValues.filter(isLegacy).toArray();
    if (legacyValues.length === 0) return 0;

    const decrypted = await Promise.all(
      legacyValues.map((tv) => decryptFields(tv, ENCRYPTED_FIELDS.testValues, this.key))
    );
    const mapping = legacyUnknownKeyMapping(decrypted);
    if (mapping.size === 0) return 0;
    // Each value by its own name: two names can share a legacy key
    const valueKeys = new Map(
      decrypted.map((tv) => [tv.id, reconcileTestValueKey(tv).biomarkerKey] as const)
    );

    await this.db.transaction('rw', this.db.testValues, this.db.userNotes, this.db.userPreferences, async () => {
      await this.db.testValues
        .filter((record) => mapping.has(record.biomarkerKey))
        .modify((record) => {
          record.biomarkerKey = valueKeys.get(record.id) ?? mapping.get(record.biomarkerKey)!;
        });
      await this.db.userNotes
        .filter((record) => record.biomarkerKey !== undefined && mapping.has(record.biomarkerKey))
        .modify((record) => {
          record.biomarkerKey = mapping.get(record.biomarkerKey!)!;
        });
      await this.db.userPreferences.toCollection().modify((record, ref) => {
        ref.value = remapPreferenceMaps(record, mapping);
      });
    });

    return mapping.size;
  }

  /**
   * Encrypt the fields earlier versions stored readable: biomarker keys,
   * note tags and the biomarker-keyed preferences. Runs after unlock, after
   * legacy keys are reconciled (which reads them readable); does nothing
   * when everything is encrypted.
   *
   * @returns Number of records encrypted
   */
  async encryptReadableFields(): Promise<number> {
    const counts = await Promise.all([
      this.encryptReadable(this.db.testValues, ENCRYPTED_FIELDS.testValues),
      this.encryptReadable(this.db.userNotes, ENCRYPTED_FIELDS.userNotes),
      this.encryptReadable(this.db.userPreferences, ENCRYPTED_FIELDS.userPreferences),
    ]);
    return counts.reduce((sum, count) => sum + count, 0);
  }

  private async encryptReadable<T extends { id?: number }>(
    table: Table<T, number | undefined>,
    fields: EncryptedField[]
  ): Promise<number> {
    const readable = (record: T) =>
      fields.filter((spec) => isReadable(record as Record<string, unknown>, spec));
    const records = await table.filter((record) => readable(record).length > 0).toArray();
    // Encrypted up front: a transaction ends at the first await outside IndexedDB
    const changes = new Map(
      await Promise.all(
        records.map(async (record) => {
          const specs = readable(record);
          const values = Object.fromEntries(
            specs.map((spec) => [spec.field, (record as Record<string, unknown>)[spec.field]])
          );
          return [record.id!, await encryptFields(values, specs, this.key)] as const;
        })
      )
    );
    await this.db.transaction('rw', table, () =>
      table
        .filter((record) => changes.has(record.id!))
        .modify((record) => {
          const target = record as Record<string, unknown>;
          for (const [field, value] of Object.entries(changes.get(record.id!)!)) {
            if (value === undefined) delete target[field];
            else target[field] = value;
          }
        })
    );
    return changes.size;
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

  /** Biomarker keys are encrypted, so not indexed: values are filtered once read */
  async getTestValuesByBiomarker(biomarkerKey: string): Promise<TestValue[]> {
    return (await this.getAllTestValues()).filter((tv) => tv.biomarkerKey === biomarkerKey);
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

  /**
   * Change some settings fields, keeping the others. Reading and writing in
   * one transaction stops concurrent updates from undoing each other.
   */
  async updateSettings(changes: Partial<Omit<Settings, 'id'>>): Promise<void> {
    // Encrypted up front: a transaction ends at the first await outside IndexedDB
    const [encryptedChanges, encryptedNew] = await Promise.all([
      encryptFields(changes, ENCRYPTED_FIELDS.settings, this.key),
      encryptFields({ ...DEFAULT_SETTINGS, ...changes }, ENCRYPTED_FIELDS.settings, this.key),
    ]);
    await this.db.transaction('rw', this.db.settings, async () => {
      const existing = await this.db.settings.toCollection().first();
      if (existing?.id !== undefined) {
        await this.db.settings.update(existing.id, encryptedChanges);
      } else {
        await this.db.settings.add(encryptedNew as Settings);
      }
    });
  }

  // ============ User Preferences ============

  async getPreferences(): Promise<UserPreferences | undefined> {
    const preferences = await this.db.userPreferences.toCollection().first();
    if (!preferences) return undefined;
    return decryptFields(preferences, ENCRYPTED_FIELDS.userPreferences, this.key);
  }

  async savePreferences(
    preferences: Omit<UserPreferences, 'id'>
  ): Promise<number> {
    const encrypted = await encryptFields(preferences, ENCRYPTED_FIELDS.userPreferences, this.key);
    const existing = await this.db.userPreferences.toCollection().first();
    if (existing?.id !== undefined) {
      await this.db.userPreferences.update(existing.id, encrypted);
      return existing.id;
    }

    const id = await this.db.userPreferences.add(encrypted as UserPreferences);
    return id!;
  }

  /**
   * Read, change and write the preferences in one transaction, so writers
   * changing different preferences at the same time never undo each other
   */
  async updatePreferences(
    update: (current: UserPreferences | undefined) => Partial<Omit<UserPreferences, 'id'>>
  ): Promise<void> {
    const fields = ENCRYPTED_FIELDS.userPreferences;
    await this.db.transaction('rw', this.db.userPreferences, async () => {
      const existing = await this.db.userPreferences.toCollection().first();
      // Dexie.waitFor keeps the transaction open across the decryption and
      // encryption, which are not IndexedDB requests
      const current = existing && (await Dexie.waitFor(decryptFields(existing, fields, this.key)));
      const changes = update(current);
      if (existing?.id !== undefined) {
        const encrypted = await Dexie.waitFor(encryptFields(changes, fields, this.key));
        await this.db.userPreferences.update(existing.id, encrypted);
      } else {
        const encrypted = await Dexie.waitFor(
          encryptFields({ ...DEFAULT_PREFERENCES, ...changes }, fields, this.key)
        );
        await this.db.userPreferences.add(encrypted as UserPreferences);
      }
    });
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

  /** Biomarker keys are encrypted, so not indexed: notes are filtered once read */
  async getNotesByBiomarker(biomarkerKey: string): Promise<UserNote[]> {
    return (await this.getAllNotes()).filter((note) => note.biomarkerKey === biomarkerKey);
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

  /** Tags are encrypted, so not indexed: notes are filtered once read */
  async getNotesByTag(tag: string): Promise<UserNote[]> {
    return (await this.getAllNotes()).filter((note) => note.tags.includes(tag));
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

  /**
   * Remove all lab data (results, values, notes). Settings and preferences
   * are kept: they are device configuration, not lab data.
   */
  /**
   * Replace all lab data (results, values, notes) and, when given, the
   * preferences, in one transaction: a restore that fails part-way leaves the
   * old data in place. Records get new IDs (auto-increment does not reset when
   * tables are cleared), so references between them are rewritten from the
   * given IDs to the new ones. Values whose result is not given are skipped.
   */
  async replaceLabData(data: {
    labResults: LabResult[];
    testValues: TestValue[];
    userNotes: UserNote[];
    userPreferences?: Omit<UserPreferences, 'id'>;
  }): Promise<{ labResults: number; testValues: number; notes: number }> {
    // Encrypted up front: a transaction ends at the first await outside IndexedDB
    const encrypt = <T extends { id?: number }>(records: T[], fields: EncryptedField[]) =>
      Promise.all(
        records.map(async (record) => {
          const { id, ...rest } = record;
          return { id, encrypted: await encryptFields(rest, fields, this.key) };
        })
      );
    const [labResults, testValues, userNotes, userPreferences] = await Promise.all([
      encrypt(data.labResults, ENCRYPTED_FIELDS.labResults),
      encrypt(data.testValues, ENCRYPTED_FIELDS.testValues),
      encrypt(data.userNotes, ENCRYPTED_FIELDS.userNotes),
      data.userPreferences &&
        encryptFields(
          definedFields(data.userPreferences),
          ENCRYPTED_FIELDS.userPreferences,
          this.key
        ),
    ]);

    const tables = [this.db.labResults, this.db.testValues, this.db.userNotes, this.db.userPreferences];
    return this.db.transaction('rw', tables, async () => {
      await Promise.all([
        this.db.labResults.clear(),
        this.db.testValues.clear(),
        this.db.userNotes.clear(),
      ]);

      const resultKeys = await this.db.labResults.bulkAdd(
        labResults.map((r) => r.encrypted as LabResult),
        { allKeys: true }
      );
      const resultIds = new Map<number, number>();
      labResults.forEach((r, i) => {
        if (r.id !== undefined) resultIds.set(r.id, resultKeys[i] as number);
      });

      const linkedValues = testValues.filter((tv) => resultIds.has(tv.encrypted.labResultId));
      const valueKeys = await this.db.testValues.bulkAdd(
        linkedValues.map(
          (tv) => ({ ...tv.encrypted, labResultId: resultIds.get(tv.encrypted.labResultId)! }) as TestValue
        ),
        { allKeys: true }
      );
      const valueIds = new Map<number, number>();
      linkedValues.forEach((tv, i) => {
        if (tv.id !== undefined) valueIds.set(tv.id, valueKeys[i] as number);
      });

      const remap = (ids: Map<number, number>, id: number | undefined) =>
        id !== undefined ? ids.get(id) : undefined;
      await this.db.userNotes.bulkAdd(
        userNotes.map(
          (note) =>
            ({
              ...note.encrypted,
              labResultId: remap(resultIds, note.encrypted.labResultId),
              testValueId: remap(valueIds, note.encrypted.testValueId),
            }) as UserNote
        )
      );

      if (userPreferences) {
        // As savePreferences: fields the backup lacks keep their current values
        const existing = await this.db.userPreferences.toCollection().first();
        if (existing?.id !== undefined) {
          await this.db.userPreferences.update(existing.id, userPreferences);
        } else {
          await this.db.userPreferences.add(userPreferences as UserPreferences);
        }
      }

      return {
        labResults: labResults.length,
        testValues: linkedValues.length,
        notes: userNotes.length,
      };
    });
  }
}

/**
 * Create an encrypted database instance with the given key
 */
export function createEncryptedDb(encryptionKey: CryptoKey): EncryptedDb {
  return new EncryptedDb(encryptionKey);
}
