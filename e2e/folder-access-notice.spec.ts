/**
 * E2E Tests for the folder access notice
 *
 * See features/folder-access-notice.feature
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { setupOrUnlock, unlockApp } from './steps/app.steps';
import { SEED_LAB_RESULTS, seedLabData } from './steps/data.steps';
import {
  FolderRestoreDialog,
  allowFolderInSiteSettings,
  blockFolderAccess,
  blockFolderWhenAsked,
  folderCopyHash,
  forgetFolderPermission,
  grantFolderAccess,
  installFolderPicker,
  refuseFolderAccess,
  switchToFolderStorage,
} from './steps/folderRestore.steps';
import { loseBrowserData } from './steps/folderSync.steps';

const accessNeeded = (page: Page) => page.getByRole('alert').filter({ hasText: 'Folder access needed' });
const accessBlocked = (page: Page) => page.getByRole('alert').filter({ hasText: 'Folder access blocked' });
const anyAccessNotice = (page: Page) => page.getByRole('alert').filter({ hasText: /Folder access (needed|blocked)/ });

/** Background: data kept in a folder, which holds their copy. Returns the copy's fingerprint. */
async function dataInFolder(page: Page): Promise<string> {
  await installFolderPicker(page);
  await page.goto('/');
  await setupOrUnlock(page);
  await seedLabData(page);
  await switchToFolderStorage(page);
  await expect.poll(() => folderCopyHash(page)).not.toBeNull();
  return (await folderCopyHash(page))!;
}

/** And the browser was reopened, so it asks again for folder access */
async function reopenNeedingAccess(page: Page): Promise<void> {
  await forgetFolderPermission(page);
  await page.reload();
}

test.describe('Folder access notice', () => {
  test('tells when folder access needs renewing, offering to grant it there', async ({ page }) => {
    // Scenario: Told when folder access needs renewing
    await dataInFolder(page);
    await reopenNeedingAccess(page);
    await unlockApp(page);

    const notice = accessNeeded(page);
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Your browser asks for your permission again before HemoIO may use your folder.');
    await expect(notice.getByRole('button', { name: 'Grant access' })).toBeVisible();
  });

  test('grants access from the notice, and the folder is used again', async ({ page }) => {
    // Scenario: Grant folder access from the notice
    const hash = await dataInFolder(page);
    await reopenNeedingAccess(page);
    await unlockApp(page);

    await accessNeeded(page).getByRole('button', { name: 'Grant access' }).click();
    await expect(anyAccessNotice(page)).toHaveCount(0);

    // Data added now reach the folder copy
    await seedLabData(page, { labResults: [...SEED_LAB_RESULTS, LATER_RESULT] });
    await expect.poll(() => folderCopyHash(page)).not.toBe(hash);
  });

  test('grants access from the notice after the browser lost its data, offering the restore', async ({ page }) => {
    // Scenario: Grant folder access from the notice after the browser lost its data
    await dataInFolder(page);
    await forgetFolderPermission(page);
    await loseBrowserData(page);
    await unlockApp(page);

    await accessNeeded(page).getByRole('button', { name: 'Grant access' }).click();
    await expect(new FolderRestoreDialog(page).offer()).toBeVisible();
  });

  test('stays, saying so, when the browser does not give access', async ({ page }) => {
    // Scenario: The browser does not give access
    await dataInFolder(page);
    await reopenNeedingAccess(page);
    await unlockApp(page);
    await refuseFolderAccess(page);

    const notice = accessNeeded(page);
    await notice.getByRole('button', { name: 'Grant access' }).click();
    await expect(notice).toContainText('The browser did not give access to the folder. Try again.');
    await expect(notice.getByRole('button', { name: 'Grant access' })).toBeVisible();
  });

  test('says how to unblock folder access, offering another folder', async ({ page }) => {
    // Scenario: Folder access is blocked
    await dataInFolder(page);
    await blockFolderAccess(page);
    await page.reload();
    await unlockApp(page);

    const notice = accessBlocked(page);
    await expect(notice).toContainText(
      "Your browser blocks HemoIO from your folder. Allow it in the browser's site settings, or choose another folder."
    );
    await expect(notice.getByRole('button', { name: 'Choose another folder' })).toBeVisible();
  });

  test('says how to unblock the folder once it was blocked when the browser asked', async ({ page }) => {
    // Scenario: Blocking the folder when the browser asks
    await dataInFolder(page);
    await reopenNeedingAccess(page);
    await unlockApp(page);
    await blockFolderWhenAsked(page);

    await accessNeeded(page).getByRole('button', { name: 'Grant access' }).click();
    await expect(accessBlocked(page)).toContainText("Allow it in the browser's site settings, or choose another folder.");
    await expect(accessNeeded(page)).toHaveCount(0);
  });

  test('offers to grant access again once the folder is allowed in site settings', async ({ page }) => {
    // Scenario: Allowing the folder again in the browser's site settings
    await dataInFolder(page);
    await blockFolderAccess(page);
    await page.reload();
    await unlockApp(page);
    await expect(accessBlocked(page)).toBeVisible();

    await allowFolderInSiteSettings(page);
    // Coming back to HemoIO from the browser's settings
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(accessNeeded(page).getByRole('button', { name: 'Grant access' })).toBeVisible();
    await expect(accessBlocked(page)).toHaveCount(0);
  });

  test('goes away when access is granted in Settings', async ({ page }) => {
    // Scenario: Granting access in Settings takes the notice away
    await dataInFolder(page);
    await reopenNeedingAccess(page);
    await unlockApp(page);
    await expect(accessNeeded(page)).toBeVisible();

    await grantFolderAccess(page);
    await expect(anyAccessNotice(page)).toHaveCount(0);
  });

  test('is not shown while folder access is given', async ({ page }) => {
    // Scenario: No notice while folder access is given
    await dataInFolder(page);
    await page.reload();
    await unlockApp(page);

    await expect(page.getByRole('navigation')).toBeVisible();
    await expect(anyAccessNotice(page)).toHaveCount(0);
  });

  test('is not shown when data are kept in the browser only', async ({ page }) => {
    // Scenario: No notice when data is kept in the browser only
    await installFolderPicker(page);
    await page.goto('/');
    await setupOrUnlock(page);
    await forgetFolderPermission(page);
    await page.reload();
    await unlockApp(page);

    await expect(page.getByRole('navigation')).toBeVisible();
    await expect(anyAccessNotice(page)).toHaveCount(0);
  });
});

const LATER_RESULT = {
  id: 99,
  date: '2024-06-06T09:00:00.000Z',
  labName: 'New Clinic',
  createdAt: '2024-06-06T09:00:00.000Z',
  updatedAt: '2024-06-06T09:00:00.000Z',
};
