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
import { FOLDER_COPY } from './folderSync.steps';
import { openSettingsTab } from './app.steps';

export const FOLDER_NAME = 'HemoIO Sync';
const PERMISSION_KEY = 'e2e-folder-permission';

/** Given the browser supports the File System Access API */
export async function installFolderPicker(page: Page): Promise<void> {
  await page.addInitScript(
    ({ folderName, permissionKey }) => {
      const folder = async (): Promise<FileSystemDirectoryHandle> =>
        (await navigator.storage.getDirectory()).getDirectoryHandle(folderName, { create: true });
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
    { folderName: FOLDER_NAME, permissionKey: PERMISSION_KEY }
  );
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

/** A fingerprint of the folder copy, or null when there is none */
export function folderCopyHash(page: Page): Promise<string | null> {
  return page.evaluate(
    async ({ folderName, fileName }) => {
      const root = await navigator.storage.getDirectory();
      try {
        const dir = await root.getDirectoryHandle(folderName);
        const file = await (await dir.getFileHandle(fileName)).getFile();
        const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
        return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
      } catch {
        return null;
      }
    },
    { folderName: FOLDER_NAME, fileName: FOLDER_COPY }
  );
}

/** Replace the folder copy with a file HemoIO did not write with this key */
export async function writeForeignFolderCopy(
  page: Page,
  kind: 'other-password' | 'damaged' | 'empty'
): Promise<void> {
  await page.evaluate(
    async ({ folderName, fileName, kind }) => {
      let bytes: Uint8Array;
      if (kind === 'empty') {
        bytes = new Uint8Array(0);
      } else if (kind === 'damaged') {
        bytes = crypto.getRandomValues(new Uint8Array(64));
      } else {
        // As HemoIO writes it (IV, then AES-GCM), under a key this user never had
        const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
          'encrypt',
        ]);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const plain = new TextEncoder().encode(
          JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), data: {} })
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
    { folderName: FOLDER_NAME, fileName: FOLDER_COPY, kind }
  );
}

/** The folder restore dialog, as a page object */
export class FolderRestoreDialog {
  readonly dialog: Locator;
  readonly restore: Locator;
  readonly notNow: Locator;
  readonly replace: Locator;
  readonly confirmReplace: Locator;

  constructor(page: Page) {
    this.dialog = page.getByRole('dialog', {
      name: /Restore your data from the folder\?|The folder copy can't be read|Replace the folder copy\?/,
    });
    this.restore = this.dialog.getByRole('button', { name: 'Restore', exact: true });
    this.notNow = this.dialog.getByRole('button', { name: 'Not now' });
    this.replace = this.dialog.getByRole('button', { name: 'Replace folder copy…' });
    this.confirmReplace = this.dialog.getByRole('button', { name: 'Replace folder copy', exact: true });
  }

  offer(): Locator {
    return this.dialog.page().getByRole('dialog', { name: 'Restore your data from the folder?' });
  }

  unreadable(): Locator {
    return this.dialog.page().getByRole('dialog', { name: "The folder copy can't be read" });
  }
}
