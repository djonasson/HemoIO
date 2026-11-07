/**
 * Steps for restoring from the folder copy
 *
 * Browsers under test cannot open a native folder picker, so the picker is
 * replaced with a folder in the origin-private file system, which is a real
 * directory handle the app reads and writes as it would a synced folder.
 * Folder permission is simulated too: tests can make the browser "forget"
 * the grant, as it does when it is reopened.
 */

import { expect, type Locator, type Page } from '@playwright/test';
import { FOLDER_COPY, TEST_FOLDER_NAME } from './folderSync.steps';
import { openSettingsTab } from './app.steps';
import { writeEnvelopeCopy } from './otherComputer.steps';

/** The test folder: the same one useTestFolder hands out */
export const FOLDER_NAME = TEST_FOLDER_NAME;
const PERMISSION_KEY = 'e2e-folder-permission';
/** Where the picker looks for the folder a test picks next, or 'cancel' to have it cancelled */
const NEXT_PICK_KEY = 'e2e-next-pick';
/** Set while reading the folder copy fails */
const FAIL_READS_KEY = 'e2e-fail-folder-reads';

/** Given the browser supports the File System Access API */
export async function installFolderPicker(page: Page): Promise<void> {
  await page.addInitScript(
    ({ folderName, permissionKey, nextPickKey }) => {
      const folder = async (): Promise<FileSystemDirectoryHandle> => {
        const next = sessionStorage.getItem(nextPickKey);
        // As the browser reports a picker the user closed
        if (next === 'cancel') throw new DOMException('The user aborted a request.', 'AbortError');
        return (await navigator.storage.getDirectory()).getDirectoryHandle(next ?? folderName, { create: true });
      };
      Object.defineProperty(window, 'showDirectoryPicker', {
        configurable: true,
        value: folder,
      });
      const proto = FileSystemHandle.prototype as unknown as Record<string, unknown>;
      // Counted: every folder sync starts by asking, so a sync that began shows here
      const counter = window as unknown as { __e2ePermissionQueries: number };
      counter.__e2ePermissionQueries = 0;
      proto.queryPermission = async () => {
        counter.__e2ePermissionQueries += 1;
        return localStorage.getItem(permissionKey) ?? 'granted';
      };
      proto.requestPermission = async () => {
        localStorage.removeItem(permissionKey);
        return 'granted';
      };
    },
    { folderName: FOLDER_NAME, permissionKey: PERMISSION_KEY, nextPickKey: NEXT_PICK_KEY }
  );
}

/** The folder the picker hands out next, by name; 'cancel' has the user close it instead */
export async function pickNext(page: Page, folderName: string | 'cancel'): Promise<void> {
  await page.evaluate(({ key, name }) => sessionStorage.setItem(key, name), { key: NEXT_PICK_KEY, name: folderName });
}

/**
 * Given the folder copy cannot be read from the folder — reading the file
 * fails, as on a drive that is not ready, until canReadFolderAgain. Must be
 * called before the page loads that is to see it.
 */
export async function failFolderReads(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key, fileName }) => {
      // On until the test says the folder can be read again, reloads included
      if (sessionStorage.getItem(key) === null) sessionStorage.setItem(key, 'on');
      const proto = FileSystemFileHandle.prototype;
      const getFile = proto.getFile;
      proto.getFile = function (this: FileSystemFileHandle): Promise<File> {
        if (this.name === fileName && sessionStorage.getItem(key) === 'on') {
          return Promise.reject(new DOMException('The file could not be read.', 'NotReadableError'));
        }
        return getFile.call(this);
      };
    },
    { key: FAIL_READS_KEY, fileName: FOLDER_COPY }
  );
}

/** When the folder can be read again */
export async function canReadFolderAgain(page: Page): Promise<void> {
  await page.evaluate((key) => sessionStorage.setItem(key, 'off'), FAIL_READS_KEY);
}

/** Then Settings > Data should show this folder as the current folder */
export async function expectCurrentFolder(page: Page, folderName: string): Promise<void> {
  await openDataSettings(page);
  await expect(page.getByText(`Current folder: “${folderName}”`, { exact: true })).toBeVisible();
  await expect(page.getByText("Browsers show only the folder's name, not where it is.")).toBeVisible();
}

/** And HemoIO needs my permission to use the folder again */
export async function forgetFolderPermission(page: Page): Promise<void> {
  await page.evaluate((key) => localStorage.setItem(key, 'prompt'), PERMISSION_KEY);
}

async function openDataSettings(page: Page): Promise<void> {
  await openSettingsTab(page, 'Data');
}

