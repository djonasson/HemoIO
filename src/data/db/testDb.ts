/**
 * Test helpers: real databases on fake-indexeddb, each closed and deleted
 * after its test
 */

import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { encryptString } from '@data/encryption';
import { HemoIODatabase, MIGRATE_RECORDS } from './index';
import { EncryptedDb, LEGACY_ENCRYPTED_FIELDS } from './encryptedDb';

export interface TestDb {
  db: EncryptedDb;
  database: HemoIODatabase;
  key: CryptoKey;
}

// Dexie takes IndexedDB from the global when it is first imported, which a
// test may do before this module installs fake-indexeddb: set it directly
Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;

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

let count = 0;

/** A new, empty database and an EncryptedDb on it, with a random key unless one is given */
export async function openTestDb(key?: CryptoKey): Promise<TestDb> {
  const database = new HemoIODatabase(`test-db-${++count}`);
  opened.push(database);
  const dataKey =
    key ??
    (await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]));
  return { db: new EncryptedDb(dataKey, database), database, key: dataKey };
}

/**
 * Store a record as earlier versions did: only the fields they encrypted are
 * encrypted, the rest is readable. Marks the database as upgraded, as the
 * schema upgrade does for a database an earlier version wrote.
 *
 * @returns The record's ID
 */
export async function storeAsEarlierVersion(
  { database, key }: TestDb,
  table: keyof typeof LEGACY_ENCRYPTED_FIELDS,
  record: object
): Promise<number> {
  const stored = { ...record } as Record<string, unknown>;
  for (const field of LEGACY_ENCRYPTED_FIELDS[table]) {
    const value = stored[field];
    if (typeof value === 'string') stored[field] = await encryptString(value, key);
  }
  await database.meta.put({ key: MIGRATE_RECORDS });
  return (await database.table(table).add(stored)) as number;
}
