/**
 * Encrypted Database Operations
 *
 * This module provides encryption middleware for Dexie operations.
 * It encrypts sensitive data before storing and decrypts when reading.
 *
 * Lab data is stored sealed: each record keeps only its ID and the IDs it
 * links to readable, which the indexes need, and everything else (names,
 * biomarker keys, values, units, ranges, dates, tags, preferences) is one
 * encrypted JSON blob. Someone without the password cannot tell which tests
 * were done, when, or with what results. Settings encrypt the API key only.
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

// ============ Sealed records ============

type SealedTable = 'labResults' | 'testValues' | 'userNotes' | 'userPreferences';

/** Fields kept readable: IDs and links, which the indexes need */
const READABLE_FIELDS: Record<SealedTable, readonly string[]> = {
  labResults: ['id'],
  testValues: ['id', 'labResultId'],
  userNotes: ['id', 'labResultId', 'testValueId'],
  userPreferences: ['id'],
};

/** A record as stored: its readable fields and the ciphertext of the rest */
type SealedRecord = Record<string, unknown> & { id?: number; encrypted?: string };

// Dates survive the JSON round trip as { $date: milliseconds }; an invalid
// date, which a restored backup can hold, as { $date: null }
function dateReplacer(this: Record<string, unknown>, field: string, value: unknown): unknown {
  const raw = this[field];
  if (raw instanceof Date) {
    const time = raw.getTime();
    return { $date: Number.isNaN(time) ? null : time };
  }
  return value;
}

function dateReviver(_field: string, value: unknown): unknown {
  if (
    typeof value === 'object' &&
    value !== null &&
    '$date' in value &&
    Object.keys(value).length === 1
  ) {
    const time = (value as { $date: number | null }).$date;
    return new Date(time ?? NaN);
  }
  return value;
}

async function seal(
  record: object,
  readable: readonly string[],
  key: CryptoKey
): Promise<SealedRecord> {
  const stored: SealedRecord = {};
  const hidden: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(record)) {
    // Undefined fields are left out, as Dexie's update removes them
    if (value === undefined) continue;
    if (readable.includes(field)) stored[field] = value;
    else hidden[field] = value;
  }
  stored.encrypted = await encryptString(JSON.stringify(hidden, dateReplacer), key);
  return stored;
}

function isSealed(stored: SealedRecord): boolean {
  return typeof stored.encrypted === 'string';
}

// ============ Records as earlier versions stored them ============

/**
 * A field earlier versions encrypted on its own, leaving the rest readable
 */
interface EncryptedField {
  /** The field as the app sees it */
  field: string;
  /** Where the ciphertext was stored, when not in the field itself */
  storedAs?: string;
  /** Not a string: encrypted as JSON */
  json?: boolean;
}

const BIOMARKER_KEY: EncryptedField = { field: 'biomarkerKey', storedAs: 'encryptedBiomarkerKey' };

/** How each table's fields were encrypted before records were sealed */
const LEGACY_ENCRYPTED_FIELDS: Record<SealedTable, EncryptedField[]> = {
  labResults: [{ field: 'labName' }, { field: 'notes' }],
  testValues: [{ field: 'rawText' }, BIOMARKER_KEY],
  userNotes: [{ field: 'content' }, BIOMARKER_KEY, { field: 'tags', json: true }],
  userPreferences: [
    { field: 'unitPreferences', json: true },
    { field: 'personalTargets', json: true },
    { field: 'acknowledgedAlerts', json: true },
  ],
};

/** Settings are device configuration: only the API key is encrypted */
const SETTINGS_ENCRYPTED_FIELDS = ['aiApiKey'];

/**
 * Encrypt an object's specified string fields
 */
async function encryptFields<T>(obj: T, fields: string[], key: CryptoKey): Promise<T> {
  const encrypted = { ...obj } as Record<string, unknown>;
  for (const field of fields) {
    const value = encrypted[field];
    if (typeof value === 'string') encrypted[field] = await encryptString(value, key);
  }
  return encrypted as T;
}

/**
 * Decrypt an object's encrypted fields
 */
