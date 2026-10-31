/**
 * E2E tests for features/folder-sync-safety.feature
 *
 * The folder sync never replaces a folder copy holding lab results with an
 * empty one, keeps the copy it replaces as the previous copy, and tells the
 * user when it holds back.
 */

import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { setupOrUnlock, unlockApp } from './steps/app.steps';
import { lockApp } from './steps/changePassword.steps';
import { SEED_LAB_RESULTS, seedLabData } from './steps/data.steps';
import {
  FOLDER_COPY,
  PREVIOUS_FOLDER_COPY,
  TestFolder,
  changeFolder,
  loseBrowserData,
  skippedSyncNotice,
  storeDataInFolder,
  useTestFolder,
} from './steps/folderSync.steps';
import { FolderRestoreDialog } from './steps/folderRestore.steps';

const MORE_LAB_RESULTS = [
  ...SEED_LAB_RESULTS,
  {
    id: 3,
    date: '2024-03-12T09:00:00.000Z',
    labName: 'City Hospital',
    createdAt: '2024-03-12T09:00:00.000Z',
    updatedAt: '2024-03-12T09:00:00.000Z',
  },
];

const NEW_LAB_RESULT = {
  id: 1,
  date: '2024-05-06T09:00:00.000Z',
  labName: 'New Clinic',
  createdAt: '2024-05-06T09:00:00.000Z',
  updatedAt: '2024-05-06T09:00:00.000Z',
};

const LATER_LAB_RESULT = {
  ...NEW_LAB_RESULT,
  id: 2,
  date: '2024-06-06T09:00:00.000Z',
  createdAt: '2024-06-06T09:00:00.000Z',
  updatedAt: '2024-06-06T09:00:00.000Z',
};

const EVEN_MORE_LAB_RESULTS = [
  ...MORE_LAB_RESULTS,
  {
    id: 4,
    date: '2024-04-02T09:00:00.000Z',
    labName: 'Riverside Clinic',
    createdAt: '2024-04-02T09:00:00.000Z',
    updatedAt: '2024-04-02T09:00:00.000Z',
  },
];

/**
 * And I choose to replace the folder copy instead of restoring it — the
 * restore offer an empty browser gets at unlock
 */
async function replaceFolderCopyInstead(page: Page): Promise<void> {
  const dialog = new FolderRestoreDialog(page);
  await expect(dialog.offer()).toBeVisible();
  await dialog.replace.click();
  await dialog.confirmReplace.click();
  await expect(dialog.dialog).toHaveCount(0);
}

