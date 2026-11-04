/**
 * Test helpers: real databases on fake-indexeddb, each closed and deleted
 * after its test
 */

import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { HemoIODatabase } from './index';
import { EncryptedDb } from './encryptedDb';

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
