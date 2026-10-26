/**
 * Steps for checking what the app stores at rest
 */

import type { Page } from '@playwright/test';

/** Every IndexedDB record, by object store */
type StoredRows = Record<string, Record<string, unknown>[]>;

/**
 * When someone reads the app's stored data without my password: every
 * IndexedDB record, by object store
 */
export async function readStoredRows(page: Page): Promise<StoredRows> {
  return page.evaluate(
    () =>
      new Promise<StoredRows>((resolve, reject) => {
        const open = indexedDB.open('HemoIO');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const names = [...database.objectStoreNames];
          const transaction = database.transaction(names, 'readonly');
          const rows: StoredRows = {};
          for (const name of names) {
            const request = transaction.objectStore(name).getAll();
            request.onsuccess = () => (rows[name] = request.result);
          }
          transaction.oncomplete = () => {
            database.close();
            resolve(rows);
          };
          transaction.onerror = () => reject(transaction.error);
        };
      })
  );
}

/** The stored data as one string, to search for anything readable */
export async function readStoredData(page: Page): Promise<string> {
  return JSON.stringify(await readStoredRows(page));
}

/** The field names stored in each object store */
export async function storedFieldNames(page: Page): Promise<Record<string, string[]>> {
  const rows = await readStoredRows(page);
  return Object.fromEntries(
    Object.entries(rows).map(([name, records]) => [
      name,
      [...new Set(records.flatMap((record) => Object.keys(record)))].sort(),
    ])
  );
}

/**
 * Given lab data and preferences were stored readable by an earlier version:
 * add a glucose value to a lab result, and replace the preferences, in the
 * form earlier versions stored them
 */
export async function storeReadableAsEarlierVersion(
  page: Page,
  glucose: { labResultId: number; value: number }
): Promise<void> {
  await page.evaluate(
    (glucose) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('HemoIO');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const transaction = database.transaction(['testValues', 'userPreferences'], 'readwrite');
          const at = new Date('2024-02-20T14:30:00.000Z');
          transaction.objectStore('testValues').add({
            labResultId: glucose.labResultId,
            biomarkerKey: 'glucose',
            value: glucose.value,
            unit: 'mg/dL',
            createdAt: at,
            updatedAt: at,
          });
          const preferences = transaction.objectStore('userPreferences');
          preferences.clear();
          preferences.add({
            unitPreferences: {},
            personalTargets: { glucose: { low: 70, high: 90 } },
            theme: 'system',
            dateFormat: 'MM/DD/YYYY',
          });
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    glucose
  );
}
