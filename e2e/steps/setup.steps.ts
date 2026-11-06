/**
 * Steps for first-run setup over data already in the browser, and across tabs
 */

import { expect, type Locator, type Page } from '@playwright/test';
import { completeSetup } from './app.steps';
import { forgetCredentials, writeUnreadableRecords } from './unreadableRecords.steps';

/** The setup screen that says the browser already holds HemoIO data */
export function existingDataStep(page: Page): Locator {
  return page.getByRole('region', { name: 'This browser already holds HemoIO data' });
}

/**
 * Given this browser holds HemoIO data whose password lock is gone: an
 * earlier setup stored records, then its credentials were removed, and the
 * app is loaded again. Resolves with how many records were stored.
 */
export async function seedDataWithoutLock(page: Page): Promise<number> {
  await completeSetup(page);
  await writeUnreadableRecords(page, { labResults: 1, testValues: 2 });
  await forgetCredentials(page);
  await page.reload();
  await expect(existingDataStep(page)).toBeVisible();
  return 3;
}

/** When I keep the data an earlier setup left aside, and set up anew */
export async function keepExistingDataAside(page: Page): Promise<void> {
  await existingDataStep(page).getByRole('button', { name: 'Keep it aside and set up anew' }).click();
}

/**
 * Records every localStorage key the page writes, from its first script
 * on. Call before the page loads; read with storageKeysWritten.
 */
export async function recordStorageWrites(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const target = window as unknown as { storageKeysWritten: string[] };
    target.storageKeysWritten = [];
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      target.storageKeysWritten.push(key);
      setItem.call(this, key, value);
    };
  });
}

/** The localStorage keys written since the page loaded, in order */
export async function storageKeysWritten(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { storageKeysWritten: string[] }).storageKeysWritten);
}

/** Go through the setup steps up to the completion step, without completing */
export async function goToCompletionStep(page: Page, password: string): Promise<void> {
  await page.getByPlaceholder(/enter your password/i).fill(password);
  await page.getByPlaceholder(/confirm your password/i).fill(password);
  await page.getByRole('button', { name: 'Go to next step' }).click();
  await page.getByRole('button', { name: 'Go to next step' }).click();
  await page.getByRole('button', { name: 'Go to next step' }).click();
  await expect(page.getByRole('heading', { name: "You're all set!" })).toBeVisible();
}
