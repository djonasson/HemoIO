/**
 * Steps for features/start-over.feature
 */

import { expect, type Locator, type Page } from '@playwright/test';
import { openSettingsTab } from './app.steps';
import { writeFolderFile } from './folderSync.steps';
import { FOLDER_BACKUPS } from './otherComputer.steps';

export const CONFIRMATION_WORD = 'START OVER';

/** Settings → Security, its Start over section, and the confirmation dialog */
export class StartOverPage {
  readonly heading: Locator;
  /** The button that opens the confirmation */
  readonly startOver: Locator;
  readonly dialog: Locator;
  readonly word: Locator;
  readonly confirm: Locator;
  readonly cancel: Locator;
  readonly exportBackup: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Start over', exact: true });
    this.startOver = page.getByRole('main').getByRole('button', { name: 'Start over', exact: true });
    this.dialog = page.getByRole('dialog', { name: 'Start over?' });
    this.word = this.dialog.getByLabel('Type START OVER to confirm');
    this.confirm = this.dialog.getByRole('button', { name: 'Start over', exact: true });
    this.cancel = this.dialog.getByRole('button', { name: 'Cancel' });
    this.exportBackup = this.dialog.getByRole('button', { name: 'Export a backup' });
  }

  /** Given I am on the Security tab of Settings */
  async open(): Promise<void> {
    await openSettingsTab(this.page, 'Security');
    await expect(this.heading).toBeVisible();
  }

  /** When I choose "Start over" */
  async openConfirmation(): Promise<void> {
    await this.startOver.click();
    await expect(this.dialog).toBeVisible();
  }

  /**
   * When I start over: open the Security tab, type the word and confirm.
   * Ends once the page has reloaded, as it does when the data is cleared.
   */
  async startOverConfirmed(): Promise<void> {
    await this.open();
    await this.openConfirmation();
    await this.word.fill(CONFIRMATION_WORD);
    const reloaded = this.page.waitForEvent('load');
    await this.confirm.click();
    await reloaded;
  }
}

/**
 * Then I should see the first-run setup: where folders can be used, the
 * choice between a new setup and a folder copy; elsewhere the password step
 */
export async function expectFirstRun(page: Page): Promise<void> {
  await expect(
    page.getByRole('button', { name: 'Set up HemoIO' }).or(page.getByPlaceholder(/confirm your password/i))
  ).toBeVisible();
}

/** The localStorage keys HemoIO wrote that are still there */
export function hemoioStorageKeys(page: Page): Promise<string[]> {
  return page.evaluate(
    (prefix) => Object.keys(localStorage).filter((key) => key.startsWith(prefix)),
    LOCAL_STORAGE_PREFIX
  );
}

/** Mirrors LOCAL_STORAGE_PREFIX in src/data/db/storedRows.ts */
const LOCAL_STORAGE_PREFIX = 'hemoio_';

/** And the folder holds dated backups — a file in its backups folder */
export function putFolderBackup(page: Page, folderName: string, name: string): Promise<void> {
  return writeFolderFile(page, folderName, `${FOLDER_BACKUPS}/${name}`, [1, 2, 3, 4]);
}

/** How many folder handles HemoIO keeps, to find the chosen folder again */
export function storedFolderHandles(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open('HemoIO-FileSystemHandles', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('handles');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const count = db.transaction('handles', 'readonly').objectStore('handles').count();
          count.onsuccess = () => {
            db.close();
            resolve(count.result);
          };
          count.onerror = () => reject(count.error);
        };
      })
  );
}