test.describe('Folder Sync Safety', () => {
  let folder: TestFolder;

  test.beforeEach(async ({ page }) => {
    await useTestFolder(page);
    folder = new TestFolder(page);
    await page.goto('/');
    await setupOrUnlock(page);
    await storeDataInFolder(page);
    // Choosing the folder syncs at once: wait for that first copy
    await expect.poll(() => folder.read(FOLDER_COPY)).not.toBeNull();
  });

  /** Given my lab results have been synced to my folder */
  async function syncResults(page: Parameters<typeof seedLabData>[0]): Promise<string> {
    await seedLabData(page);
    // The sync writes once unlocking has checked the folder, maybe just after
    await expect.poll(() => folder.read(FOLDER_COPY)).not.toBeNull();
    return (await folder.read(FOLDER_COPY))!;
  }

  test('an empty browser does not overwrite the folder copy', async ({ page }) => {
    const synced = await syncResults(page);

    await loseBrowserData(page);
    await unlockApp(page);
    await replaceFolderCopyInstead(page);

    await expect(skippedSyncNotice(page)).toBeVisible();
    await expect(skippedSyncNotice(page)).toContainText('your folder copy does');
    expect(await folder.read(FOLDER_COPY)).toBe(synced);
  });

  test('sync starts again once the results are back', async ({ page }) => {
    // Setup, a reload or relock and three restores: each unlock derives the key again
    test.slow();
    const synced = await syncResults(page);
    await loseBrowserData(page);
    await unlockApp(page);
    await replaceFolderCopyInstead(page);
    await expect(skippedSyncNotice(page)).toBeVisible();

    await seedLabData(page, { labResults: MORE_LAB_RESULTS });

    await expect(skippedSyncNotice(page)).toHaveCount(0);
    await expect.poll(() => folder.read(FOLDER_COPY)).not.toBe(synced);
  });

  test('the previous folder copy is kept next to the new one', async ({ page }) => {
    const synced = await syncResults(page);

    await seedLabData(page, { labResults: MORE_LAB_RESULTS });

    await expect.poll(() => folder.read(FOLDER_COPY)).not.toBe(synced);
    expect(await folder.read(PREVIOUS_FOLDER_COPY)).toBe(synced);
  });

  test('a full copy is not pushed out by smaller ones', async ({ page }) => {
    // Setup, a reload or relock and three restores: each unlock derives the key again
    test.slow();
    const full = await syncResults(page);
    await loseBrowserData(page);
    await unlockApp(page);
    await replaceFolderCopyInstead(page);
    await expect(skippedSyncNotice(page)).toBeVisible();

    await seedLabData(page, { labResults: [NEW_LAB_RESULT], testValues: [] });
    await seedLabData(page, { labResults: [NEW_LAB_RESULT, LATER_LAB_RESULT], testValues: [] });

    expect(await folder.read(PREVIOUS_FOLDER_COPY)).toBe(full);
  });

  test('opening the app without changes keeps the previous copy', async ({ page }) => {
    // Setup, a reload or relock and three restores: each unlock derives the key again
    test.slow();
    const synced = await syncResults(page);
    await seedLabData(page, { labResults: MORE_LAB_RESULTS });
    await expect.poll(() => folder.read(FOLDER_COPY)).not.toBe(synced);
    const beforeLastChange = await folder.read(FOLDER_COPY);

    // Unlocking syncs at once; with nothing changed it must not write
    await lockApp(page);
    await unlockApp(page);
    await seedLabData(page, { labResults: EVEN_MORE_LAB_RESULTS });

    await expect.poll(() => folder.read(FOLDER_COPY)).not.toBe(beforeLastChange);
    expect(await folder.read(PREVIOUS_FOLDER_COPY)).toBe(beforeLastChange);
  });

  test('a folder copy saved with another password is not replaced', async ({ page }) => {
    await folder.write(FOLDER_COPY, 'sealed with a different password');
    const foreign = await folder.read(FOLDER_COPY);

    await seedLabData(page);

    await expect(skippedSyncNotice(page)).toBeVisible();
    await expect(skippedSyncNotice(page)).toContainText('cannot be read');
    await expect(skippedSyncNotice(page)).toContainText('choose a different folder');
    expect(await folder.read(FOLDER_COPY)).toBe(foreign);
  });

  test('choosing a different folder lets the sync start again', async ({ page }) => {
    await folder.write(FOLDER_COPY, 'sealed with a different password');
    const foreign = await folder.read(FOLDER_COPY);
    await seedLabData(page);
    await expect(skippedSyncNotice(page)).toBeVisible();

    const otherFolder = new TestFolder(page, 'Other Folder');
    await changeFolder(page, otherFolder);
    await seedLabData(page, { labResults: MORE_LAB_RESULTS });

    await expect(skippedSyncNotice(page)).toHaveCount(0);
    await expect.poll(() => otherFolder.read(FOLDER_COPY)).not.toBeNull();
    expect(await folder.read(FOLDER_COPY)).toBe(foreign);
  });

  test('the first sync to an empty folder writes a copy', async ({ page }) => {
    // Written when the folder was chosen, before there were any results
    const first = await folder.read(FOLDER_COPY);

    await seedLabData(page);

    await expect.poll(() => folder.read(FOLDER_COPY)).not.toBe(first);
    expect(await folder.read(PREVIOUS_FOLDER_COPY)).toBeNull();
    await expect(skippedSyncNotice(page)).toHaveCount(0);
  });
});