async function decryptFields<T>(obj: T, fields: EncryptedField[], key: CryptoKey): Promise<T> {
  const decrypted = { ...obj } as Record<string, unknown>;

  for (const spec of fields) {
    const source = spec.storedAs ?? spec.field;
    const value = decrypted[source];
    // Anything else is absent or stored readable
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

/** A stored record as the app sees it, sealed or as an earlier version stored it */
async function unseal<T>(stored: SealedRecord, table: SealedTable, key: CryptoKey): Promise<T> {
  if (!isSealed(stored)) return decryptFields(stored as T, LEGACY_ENCRYPTED_FIELDS[table], key);
  const { encrypted, ...readable } = stored;
  const hidden = JSON.parse(await decryptString(encrypted!, key), dateReviver) as object;
  return { ...hidden, ...readable } as T;
}

/** Fields whose value is undefined are left out, so an update keeps them */
function definedFields<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

/** Newest first; records with the same date by ID, newest first, as a reversed index did */
function newestFirst<T extends { id?: number }>(date: (record: T) => Date) {
  return (a: T, b: T): number =>
    date(b).getTime() - date(a).getTime() || (b.id ?? 0) - (a.id ?? 0);
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

  private table(name: SealedTable): Table<SealedRecord, number> {
    return this.db[name] as unknown as Table<SealedRecord, number>;
  }

  private seal(name: SealedTable, record: object): Promise<SealedRecord> {
    return seal(record, READABLE_FIELDS[name], this.key);
  }

  private unsealAll<T>(name: SealedTable, stored: SealedRecord[]): Promise<T[]> {
    return Promise.all(stored.map((record) => unseal<T>(record, name, this.key)));
  }

  private async add(name: SealedTable, record: object): Promise<number> {
    return (await this.table(name).add(await this.seal(name, record))) as number;
  }

  private async get<T>(name: SealedTable, id: number): Promise<T | undefined> {
    const stored = await this.table(name).get(id);
    return stored && unseal<T>(stored, name, this.key);
  }

  private async where<T>(name: SealedTable, index: string, id: number): Promise<T[]> {
    return this.unsealAll<T>(name, await this.table(name).where(index).equals(id).toArray());
  }

  /**
   * Change some fields of a record, keeping the others; a field set to
   * undefined is removed. Read and written in one transaction: Dexie.waitFor
   * keeps it open across the decryption and encryption, which are not
   * IndexedDB requests.
   *
   * @returns 1 when the record was changed, 0 when it does not exist
   */
  private update(name: SealedTable, id: number, changes: object): Promise<number> {
    const table = this.table(name);
    return this.db.transaction('rw', table, async () => {
      const stored = await table.get(id);
      if (!stored) return 0;
      const current = await Dexie.waitFor(unseal<object>(stored, name, this.key));
      await table.put(await Dexie.waitFor(this.seal(name, { ...current, ...changes, id })));
      return 1;
    });
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
    // Legacy keys are only in records stored readable, before records were sealed
    const isLegacy = (record: { biomarkerKey?: unknown }) =>
      typeof record.biomarkerKey === 'string' && record.biomarkerKey.startsWith(LEGACY_UNKNOWN_PREFIX);
    const legacyValues = await this.db.testValues.filter(isLegacy).toArray();
    if (legacyValues.length === 0) return 0;

    const decrypted = await Promise.all(
      legacyValues.map((tv) => decryptFields(tv, LEGACY_ENCRYPTED_FIELDS.testValues, this.key))
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
      await this.db.userPreferences
        .filter((record) => !isSealed(record as unknown as SealedRecord))
        .modify((record, ref) => {
          ref.value = remapPreferenceMaps(record, mapping);
        });
    });

    return mapping.size;
  }

  /**
   * Seal the records earlier versions stored with only some fields
   * encrypted. Runs after unlock, after legacy keys are reconciled (which
   * reads them unsealed); does nothing when every record is sealed.
   *
   * @returns Number of records sealed
   */
  async encryptReadableFields(): Promise<number> {
    const tables: SealedTable[] = ['labResults', 'testValues', 'userNotes', 'userPreferences'];
    const counts = await Promise.all(tables.map((name) => this.sealUnsealed(name)));
    return counts.reduce((sum, count) => sum + count, 0);
  }

  private async sealUnsealed(name: SealedTable): Promise<number> {
    const table = this.table(name);
    const unsealed = await table.filter((record) => !isSealed(record)).toArray();
    if (unsealed.length === 0) return 0;
    // Sealed up front: a transaction ends at the first await outside IndexedDB
    const sealed = await Promise.all(
      unsealed.map(async (record) => this.seal(name, await unseal<object>(record, name, this.key)))
    );
    await this.db.transaction('rw', table, () => table.bulkPut(sealed));
    return sealed.length;
  }

  // ============ Lab Results ============

  async addLabResult(labResult: Omit<LabResult, 'id'>): Promise<number> {
    return this.add('labResults', labResult);
  }

  async getLabResult(id: number): Promise<LabResult | undefined> {
    return this.get<LabResult>('labResults', id);
  }

  /** Newest first. Dates are encrypted, so not indexed: results are sorted once read. */
  async getAllLabResults(): Promise<LabResult[]> {
    const stored = await this.table('labResults').toArray();
    const results = await this.unsealAll<LabResult>('labResults', stored);
    return results.sort(newestFirst((r) => r.date));
  }

  /** From the start date, inclusive, to the end date, exclusive; oldest first */
  async getLabResultsByDateRange(
    startDate: Date,
    endDate: Date
  ): Promise<LabResult[]> {
    return (await this.getAllLabResults())
      .filter((r) => r.date >= startDate && r.date < endDate)
      .reverse();
  }

  async updateLabResult(
    id: number,
    changes: Partial<LabResult>
  ): Promise<number> {
    return this.update('labResults', id, changes);
  }

  async deleteLabResult(id: number): Promise<void> {
    // Also delete associated test values
    await this.db.testValues.where('labResultId').equals(id).delete();
    await this.db.labResults.delete(id);
  }

  // ============ Test Values ============

  async addTestValue(testValue: Omit<TestValue, 'id'>): Promise<number> {
    return this.add('testValues', testValue);
  }

  async addTestValues(testValues: Omit<TestValue, 'id'>[]): Promise<number[]> {
    const sealed = await Promise.all(testValues.map((tv) => this.seal('testValues', tv)));
    const keys = await this.table('testValues').bulkAdd(sealed, { allKeys: true });
    return keys.filter((k): k is number => k !== undefined);
  }

  async getTestValue(id: number): Promise<TestValue | undefined> {
    return this.get<TestValue>('testValues', id);
  }

  async getTestValuesByLabResult(labResultId: number): Promise<TestValue[]> {
    return this.where<TestValue>('testValues', 'labResultId', labResultId);
  }

  async getAllTestValues(): Promise<TestValue[]> {
    return this.unsealAll<TestValue>('testValues', await this.table('testValues').toArray());
  }

  /** Biomarker keys are encrypted, so not indexed: values are filtered once read */
  async getTestValuesByBiomarker(biomarkerKey: string): Promise<TestValue[]> {
    return (await this.getAllTestValues()).filter((tv) => tv.biomarkerKey === biomarkerKey);
  }

  async updateTestValue(
    id: number,
    changes: Partial<TestValue>
  ): Promise<number> {
    return this.update('testValues', id, changes);
  }

  async deleteTestValue(id: number): Promise<void> {
    await this.db.testValues.delete(id);
  }

  // ============ Settings ============

  async getSettings(): Promise<Settings | undefined> {
    const settings = await this.db.settings.toCollection().first();
    if (!settings) return undefined;
    return decryptFields(
      settings,
      SETTINGS_ENCRYPTED_FIELDS.map((field) => ({ field })),
      this.key
    );
  }

  async saveSettings(settings: Omit<Settings, 'id'>): Promise<number> {
    const encrypted = await encryptFields(settings, SETTINGS_ENCRYPTED_FIELDS, this.key);

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
      encryptFields(changes, SETTINGS_ENCRYPTED_FIELDS, this.key),
      encryptFields({ ...DEFAULT_SETTINGS, ...changes }, SETTINGS_ENCRYPTED_FIELDS, this.key),
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
    const stored = await this.table('userPreferences').toCollection().first();
    return stored && unseal<UserPreferences>(stored, 'userPreferences', this.key);
  }

  /** Save the given fields, keeping the others */
  async savePreferences(
    preferences: Omit<UserPreferences, 'id'>
  ): Promise<number> {
    return this.writePreferences(() => preferences);
  }

  /**
   * Read, change and write the preferences in one transaction, so writers
   * changing different preferences at the same time never undo each other
   */
  async updatePreferences(
    update: (current: UserPreferences | undefined) => Partial<Omit<UserPreferences, 'id'>>
  ): Promise<void> {
    await this.writePreferences(update);
  }

  private writePreferences(
    update: (current: UserPreferences | undefined) => Partial<Omit<UserPreferences, 'id'>>
  ): Promise<number> {
    const table = this.table('userPreferences');
    return this.db.transaction('rw', table, async () => {
      const stored = await table.toCollection().first();
      // Dexie.waitFor keeps the transaction open across the decryption and
      // encryption, which are not IndexedDB requests
      const current =
        stored &&
        (await Dexie.waitFor(unseal<UserPreferences>(stored, 'userPreferences', this.key)));
      const next = { ...(current ?? DEFAULT_PREFERENCES), ...update(current) };
      return (await table.put(await Dexie.waitFor(this.seal('userPreferences', next)))) as number;
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
    return this.add('userNotes', note);
  }

  async getNote(id: number): Promise<UserNote | undefined> {
    return this.get<UserNote>('userNotes', id);
  }

  /** Newest first. Dates are encrypted, so not indexed: notes are sorted once read. */
  async getAllNotes(): Promise<UserNote[]> {
    const stored = await this.table('userNotes').toArray();
    const notes = await this.unsealAll<UserNote>('userNotes', stored);
    return notes.sort(newestFirst((n) => n.createdAt));
  }

  async getNotesByLabResult(labResultId: number): Promise<UserNote[]> {
    return this.where<UserNote>('userNotes', 'labResultId', labResultId);
  }

  /** Biomarker keys are encrypted, so not indexed: notes are filtered once read */
  async getNotesByBiomarker(biomarkerKey: string): Promise<UserNote[]> {
    return (await this.getAllNotes()).filter((note) => note.biomarkerKey === biomarkerKey);
  }

  async getNotesByTestValue(testValueId: number): Promise<UserNote[]> {
    return this.where<UserNote>('userNotes', 'testValueId', testValueId);
  }

  /** Tags are encrypted, so not indexed: notes are filtered once read */
  async getNotesByTag(tag: string): Promise<UserNote[]> {
    return (await this.getAllNotes()).filter((note) => note.tags.includes(tag));
  }

  async updateNote(id: number, changes: Partial<UserNote>): Promise<number> {
    return this.update('userNotes', id, changes);
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
      this.getAllTestValues(),
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
    // Sealed up front: a transaction ends at the first await outside IndexedDB.
    // The links between records stay readable, so they are rewritten sealed.
    const sealAll = <T extends { id?: number }>(name: SealedTable, records: T[]) =>
      Promise.all(
        records.map(async (record) => {
          const { id, ...rest } = record;
          return { id, sealed: await this.seal(name, rest) };
        })
      );
    const [labResults, testValues, userNotes] = await Promise.all([
      sealAll('labResults', data.labResults),
      sealAll('testValues', data.testValues),
      sealAll('userNotes', data.userNotes),
    ]);
    const link = (record: SealedRecord, field: string) => record[field] as number | undefined;

    const preferences = this.table('userPreferences');
    const tables = [this.db.labResults, this.db.testValues, this.db.userNotes, preferences];
    return this.db.transaction('rw', tables, async () => {
      await Promise.all([
        this.db.labResults.clear(),
        this.db.testValues.clear(),
        this.db.userNotes.clear(),
      ]);

      const resultKeys = await this.table('labResults').bulkAdd(
        labResults.map((r) => r.sealed),
        { allKeys: true }
      );
      const resultIds = new Map<number, number>();
      labResults.forEach((r, i) => {
        if (r.id !== undefined) resultIds.set(r.id, resultKeys[i] as number);
      });

      const linkedValues = testValues.filter((tv) =>
        resultIds.has(link(tv.sealed, 'labResultId')!)
      );
      const valueKeys = await this.table('testValues').bulkAdd(
        linkedValues.map((tv) => ({
          ...tv.sealed,
          labResultId: resultIds.get(link(tv.sealed, 'labResultId')!)!,
        })),
        { allKeys: true }
      );
      const valueIds = new Map<number, number>();
      linkedValues.forEach((tv, i) => {
        if (tv.id !== undefined) valueIds.set(tv.id, valueKeys[i] as number);
      });

      const remap = (ids: Map<number, number>, id: number | undefined) =>
        id !== undefined ? ids.get(id) : undefined;
      await this.table('userNotes').bulkAdd(
        userNotes.map(
          (note) =>
            definedFields({
              ...note.sealed,
              labResultId: remap(resultIds, link(note.sealed, 'labResultId')),
              testValueId: remap(valueIds, link(note.sealed, 'testValueId')),
            }) as SealedRecord
        )
      );

      if (data.userPreferences) {
        // As savePreferences: fields the backup lacks keep their current values
        const stored = await preferences.toCollection().first();
        const current =
          stored &&
          (await Dexie.waitFor(unseal<UserPreferences>(stored, 'userPreferences', this.key)));
        const next = { ...current, ...definedFields(data.userPreferences) };
        await preferences.put(await Dexie.waitFor(this.seal('userPreferences', next)));
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
