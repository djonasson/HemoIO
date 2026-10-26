/**
 * Steps for checking what the app stores at rest
 */

import type { Page } from '@playwright/test';

/**
 * When someone reads the app's stored data without my password: every
 * IndexedDB record, as JSON
 */
export async function readStoredData(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('HemoIO');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const names = [...database.objectStoreNames];
          const transaction = database.transaction(names, 'readonly');
          const rows: unknown[] = [];
          for (const name of names) {
            const request = transaction.objectStore(name).getAll();
            request.onsuccess = () => rows.push(...request.result);
          }
          transaction.oncomplete = () => {
            database.close();
            resolve(JSON.stringify(rows));
          };
          transaction.onerror = () => reject(transaction.error);
        };
      })
  );
}

/**
 * Given biomarker keys, preferences and note tags were stored readable by an
 * earlier version: rewrite the stored glucose value, the note and the
 * preferences the way earlier versions stored them
 */
export async function storeReadableAsEarlierVersion(
  page: Page,
  glucoseValue: number,
  tags: string[]
): Promise<void> {
  await page.evaluate(
    ({ glucoseValue, tags }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('HemoIO');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const transaction = database.transaction(
            ['testValues', 'userNotes', 'userPreferences'],
            'readwrite'
          );
          const rewrite = (name: string, change: (row: Record<string, unknown>) => boolean) => {
            const store = transaction.objectStore(name);
            const request = store.getAll();
            request.onsuccess = () => {
              for (const row of request.result) if (change(row)) store.put(row);
            };
          };
          rewrite('testValues', (row) => {
            if (row.value !== glucoseValue) return false;
            row.biomarkerKey = 'glucose';
            delete row.encryptedBiomarkerKey;
            return true;
          });
          rewrite('userNotes', (row) => {
            row.biomarkerKey = 'glucose';
            delete row.encryptedBiomarkerKey;
            row.tags = tags;
            return true;
          });
          rewrite('userPreferences', (row) => {
            row.personalTargets = { glucose: { low: 70, high: 90 } };
            return true;
          });
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    { glucoseValue, tags }
  );
}
