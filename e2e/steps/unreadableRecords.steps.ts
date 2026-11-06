/**
 * Steps for records HemoIO cannot open with the session key
 *
 * Such records are written straight into IndexedDB: random bytes in place
 * of the ciphertext, as a record sealed under another key or damaged would
 * look, with readable IDs and links as HemoIO stores them.
 */

import { expect, type Download, type Locator, type Page } from '@playwright/test';
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
  await writeUnreadableRecords(page, records);
  await page.reload();
  await unlockApp(page);
}

/**
 * The same records written while the app stays unlocked, as another tab
 * under another key would: no unlock has set them aside, so the next write
 * that meets them must
 */
export async function writeUnreadableRecords(page: Page, records: UnreadableRecords): Promise<void> {
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

const CREDENTIALS_STORAGE_KEY = 'hemoio_credentials';

/** The stored credentials, which unlock the key the current records are sealed under */
export async function saveCredentials(page: Page): Promise<string> {
  const credentials = await page.evaluate((name) => localStorage.getItem(name), CREDENTIALS_STORAGE_KEY);
  if (!credentials) throw new Error('No stored credentials');
  return credentials;
}

/** Given the credentials are lost: the next load offers setup, with a new key */
export async function forgetCredentials(page: Page): Promise<void> {
  await page.evaluate((name) => localStorage.removeItem(name), CREDENTIALS_STORAGE_KEY);
}

/** When HemoIO gets the key the records were saved with: those credentials are back */
export async function restoreCredentials(page: Page, credentials: string): Promise<void> {
  await page.evaluate(
    ([name, value]) => localStorage.setItem(name, value),
    [CREDENTIALS_STORAGE_KEY, credentials] as const
  );
}

/** The notice that says how many stored records HemoIO cannot open */
export function setAsideBanner(page: Page): Locator {
  return page.getByRole('region', { name: 'Unreadable records' });
}

/** When I download the unreadable records as a sealed file */
export async function downloadSealedFile(page: Page): Promise<Download> {
  const downloadPromise = page.waitForEvent('download');
  await setAsideBanner(page).getByRole('button', { name: 'Download sealed file' }).click();
  return downloadPromise;
}

/** When I choose to delete the unreadable records: the confirmation it opens */
export async function openDeleteConfirmation(page: Page): Promise<Locator> {
  await setAsideBanner(page).getByRole('button', { name: 'Delete…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete unreadable records?' });
  await expect(dialog).toBeVisible();
  return dialog;
}
