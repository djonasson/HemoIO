import { describe, it, expect } from 'vitest';
import { clearLocalHemoIOStorage, clearStoredData, countStoredRows } from './storedRows';
import { openTestDb } from './testDb';

const at = new Date('2024-01-15T10:00:00Z');
const settings = { storageProvider: 'local' as const, aiProvider: 'openai' as const, language: 'en' };

describe('storedRows', () => {
  it('counts rows without a key', async () => {
    const { db, database } = await openTestDb();
    await db.addLabResultsWithValues([
      {
        labResult: { date: at, labName: 'Lab', createdAt: at, updatedAt: at },
        testValues: [{ biomarkerKey: '2345-7', value: 95, unit: 'mg/dL', createdAt: at, updatedAt: at }],
      },
    ]);
    await database.setAside.add({ table: 'labResults', row: { id: 900, encrypted: 'x' }, savedToFile: 0 });
    // Settings hold no lab data: not counted
    await database.settings.add(settings);

    expect(await countStoredRows(database)).toBe(3);
  });

  it('counts nothing in an empty database', async () => {
    const { database } = await openTestDb();

    expect(await countStoredRows(database)).toBe(0);
  });

  it('clear empties every table', async () => {
    const { db, database } = await openTestDb();
    await db.addLabResultsWithValues([
      {
        labResult: { date: at, labName: 'Lab', createdAt: at, updatedAt: at },
        testValues: [{ biomarkerKey: '2345-7', value: 95, unit: 'mg/dL', createdAt: at, updatedAt: at }],
      },
    ]);
    // Sealed rows as stored: readable IDs and links, the rest ciphertext
    await database.table('userNotes').add({ id: 7, labResultId: 1, encrypted: 'x' });
    await database.table('userPreferences').add({ id: 1, encrypted: 'x' });
    await database.settings.add(settings);
    await database.setAside.add({ table: 'labResults', row: { id: 900 }, savedToFile: 0 });

    await clearStoredData(database);

    const counts = await Promise.all(database.tables.map((table) => table.count()));
    expect(database.tables.map((table) => table.name).sort()).toEqual(
      ['labResults', 'setAside', 'settings', 'testValues', 'userNotes', 'userPreferences'].sort()
    );
    expect(counts).toEqual(database.tables.map(() => 0));
  });

  it('clearLocalHemoIOStorage removes only hemoio_ keys and the handle store', async () => {
    localStorage.setItem('hemoio_credentials', '{"version":2}');
    localStorage.setItem('hemoio_folder_sync_state', 'sealed');
    localStorage.setItem('hemoio_storage_provider', 'filesystem');
    localStorage.setItem('mantine-color-scheme-value', 'dark');
    localStorage.setItem('hemoio', 'not a HemoIO key: no underscore');
    await putInHandleStore('hemoio_filesystem_handle', { name: 'Health' });

    await clearLocalHemoIOStorage();

    expect(Object.keys(localStorage).sort()).toEqual(['hemoio', 'mantine-color-scheme-value']);
    expect(await handleStoreKeys()).toEqual([]);
    localStorage.clear();
  });
});

/** FileSystemStorageProvider's handle store, as it keeps it */
function openHandleStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('HemoIO-FileSystemHandles', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('handles');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putInHandleStore(key: string, value: unknown): Promise<void> {
  const database = await openHandleStore();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('handles', 'readwrite');
    transaction.objectStore('handles').put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function handleStoreKeys(): Promise<IDBValidKey[]> {
  const database = await openHandleStore();
  const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
    const request = database.transaction('handles', 'readonly').objectStore('handles').getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return keys;
}
