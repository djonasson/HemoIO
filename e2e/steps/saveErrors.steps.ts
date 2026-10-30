/**
 * Step definitions for features/save-errors.feature
 *
 * The browser's storage is broken from inside the page, the way a browser
 * fails: every write refused as over quota, or every write transaction
 * cancelled after its requests succeeded, so it never commits (the write
 * looked done, but nothing was kept). Reads keep working, so the app can
 * still show what is stored.
 */

import { expect, type Locator, type Page } from '@playwright/test';
import { unlockApp } from './app.steps';
import { createBackupData, writeBackupFile, type SeedData } from './data.steps';
import { removeTempFile } from './tempFiles';
import { goToTimeline, labResultCards } from './timeline.steps';

/** How the storage fails: refused for lack of room, or cancelled before it is kept */
export type StorageFailure = 'full' | 'cancel';

/**
 * Given the browser's storage is full / cancels every change before keeping it.
 * Lasts until repairStorage or the next page load.
 */
export async function breakStorage(page: Page, failure: StorageFailure): Promise<void> {
  await page.evaluate((mode) => {
    interface Breakage {
      mode: string | null;
    }
    const host = window as unknown as { __storageBreakage?: Breakage };
    if (!host.__storageBreakage) {
      const breakage: Breakage = { mode: null };
      host.__storageBreakage = breakage;
      const store = IDBObjectStore.prototype as unknown as Record<
        string,
        (this: IDBObjectStore, ...args: unknown[]) => IDBRequest
      >;
      for (const name of ['add', 'put', 'delete', 'clear']) {
        const original = store[name];
        store[name] = function (this: IDBObjectStore, ...args: unknown[]): IDBRequest {
          if (breakage.mode === 'full') {
            throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
          }
          const request = original.apply(this, args);
          if (breakage.mode === 'cancel') {
            // Registered before the app's own handler: the write succeeds,
            // then its transaction is cancelled before it can commit
            request.addEventListener('success', () => {
              try {
                this.transaction.abort();
              } catch {
                // Already cancelled by an earlier write
              }
            });
          }
          return request;
        };
      }
    }
    host.__storageBreakage.mode = mode;
  }, failure);
}

/**
 * When the browser's storage works again
 */
export async function repairStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = window as unknown as { __storageBreakage?: { mode: string | null } };
    if (host.__storageBreakage) host.__storageBreakage.mode = null;
  });
}

/**
 * The notification with this title
 */
export function notification(page: Page, title: string): Locator {
  return page.locator('.mantine-Notification-root').filter({ hasText: title });
}

/**
 * When I lock and unlock the app: everything shown is read from storage again
 */
export async function lockAndUnlock(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Lock application' }).click();
  await unlockApp(page);
}

/**
 * Then the timeline shows no lab results
 */
export async function expectEmptyTimeline(page: Page): Promise<void> {
  await goToTimeline(page);
  await expect(page.getByText(/no lab results yet/i)).toBeVisible();
  await expect(labResultCards(page)).toHaveCount(0);
}

/**
 * When I restore a backup with these lab results, whether or not it succeeds
 */
export async function startRestore(page: Page, data: SeedData): Promise<void> {
  const backupPath = writeBackupFile(createBackupData(data));
  try {
    await page.locator('nav').getByText('Settings', { exact: true }).click();
    await page.getByRole('tab', { name: 'Data' }).click();
    await page.locator('input[type="file"]').setInputFiles(backupPath);
    const dialog = page.getByRole('dialog', { name: 'Restore from Backup' });
    await dialog.getByRole('button', { name: 'Restore' }).click();
  } finally {
    removeTempFile(backupPath);
  }
}
