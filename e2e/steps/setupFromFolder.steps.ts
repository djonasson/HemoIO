/**
 * Steps for setting HemoIO up from a folder copy
 *
 * The folder is the origin-private folder installFolderPicker puts in place
 * of the native picker (folderRestore.steps.ts). It lives outside localStorage
 * and IndexedDB, so it outlasts a browser that forgot HemoIO, as a synced
 * folder does.
 */

import { expect, type Locator, type Page } from '@playwright/test';
import { FOLDER_NAME } from './folderRestore.steps';
import { FOLDER_COPY } from './folderSync.steps';

/** The lock file HemoIO keeps beside the folder copy */
export const LOCK_FILE = 'hemoio-lock.json';

/** The step that restores from a folder copy */
export function folderRecoveryStep(page: Page): Locator {
  return page.getByRole('region', { name: 'Restore from your folder copy' });
}

/** The password field of the recovery step */
export function recoveryPassword(page: Page): Locator {
  return folderRecoveryStep(page).getByLabel('Password you used');
}

/**
 * Given this browser has forgotten HemoIO — localStorage cleared and, unless
 * `keepDatabase`, the database deleted (the app closes its connection when
 * asked) — and the page is loaded again. With `forgetFolder`, the folder
 * handle HemoIO kept is gone too, as on a computer that never ran HemoIO.
 * The folder itself stays.
 */
export async function forgetHemoIO(
  page: Page,
  { keepDatabase, forgetFolder = false }: { keepDatabase: boolean; forgetFolder?: boolean }
): Promise<void> {
  await page.evaluate(
    async ({ keepDatabase, forgetFolder }) => {
      localStorage.clear();
      const remove = (name: string): Promise<void> =>
        new Promise((resolve, reject) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      if (!keepDatabase) await remove('HemoIO');
      if (forgetFolder) await remove('HemoIO-FileSystemHandles');
    },
    { keepDatabase, forgetFolder }
  );
  await page.reload();
}

/** When I choose "I already have a folder copy", on whichever first screen shows */
export async function openFolderRecovery(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'I already have a folder copy' }).click();
  await expect(folderRecoveryStep(page)).toBeVisible();
}

/** And I choose my folder, and enter the password, and choose "Unlock and restore" */
export async function unlockFolderCopy(page: Page, password: string): Promise<void> {
  const step = folderRecoveryStep(page);
  await step.getByRole('button', { name: 'Choose folder' }).click();
  await expect(step.getByText(FOLDER_NAME, { exact: true })).toBeVisible();
  await recoveryPassword(page).fill(password);
  await step.getByRole('button', { name: 'Unlock and restore' }).click();
}

/** When I set HemoIO up from my folder copy with this password, from the first screen */
export async function recoverFromFolder(page: Page, password: string): Promise<void> {
  await openFolderRecovery(page);
  await unlockFolderCopy(page, password);
}

/** The stored password lock, or null */
export function storedCredentials(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('hemoio_credentials'));
}

/** A file in the folder, as text; null when the folder does not hold it */
export function folderFileText(page: Page, fileName: string): Promise<string | null> {
  return page.evaluate(
    async ({ folderName, fileName }) => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName);
      try {
        return await (await dir.getFileHandle(fileName)).getFile().then((file) => file.text());
      } catch {
        return null;
      }
    },
    { folderName: FOLDER_NAME, fileName }
  );
}

/** The folder copy's file, as text */
export function folderCopyText(page: Page): Promise<string> {
  return page.evaluate(
    async ({ folderName, fileName }) => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName);
      return (await (await dir.getFileHandle(fileName)).getFile()).text();
    },
    { folderName: FOLDER_NAME, fileName: FOLDER_COPY }
  );
}

/** Put this text in the folder as the folder copy */
export function putFolderCopy(page: Page, text: string): Promise<void> {
  return page.evaluate(
    async ({ folderName, fileName, text }) => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName, {
        create: true,
      });
      const writable = await (await dir.getFileHandle(fileName, { create: true })).createWritable();
      await writable.write(text);
      await writable.close();
    },
    { folderName: FOLDER_NAME, fileName: FOLDER_COPY, text }
  );
}

/** Given the folder copy is damaged: its lock is intact, but its sealed body is not */
export async function damageFolderCopy(page: Page): Promise<void> {
  const file = JSON.parse(await folderCopyText(page)) as { sealed: string };
  const middle = Math.floor(file.sealed.length / 2);
  const flipped = file.sealed[middle] === 'A' ? 'B' : 'A';
  file.sealed = `${file.sealed.slice(0, middle)}${flipped}${file.sealed.slice(middle + 1)}`;
  await putFolderCopy(page, JSON.stringify(file));
}
