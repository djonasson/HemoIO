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

import Dexie, { type Table, type Transaction } from 'dexie';
import { db, HemoIODatabase, MIGRATE_RECORDS } from './index';
import { SaveError, toSaveError } from './saveError';
import { encryptString, decryptString } from '@data/encryption';
import {
  legacyUnknownKeyMapping,
  migrateNoteRecord,
  migratePreferenceMaps,
  migrateTestValueRecord,
  reconcileTestValueKey,
  refileMisfiledPreferences,
  refileMisfiledValue,
  remapBiomarkerKey,
  remapPreferenceMaps,
} from '@data/migrations/biomarkerKeyMigration';
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

// JSON holds neither dates nor NaN and ±Infinity, which IndexedDB stored as
// they were: they are written as { $date: milliseconds } (null for an
// invalid date, which a restored backup can hold) and { $number: 'NaN' }
function replacer(this: Record<string, unknown>, field: string, value: unknown): unknown {
  const raw = this[field];
  if (raw instanceof Date) {
    const time = raw.getTime();
    return { $date: Number.isNaN(time) ? null : time };
  }
  if (typeof raw === 'number' && !Number.isFinite(raw)) return { $number: String(raw) };
  return value;
}

function reviver(_field: string, value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Object.keys(value).length !== 1) {
    return value;
  }
  if ('$date' in value) return new Date((value as { $date: number | null }).$date ?? NaN);
  if ('$number' in value) return Number((value as { $number: string }).$number);
  return value;
}

/**
 * Sealed plaintext is padded to a multiple of this many bytes: ciphertext is
 * as long as its plaintext, so unpadded lengths would tell records apart
 * (a glucose value from one with a long unknown name)
 */
const PADDING_BLOCK = 256;

function padded(json: string): string {
  const bytes = new TextEncoder().encode(json).length;
  // JSON.parse ignores the trailing spaces
  return json + ' '.repeat(Math.ceil((bytes + 1) / PADDING_BLOCK) * PADDING_BLOCK - bytes);
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
  stored.encrypted = await encryptString(padded(JSON.stringify(hidden, replacer)), key);
  return stored;
}

// ============ Records as earlier versions stored them ============

/**
 * The fields earlier versions encrypted one by one, leaving the rest
 * readable. Records in this form are still read, and are sealed after unlock.
 */
export const LEGACY_ENCRYPTED_FIELDS: Record<SealedTable, readonly string[]> = {
  labResults: ['labName', 'notes'],
  testValues: ['rawText'],
  userNotes: ['content'],
  userPreferences: [],
};

/** Settings are device configuration: only the API key is encrypted */
const SETTINGS_ENCRYPTED_FIELDS = ['aiApiKey'];

/**
 * Encrypt an object's specified string fields
 */
async function encryptFields<T>(obj: T, fields: readonly string[], key: CryptoKey): Promise<T> {
  const encrypted = { ...obj } as Record<string, unknown>;
  for (const field of fields) {
    const value = encrypted[field];
    if (typeof value === 'string') encrypted[field] = await encryptString(value, key);
  }
  return encrypted as T;
}

/**
 * Decrypt an object's specified string fields
 */
async function decryptFields<T>(obj: T, fields: readonly string[], key: CryptoKey): Promise<T> {
  const decrypted = { ...obj } as Record<string, unknown>;
  for (const field of fields) {
    const value = decrypted[field];
    if (typeof value !== 'string') continue;
    try {
      decrypted[field] = await decryptString(value, key);
    } catch {
      // If decryption fails, leave the field as-is (might be unencrypted data)
      console.warn(`Failed to decrypt field ${field}, leaving as-is`);
    }
  }
  return decrypted as T;
}

/** Records as released versions stored them, which referenced biomarkers by dictionary position */
const LEGACY_RECORD_MIGRATIONS: Record<SealedTable, (record: object) => object> = {
  labResults: (record) => record,
  testValues: migrateTestValueRecord,
  userNotes: migrateNoteRecord,
  userPreferences: migratePreferenceMaps,
};

/**
 * Fields as an earlier version stored them, decrypted and given biomarker
 * keys: a whole record, or only the fields it wrote beside a sealed one
 */
async function readLegacy(
  fields: SealedRecord,
  table: SealedTable,
  key: CryptoKey,
  wholeRecord: boolean
): Promise<Record<string, unknown>> {
  const decrypted = await decryptFields(fields, LEGACY_ENCRYPTED_FIELDS[table], key);
  return wholeRecord || 'biomarkerId' in decrypted
    ? (LEGACY_RECORD_MIGRATIONS[table](decrypted) as Record<string, unknown>)
    : decrypted;
}

