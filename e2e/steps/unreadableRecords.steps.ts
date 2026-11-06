/**
 * Steps for records HemoIO cannot open with the session key
 *
 * Such records are written straight into IndexedDB: random bytes in place
 * of the ciphertext, as a record sealed under another key or damaged would
 * look, with readable IDs and links as HemoIO stores them.
 */

import type { Page } from '@playwright/test';
import { unlockApp } from './app.steps';

/** IDs well above those the app assigns in a test, so they never collide */
const FIRST_UNREADABLE_ID = 1000;

export interface UnreadableRecords {
  labResults: number;
  testValues: number;
  /** Replace the stored preferences with an unreadable row */
  preferences?: boolean;
}

/**
 * Given my browser holds records HemoIO cannot open with my key — written
 * after setup, then the app is reloaded and unlocked, which sets them aside
 */
export async function seedUnreadableRecords(page: Page, records: UnreadableRecords): Promise<void> {
  await page.evaluate(
    ({ labResults, testValues, preferences, firstId }) =>
      new Promise<void>((resolve, reject) => {
        const randomCiphertext = (): string =>
          btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(64))));

        const open = indexedDB.open('HemoIO');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const transaction = database.transaction(
            ['labResults', 'testValues', 'userPreferences'],
            'readwrite'
          );
          for (let i = 0; i < labResults; i++) {
            transaction.objectStore('labResults').put({ id: firstId + i, encrypted: randomCiphertext() });
          }
          for (let i = 0; i < testValues; i++) {
            transaction.objectStore('testValues').put({
              id: firstId + i,
              labResultId: firstId,
              encrypted: randomCiphertext(),
            });
          }
          if (preferences) {
            const store = transaction.objectStore('userPreferences');
            store.clear();
            store.put({ id: firstId, encrypted: randomCiphertext() });
          }
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    { ...records, preferences: records.preferences ?? false, firstId: FIRST_UNREADABLE_ID }
  );
  await page.reload();
  await unlockApp(page);
}

/** The rows kept aside, as stored: the table each came from */
export async function setAsideTables(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('HemoIO');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const request = database.transaction('setAside', 'readonly').objectStore('setAside').getAll();
          request.onsuccess = () => {
            database.close();
            resolve((request.result as Array<{ table: string }>).map((row) => row.table));
          };
          request.onerror = () => {
            database.close();
            reject(request.error);
          };
        };
      })
  );
}

/** Then the records HemoIO cannot open should be kept aside: how many there are */
export async function setAsideRowCount(page: Page): Promise<number> {
  return (await setAsideTables(page)).length;
}

/** Given my stored AI API key cannot be decrypted with my key */
export async function storeUndecryptableApiKey(page: Page): Promise<void> {
  await page.evaluate(() =>
    localStorage.setItem(
      'hemoio_ai_api_key_encrypted',
      btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(64))))
    )
  );
}