/** When I switch storage to a folder in Settings */
export async function switchToFolderStorage(page: Page): Promise<void> {
  await openDataSettings(page);
  await page.getByRole('radio', { name: /Local Directory/ }).click();
  await page.getByRole('button', { name: 'Select Folder & Switch' }).click();
  await expect(page.getByText(FOLDER_NAME, { exact: true })).toBeVisible();
}

/** When I grant folder access in Settings */
export async function grantFolderAccess(page: Page): Promise<void> {
  await openDataSettings(page);
  await page.getByRole('button', { name: 'Grant Access' }).click();
}

/** How often the app has asked about folder permission, as each sync does first */
export function folderPermissionQueries(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __e2ePermissionQueries: number }).__e2ePermissionQueries
  );
}

/**
 * A fingerprint of the folder copy, or of another file in the folder
 * (`path` may name a subfolder: `hemoio-backups/<name>`); null when there is none
 */
export function folderCopyHash(
  page: Page,
  folderName: string = FOLDER_NAME,
  path: string = FOLDER_COPY
): Promise<string | null> {
  return page.evaluate(
    async ({ folderName, path }) => {
      const root = await navigator.storage.getDirectory();
      try {
        let dir = await root.getDirectoryHandle(folderName);
        const parts = path.split('/');
        for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
        const file = await (await dir.getFileHandle(parts.at(-1)!)).getFile();
        const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
        return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
      } catch {
        return null;
      }
    },
    { folderName, path }
  );
}

/**
 * Replace the folder copy with a file HemoIO did not write with this key:
 * another setup's copy, carrying its own lock (`another-setup`); a copy in the
 * raw format from before the lock was kept beside it, under a key this user
 * never had (`legacy-other-key`); random bytes; or an empty file
 */
export async function writeForeignFolderCopy(
  page: Page,
  kind: 'another-setup' | 'legacy-other-key' | 'damaged' | 'empty',
  folderName: string = FOLDER_NAME
): Promise<void> {
  if (kind === 'another-setup') {
    await writeEnvelopeCopy(page, { kind: 'another-setup' }, {}, folderName);
    return;
  }
  await page.evaluate(
    async ({ folderName, fileName, kind }) => {
      let bytes: Uint8Array<ArrayBuffer>;
      if (kind === 'empty') {
        bytes = new Uint8Array(0);
      } else if (kind === 'damaged') {
        bytes = crypto.getRandomValues(new Uint8Array(64));
      } else {
        // The raw format (IV, then AES-GCM), under a key this user never had
        const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
          'encrypt',
        ]);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const plain = new TextEncoder().encode(
          JSON.stringify({ version: 4, exportedAt: new Date().toISOString(), data: {} })
        );
        const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
        bytes = new Uint8Array(iv.length + sealed.length);
        bytes.set(iv);
        bytes.set(sealed, iv.length);
      }
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(folderName, {
        create: true,
      });
      const writable = await (await dir.getFileHandle(fileName, { create: true })).createWritable();
      await writable.write(bytes);
      await writable.close();
    },
    { folderName, fileName: FOLDER_COPY, kind }
  );
}

/** The folder restore dialog, as a page object */
export class FolderRestoreDialog {
  readonly dialog: Locator;
  readonly restore: Locator;
  readonly notNow: Locator;
  readonly replace: Locator;
  readonly confirmReplace: Locator;
  readonly back: Locator;
  readonly chooseFolder: Locator;
  readonly tryAgain: Locator;

  constructor(page: Page) {
    this.dialog = page.getByRole('dialog', {
      name: /Restore your data from the folder\?|The folder copy can't be read|Replace the folder copy\?/,
    });
    this.restore = this.dialog.getByRole('button', { name: 'Restore', exact: true });
    this.notNow = this.dialog.getByRole('button', { name: 'Not now' });
    this.replace = this.dialog.getByRole('button', { name: 'Replace folder copy…' });
    this.confirmReplace = this.dialog.getByRole('button', { name: 'Replace folder copy', exact: true });
    this.back = this.dialog.getByRole('button', { name: 'Back' });
    this.chooseFolder = this.dialog.getByRole('button', { name: 'Choose another folder' });
    this.tryAgain = this.dialog.getByRole('button', { name: 'Try again' });
  }

  offer(): Locator {
    return this.dialog.page().getByRole('dialog', { name: 'Restore your data from the folder?' });
  }

  unreadable(): Locator {
    return this.dialog.page().getByRole('dialog', { name: "The folder copy can't be read" });
  }
}