/**
 * A stored record as the app sees it: sealed, as an earlier version stored
 * it, or sealed with fields an older version wrote beside it since, which
 * are newer and win
 */
async function unseal<T>(stored: SealedRecord, table: SealedTable, key: CryptoKey): Promise<T> {
  if (typeof stored.encrypted !== 'string') return (await readLegacy(stored, table, key, true)) as T;
  const readable: SealedRecord = {};
  const beside: SealedRecord = {};
  for (const [field, value] of Object.entries(stored)) {
    if (field === 'encrypted' || value === undefined) continue;
    if (READABLE_FIELDS[table].includes(field)) readable[field] = value;
    else beside[field] = value;
  }
  const hidden = JSON.parse(await decryptString(stored.encrypted, key), reviver) as object;
  const newer = Object.keys(beside).length > 0 ? await readLegacy(beside, table, key, false) : {};
  return { ...hidden, ...newer, ...readable } as T;
}

/** Whether a record has a date it can be sorted by (the date indexes skipped others) */
function hasValidDate(date: unknown): boolean {
  return date instanceof Date && !Number.isNaN(date.getTime());
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
 * How long a write may take, from the call to its commit, before it is
 * cancelled. Generous: a write waits for the database to open, and a large
 * restore commits many records.
 */
export const WRITE_TIMEOUT_MS = 30_000;

export interface EncryptedDbOptions {
  /** See WRITE_TIMEOUT_MS */
  writeTimeoutMs?: number;
}

/** A lab result and its values, stored together */
export interface LabResultWithValues {
  labResult: Omit<LabResult, 'id'>;
  testValues: Array<Omit<TestValue, 'id' | 'labResultId'>>;
}

/**
 * Encrypted database operations wrapper
 */
export class EncryptedDb {
  private key: CryptoKey;
  private db: HemoIODatabase;
  private writeTimeoutMs: number;

  constructor(
    encryptionKey: CryptoKey,
    database: HemoIODatabase = db,
    { writeTimeoutMs = WRITE_TIMEOUT_MS }: EncryptedDbOptions = {}
  ) {
    this.key = encryptionKey;
    this.db = database;
    this.writeTimeoutMs = writeTimeoutMs;
  }

  /**
   * Every write: one transaction, so it is kept whole or not at all, and
   * resolved only once committed (Dexie waits for the complete event, so an
   * abort at commit, where browsers often report a full storage, rejects).
   * Failures become a SaveError.
   *
   * A write still unsettled at the deadline is stopped so that what it
   * reports stays true: one not started yet cancels itself when it starts,
   * one under way is aborted. One already committing cannot be aborted, and
   * is waited for instead, as it reports its own outcome.
   */
  private write<T>(tables: Table | Table[], body: () => Promise<T>): Promise<T> {
    let transaction: Transaction | undefined;
    let cancelled = false;
    const done: Promise<T> = this.db.transaction('rw', ([] as Table[]).concat(tables), (tx) => {
      if (cancelled) throw new SaveError('timeout');
      transaction = tx;
      return body();
    });
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!transaction) {
          cancelled = true;
          reject(new SaveError('timeout'));
          return;
        }
        // Finished already: its outcome is on its way
        if (!transaction.active) return;
        try {
          transaction.abort();
        } catch {
          // Committing already: its outcome is on its way
          return;
        }
        // Aborted, so it never commits. Not left to the transaction to
        // report: the part of the write that hangs may never return.
        reject(new SaveError('timeout'));
      }, this.writeTimeoutMs);
      done.then(
        (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        (err: unknown) => {
          clearTimeout(timer);
          // After a timeout this has no effect: the write was rejected already
          reject(toSaveError(err));
        }
      );
    });
  }

  private table(name: SealedTable): Table<SealedRecord, number> {
    return this.db[name] as unknown as Table<SealedRecord, number>;
  }

  private seal(name: SealedTable, record: object): Promise<SealedRecord> {
    return seal(record, READABLE_FIELDS[name], this.key);
  }

  /**
   * Records that cannot be decrypted (sealed under another key, or damaged)
   * are skipped, so they do not hide the others
   */
  private async unsealAll<T>(name: SealedTable, stored: SealedRecord[]): Promise<T[]> {
    const results = await Promise.allSettled(stored.map((record) => unseal<T>(record, name, this.key)));
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed > 0) {
      // Not logged with the errors or records, which could name stored data
      console.warn(
        failed === 1
          ? 'Skipped a stored record that could not be decrypted'
          : `Skipped ${failed} stored records that could not be decrypted`
      );
    }
    return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  }

  /** A record, or undefined when it cannot be decrypted */
  private async unsealOne<T>(name: SealedTable, stored: SealedRecord | undefined): Promise<T | undefined> {
    return stored && (await this.unsealAll<T>(name, [stored]))[0];
  }

  private async add(name: SealedTable, record: object): Promise<number> {
    // Sealed first: a transaction ends at the first await outside IndexedDB
    const sealed = await this.seal(name, record);
    const table = this.table(name);
    return this.write(table, async () => (await table.add(sealed)) as number);
  }

  private delete(name: SealedTable, id: number): Promise<void> {
    const table = this.table(name);
    return this.write(table, () => table.delete(id));
  }

  private async get<T>(name: SealedTable, id: number): Promise<T | undefined> {
    return this.unsealOne<T>(name, await this.table(name).get(id));
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
    return this.write(table, async () => {
      const stored = await table.get(id);
      if (!stored) return 0;
      const current = await Dexie.waitFor(unseal<object>(stored, name, this.key));
      await table.put(await Dexie.waitFor(this.seal(name, { ...current, ...changes, id })));
      return 1;
    });
  }

  // ============ Migrations needing the encryption key ============

  /**
   * Bring the records earlier versions stored up to date: seal them, give
   * unknown biomarkers stored before biomarker keys existed
   * ("unknown:legacy-<hash>") the key their extracted name gets today, and
   * refile values stored under the wrong biomarker (urea as blood urea
   * nitrogen). Needs the encryption key, so it runs after unlock rather than
   * in the schema upgrade, which only marks that it is needed: it runs once
   * per upgraded database, and never on a new one.
   *
   * One transaction, kept open across the decryption and encryption by
   * Dexie.waitFor, so no edit in the meantime (in another tab, say) is
   * overwritten, and a second tab finds nothing left to do. Records that
   * cannot be decrypted are left as they are.
   *
   * @returns Number of records migrated
   */
  async migrateLegacyRecords(): Promise<number> {
    const names = Object.keys(READABLE_FIELDS) as SealedTable[];
    const tables = names.map((name) => this.table(name));
    return this.db.transaction('rw', [...tables, this.db.meta], async () => {
      if (!(await this.db.meta.get(MIGRATE_RECORDS))) return 0;
      const stored = await Promise.all(tables.map((table) => table.toArray()));
      const sealed = await Dexie.waitFor(this.migrated(names, stored));
      await Promise.all(tables.map((table, i) => table.bulkPut(sealed[i])));
      await this.db.meta.delete(MIGRATE_RECORDS);
      return sealed.reduce((sum, records) => sum + records.length, 0);
    });
  }

  /** Every record of each table, migrated and sealed */
  private async migrated(names: SealedTable[], stored: SealedRecord[][]): Promise<SealedRecord[][]> {
    const [labResults, testValues, userNotes, userPreferences] = await Promise.all(
      names.map((name, i) => this.unsealAll<Record<string, unknown>>(name, stored[i]))
    );
    const values = testValues as unknown as TestValue[];
    const mapping = legacyUnknownKeyMapping(values);
    const migrated: Record<SealedTable, object[]> = {
      labResults,
      // Each value by its own name: two names can share a legacy key
      testValues: values.map((value) => refileMisfiledValue(reconcileTestValueKey(value))),
      userNotes: userNotes.map((note) => remapBiomarkerKey(note, mapping)),
      userPreferences: (userPreferences as unknown as UserPreferences[]).map((prefs) =>
        refileMisfiledPreferences(remapPreferenceMaps(prefs, mapping))
      ),
    };
    return Promise.all(
      names.map((name) => Promise.all(migrated[name].map((record) => this.seal(name, record))))
    );
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
    return results.filter((r) => hasValidDate(r.date)).sort(newestFirst((r) => r.date));
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

  /** The lab result and its values, together */
  async deleteLabResult(id: number): Promise<void> {
    await this.write([this.db.labResults, this.db.testValues], () =>
      Promise.all([
        this.db.testValues.where('labResultId').equals(id).delete(),
        this.db.labResults.delete(id),
      ])
    );
  }

  /**
   * Store lab results with their values, all of them or none: an import
   * kept in part could not be retried without duplicating what was kept
   *
   * @returns Each lab result's new ID, in order
   */
  async addLabResultsWithValues(entries: LabResultWithValues[]): Promise<number[]> {
    // Sealed up front: a transaction ends at the first await outside
    // IndexedDB. The link to the result is readable, so it is set sealed.
    const sealed = await Promise.all(
      entries.map(async ({ labResult, testValues }) => ({
        labResult: await this.seal('labResults', labResult),
        testValues: await Promise.all(testValues.map((tv) => this.seal('testValues', tv))),
      }))
    );
    const results = this.table('labResults');
    const values = this.table('testValues');
    return this.write([results, values], async () => {
      const ids = (await results.bulkAdd(
        sealed.map((entry) => entry.labResult),
        { allKeys: true }
      )) as number[];
      await values.bulkAdd(
        sealed.flatMap((entry, i) => entry.testValues.map((tv) => ({ ...tv, labResultId: ids[i] })))
      );
      return ids;
    });
  }

  // ============ Test Values ============

  async addTestValue(testValue: Omit<TestValue, 'id'>): Promise<number> {
    return this.add('testValues', testValue);
  }

  async addTestValues(testValues: Omit<TestValue, 'id'>[]): Promise<number[]> {
    const sealed = await Promise.all(testValues.map((tv) => this.seal('testValues', tv)));
    const table = this.table('testValues');
    const keys = await this.write(table, () => table.bulkAdd(sealed, { allKeys: true }));
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

  // ============ Settings ============

  async getSettings(): Promise<Settings | undefined> {
    const settings = await this.db.settings.toCollection().first();
    if (!settings) return undefined;
    return decryptFields(settings, SETTINGS_ENCRYPTED_FIELDS, this.key);
  }

  async saveSettings(settings: Omit<Settings, 'id'>): Promise<number> {
    const encrypted = await encryptFields(settings, SETTINGS_ENCRYPTED_FIELDS, this.key);

    return this.write(this.db.settings, async () => {
      const existing = await this.db.settings.toCollection().first();
      if (existing?.id !== undefined) {
        await this.db.settings.update(existing.id, encrypted);
        return existing.id;
      }
      return (await this.db.settings.add(encrypted as Settings))!;
    });
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
    await this.write(this.db.settings, async () => {
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
    return this.unsealOne<UserPreferences>('userPreferences', stored);
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
    return this.write(this.table('userPreferences'), () => this.putPreferences(update));
  }

  /** Read, change and write the preferences, inside the caller's transaction */
  private async putPreferences(
    update: (current: UserPreferences | undefined) => Partial<Omit<UserPreferences, 'id'>>
  ): Promise<number> {
    const table = this.table('userPreferences');
    const stored = await table.toCollection().first();
    // Dexie.waitFor keeps the transaction open across the decryption and
    // encryption, which are not IndexedDB requests
    const current = await Dexie.waitFor(this.unsealOne<UserPreferences>('userPreferences', stored));
    // Under the stored record's ID, so unreadable preferences are replaced
    const next = { ...(current ?? DEFAULT_PREFERENCES), ...update(current), id: stored?.id };
    return (await table.put(await Dexie.waitFor(this.seal('userPreferences', next)))) as number;
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
    return notes.filter((n) => hasValidDate(n.createdAt)).sort(newestFirst((n) => n.createdAt));
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
    await this.delete('userNotes', id);
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
        // Stored under new IDs: the given ID is left out
        records.map(async (record) => ({
          record,
          sealed: await this.seal(name, { ...record, id: undefined }),
        }))
      );
    const [labResults, testValues, userNotes] = await Promise.all([
      sealAll('labResults', data.labResults),
      sealAll('testValues', data.testValues),
      sealAll('userNotes', data.userNotes),
    ]);
    /** Each given record's ID → the ID it was stored under */
    const idMap = (added: Array<{ record: { id?: number } }>, keys: unknown[]) =>
      new Map(
        added.flatMap(({ record }, i) =>
          record.id !== undefined ? [[record.id, keys[i] as number] as const] : []
        )
      );

    const tables = [this.db.labResults, this.db.testValues, this.db.userNotes, this.db.userPreferences];
    return this.write(tables, async () => {
      await Promise.all([
        this.db.labResults.clear(),
        this.db.testValues.clear(),
        this.db.userNotes.clear(),
      ]);

      const resultIds = idMap(
        labResults,
        await this.table('labResults').bulkAdd(
          labResults.map((r) => r.sealed),
          { allKeys: true }
        )
      );

      const linkedValues = testValues.filter((tv) => resultIds.has(tv.record.labResultId));
      const valueIds = idMap(
        linkedValues,
        await this.table('testValues').bulkAdd(
          linkedValues.map((tv) => ({
            ...tv.sealed,
            labResultId: resultIds.get(tv.record.labResultId)!,
          })),
          { allKeys: true }
        )
      );

      const remap = (ids: Map<number, number>, id: number | undefined) =>
        id !== undefined ? ids.get(id) : undefined;
      await this.table('userNotes').bulkAdd(
        userNotes.map(
          ({ record, sealed }) =>
            definedFields({
              ...sealed,
              labResultId: remap(resultIds, record.labResultId),
              testValueId: remap(valueIds, record.testValueId),
            }) as SealedRecord
        )
      );

      if (data.userPreferences) {
        // As savePreferences: fields the backup lacks keep their current values
        const preferences = definedFields(data.userPreferences);
        await this.putPreferences(() => preferences);
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
