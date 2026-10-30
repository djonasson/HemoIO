/**
 * E2E Tests for restoring from the folder copy
 *
 * See features/restore-from-folder.feature
 */

import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { setupOrUnlock, unlockApp } from './steps/app.steps';
import { SEED_LAB_RESULTS, seedLabData } from './steps/data.steps';
import { lockApp } from './steps/changePassword.steps';
import {
  FOLDER_NAME,
  FolderRestoreDialog,
  folderCopyHash,
  forgetFolderPermission,
  grantFolderAccess,
  installFolderPicker,
  loseBrowserData,
  switchToFolderStorage,
  writeForeignFolderCopy,
} from './steps/folderSync.steps';

/**
 * Background: folder storage on, holding a copy of two lab results, three
 * test values and one note. Returns the copy's fingerprint.
 */
async function folderWithCopy(page: Page): Promise<string> {
  await installFolderPicker(page);
  await page.goto('/');
  await setupOrUnlock(page);
  await switchToFolderStorage(page);
  await seedLabData(page, {
    userNotes: [
      {
        id: 1,
        labResultId: 1,
        content: 'Fasting',
        tags: [],
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
      },
    ],
  });
  // The restore saved to the folder before it showed the timeline
  const hash = await folderCopyHash(page);
  expect(hash).not.toBeNull();
  return hash!;
}

test.describe('Restore from the folder copy', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Folder storage needs the File System Access API, which only Chromium has'
  );

  test('offers the folder copy when the browser has lost its data', async ({ page }) => {
    const hash = await folderWithCopy(page);
    await loseBrowserData(page);
    await unlockApp(page);

    const dialog = new FolderRestoreDialog(page);
    await expect(dialog.offer()).toBeVisible();
    await expect(dialog.dialog).toContainText(FOLDER_NAME);
    await expect(dialog.dialog).toContainText('2 lab results');
    await expect(dialog.dialog).toContainText('3 test values');
    await expect(dialog.dialog).toContainText('1 note');
    await expect(dialog.dialog).toContainText(/Saved .*\d{4}/);
    expect(await folderCopyHash(page)).toBe(hash);
  });

  test('restores the folder copy, and saves the restored data to the folder', async ({ page }) => {
    await folderWithCopy(page);
    await loseBrowserData(page);
    await unlockApp(page);

    const dialog = new FolderRestoreDialog(page);
    await dialog.restore.click();
    await expect(dialog.dialog).toBeHidden();
    await expect(page.getByText(SEED_LAB_RESULTS[0].labName).first()).toBeVisible();

    // What reached the folder after the restore is the restored data
    await loseBrowserData(page);
    await unlockApp(page);
    await expect(dialog.offer()).toContainText('2 lab results');
  });

  test('"Not now" writes nothing and asks again at the next unlock, by keyboard', async ({ page }) => {
    const hash = await folderWithCopy(page);
    await loseBrowserData(page);
    await unlockApp(page);

    const dialog = new FolderRestoreDialog(page);
    await expect(dialog.offer()).toBeVisible();
    await dialog.notNow.focus();
    await page.keyboard.press('Enter');
    await expect(dialog.dialog).toBeHidden();

    // A restore of another backup in the meantime does not reach the folder
    await seedLabData(page);
    expect(await folderCopyHash(page)).toBe(hash);

    await lockApp(page);
    await loseBrowserData(page);
    await unlockApp(page);
    await expect(dialog.offer()).toBeVisible();
    expect(await folderCopyHash(page)).toBe(hash);
  });

  test('replacing the folder copy asks first, then saves to the folder again', async ({ page }) => {
    await folderWithCopy(page);
    await loseBrowserData(page);
    await unlockApp(page);

    const dialog = new FolderRestoreDialog(page);
    await dialog.replace.click();
    await expect(dialog.dialog).toContainText('will be replaced');
    await dialog.confirmReplace.click();
    await expect(dialog.dialog).toBeHidden();

    // From now on saves reach the folder: a one-result backup replaces the copy
    await seedLabData(page, { labResults: [SEED_LAB_RESULTS[0]], testValues: [] });
    await loseBrowserData(page);
    await unlockApp(page);
    await expect(dialog.offer()).toContainText('1 lab result');
  });

  test('a copy saved with another password is reported, not offered or changed', async ({ page }) => {
    await folderWithCopy(page);
    await writeForeignFolderCopy(page, 'other-password');
    const hash = await folderCopyHash(page);
    await loseBrowserData(page);
    await unlockApp(page);

    const dialog = new FolderRestoreDialog(page);
    await expect(dialog.unreadable()).toBeVisible();
    await expect(dialog.dialog).toContainText('different password');
    await expect(dialog.restore).toHaveCount(0);
    expect(await folderCopyHash(page)).toBe(hash);
  });

  test('a damaged copy is reported and left alone', async ({ page }) => {
    await folderWithCopy(page);
    await writeForeignFolderCopy(page, 'damaged');
    const hash = await folderCopyHash(page);
    await loseBrowserData(page);
    await unlockApp(page);

    const dialog = new FolderRestoreDialog(page);
    await expect(dialog.unreadable()).toBeVisible();
    await expect(dialog.dialog).toContainText('damaged');
    await dialog.notNow.click();
    expect(await folderCopyHash(page)).toBe(hash);
  });

  test('a browser that still has its data is not asked, and saves as usual', async ({ page }) => {
    const hash = await folderWithCopy(page);
    await page.reload();
    await unlockApp(page);

    // The unlock saves to the folder (each save is freshly encrypted)
    await expect.poll(() => folderCopyHash(page)).not.toBe(hash);
    await expect(new FolderRestoreDialog(page).dialog).toHaveCount(0);
  });

  test('asks once folder access is granted again', async ({ page }) => {
    const hash = await folderWithCopy(page);
    await forgetFolderPermission(page);
    await loseBrowserData(page);
    await unlockApp(page);

    const dialog = new FolderRestoreDialog(page);
    await grantFolderAccess(page);
    await expect(dialog.offer()).toBeVisible();
    expect(await folderCopyHash(page)).toBe(hash);
  });
});
