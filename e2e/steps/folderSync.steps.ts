/**
 * Steps for folder storage (the File System Access API)
 *
 * A real folder picker is a native dialog Playwright cannot drive, so the
 * picker is replaced with a folder in the origin private file system (OPFS):
 * a real directory handle that reads and writes real files. Firefox has OPFS
 * but no permission methods, which OPFS does not need, so they report granted.
 */

import { expect, type Locator, type Page } from '@playwright/test';
import { openSettingsTab } from './app.steps';

export const TEST_FOLDER_NAME = 'Lab Folder';
/** Where the picker looks for the folder a test chooses next */
const NEXT_FOLDER_KEY = 'e2e-next-folder';
/** Mirrors FOLDER_DATA_FILE_NAME in FileSystemStorageProvider */
export const FOLDER_COPY = 'hemoio-data.encrypted';
/** Mirrors FOLDER_PREVIOUS_FILE_NAME in FileSystemStorageProvider */
export const PREVIOUS_FOLDER_COPY = 'hemoio-data.previous.encrypted';

/**
 * Must be called before the first navigation: the picker is replaced in every
 * page the test opens, reloads included.
 */
export async function useTestFolder(page: Page): Promise<void> {
  await page.addInitScript(
    ({ defaultName, nextFolderKey }) => {
    const folder = async (): Promise<FileSystemDirectoryHandle> =>
      (await navigator.storage.getDirectory()).getDirectoryHandle(
        sessionStorage.getItem(nextFolderKey) ?? defaultName,
        { create: true }
      );
    Object.defineProperty(window, 'showDirectoryPicker', { value: folder, configurable: true });

    const handle = FileSystemHandle.prototype as unknown as Record<string, unknown>;
    if (!('queryPermission' in handle)) {
      handle.queryPermission = async () => 'granted';
      handle.requestPermission = async () => 'granted';
    }
    },
    { defaultName: TEST_FOLDER_NAME, nextFolderKey: NEXT_FOLDER_KEY }
  );
}

/** The test folder, read and written from the page */
export class TestFolder {
  constructor(
    private readonly page: Page,
    readonly name: string = TEST_FOLDER_NAME
  ) {}

  /** A file's bytes as base64, or null when the folder does not hold it */
  read(fileName: string): Promise<string | null> {
    return this.page.evaluate(
      async ({ folderName, fileName }) => {
        const root = await navigator.storage.getDirectory();
        try {
          const folder = await root.getDirectoryHandle(folderName);
          const file = await (await folder.getFileHandle(fileName)).getFile();
          const bytes = new Uint8Array(await file.arrayBuffer());
          return btoa(String.fromCharCode(...bytes));
        } catch {
          return null;
        }
      },
      { folderName: this.name, fileName }
    );
  }

  /** Put a file there, as another app or another password would have */
  write(fileName: string, text: string): Promise<void> {
    return this.page.evaluate(
      async ({ folderName, fileName, text }) => {
        const root = await navigator.storage.getDirectory();
        const folder = await root.getDirectoryHandle(folderName, { create: true });
        const writable = await (await folder.getFileHandle(fileName, { create: true })).createWritable();
        await writable.write(text);
        await writable.close();
      },
      { folderName: this.name, fileName, text }
    );
  }

  /** When my folder is no longer available — deleted, as a moved folder or an unplugged drive is gone */
  remove(): Promise<void> {
    return this.page.evaluate(
      async (folderName) =>
        (await navigator.storage.getDirectory()).removeEntry(folderName, { recursive: true }),
      this.name
    );
  }
}

/** Given my data is stored in a local folder — switched to in Settings > Data */
export async function storeDataInFolder(page: Page): Promise<void> {
  await openSettingsTab(page, 'Data');
  await page.getByText('Local Directory', { exact: true }).click();
  await page.getByRole('button', { name: 'Select Folder & Switch' }).click();
  await expect(page.getByText(TEST_FOLDER_NAME)).toBeVisible();
}

/** When I choose a different folder in Settings — with "Change" next to the folder name */
export async function changeFolder(page: Page, folder: TestFolder): Promise<void> {
  await page.evaluate(
    ({ key, name }) => sessionStorage.setItem(key, name),
    { key: NEXT_FOLDER_KEY, name: folder.name }
  );
  await openSettingsTab(page, 'Data');
  await page.getByRole('button', { name: 'Change', exact: true }).click();
  await expect(page.getByText(folder.name, { exact: true })).toBeVisible();
}

/**
 * When the browser loses all of its stored data — the lab database is
 * deleted (the app closes its connection when asked) and the page reloads.
 * The password and the chosen folder stay, as they did for the user who lost data.
 */
export async function loseBrowserData(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase('HemoIO');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      })
  );
  await page.reload();
}

/** The notice shown while the folder sync holds back to protect the folder copy */
export function skippedSyncNotice(page: Page): Locator {
  return page.getByRole('alert').filter({ hasText: 'Folder sync skipped' });
}

/** The notice shown while the folder sync cannot write to the folder */
export function failedSyncNotice(page: Page): Locator {
  return page.getByRole('alert').filter({ hasText: 'Folder sync failed' });
}
