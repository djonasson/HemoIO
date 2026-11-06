/**
 * E2E tests for features/start-over.feature
 */

import { test, expect, type Page } from '@playwright/test';
import { setupOrUnlock, unlockApp } from './steps/app.steps';
import { seedLabData } from './steps/data.steps';
import {
  FOLDER_NAME,
  FolderRestoreDialog,
  folderCopyHash,
  installFolderPicker,
  switchToFolderStorage,
  writeForeignFolderCopy,
} from './steps/folderRestore.steps';
import { loseBrowserData } from './steps/folderSync.steps';
import { folderBackupNames } from './steps/otherComputer.steps';
import {
  CONFIRMATION_WORD,
  StartOverPage,
  expectFirstRun,
  hemoioStorageKeys,
  putFolderBackup,
  storedFolderHandles,
} from './steps/startOver.steps';
import { goToTimeline, labResultCards } from './steps/timeline.steps';

const BACKUP_NAME = 'hemoio-backup-20261105T093000000Z.encrypted';

/** And my lab results should still be in this browser */
async function expectLabResultsKept(page: Page): Promise<void> {
  await goToTimeline(page);
  await expect(labResultCards(page)).toHaveCount(2);
}

test.describe('Start over', () => {
  test.beforeEach(async ({ page }) => {
    // Background: I am logged in, with lab results in this browser
    await page.goto('/');
    await setupOrUnlock(page);
    await seedLabData(page);
  });

  test('I start over after confirming, and first run is shown', async ({ page }) => {
    // Scenario: I start over after confirming, and first run is shown
    expect(await hemoioStorageKeys(page)).toContain('hemoio_credentials');

    await new StartOverPage(page).startOverConfirmed();

    await expectFirstRun(page);
    await expect.poll(() => hemoioStorageKeys(page)).toEqual([]);
    // Nothing to unlock any more, after a reload either
    await page.reload();
    await expectFirstRun(page);
    await expect(page.getByRole('button', { name: /unlock/i })).toHaveCount(0);
  });

  test('the word must be typed exactly', async ({ page }) => {
    // Scenario: The word must be typed exactly
    const startOver = new StartOverPage(page);
    await startOver.open();
    await startOver.openConfirmation();

    await expect(startOver.confirm).toBeDisabled();
    await startOver.word.fill('start over');
    await expect(startOver.confirm).toBeDisabled();
    await startOver.word.fill(CONFIRMATION_WORD);
    await expect(startOver.confirm).toBeEnabled();
  });

  test('the dialog offers to export a backup first', async ({ page }) => {
    // Scenario: The dialog offers to export a backup first
    const startOver = new StartOverPage(page);
    await startOver.open();
    await startOver.openConfirmation();

    await expect(startOver.dialog).toContainText(
      'Your folder copy and folder backups are not touched. Export a backup first if this browser has data you need.'
    );
    await startOver.exportBackup.click();

    await expect(startOver.dialog).toBeHidden();
    await expect(page.getByRole('tab', { name: 'Data', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Backup & Restore' })).toBeVisible();
    await expectLabResultsKept(page);
  });

  test('cancelling changes nothing', async ({ page }) => {
    // Scenario: Cancelling changes nothing
    const startOver = new StartOverPage(page);
    await startOver.open();
    await startOver.openConfirmation();
    await startOver.word.fill(CONFIRMATION_WORD);

    await page.keyboard.press('Escape');

    await expect(startOver.dialog).toBeHidden();
    await expect(startOver.startOver).toBeFocused();
    expect(await hemoioStorageKeys(page)).toContain('hemoio_credentials');
    await expectLabResultsKept(page);
  });

  test('another open tab returns to setup', async ({ page }) => {
    // Scenario: Another open tab returns to setup
    const second = await page.context().newPage();
    await second.goto('/');
    await unlockApp(second);

    await page.bringToFront();
    await new StartOverPage(page).startOverConfirmed();
    await expectFirstRun(page);

    await expectFirstRun(second);
    await second.close();
  });

  test('the dialog is accessible', async ({ page }) => {
    // Scenario: The dialog is accessible
    const startOver = new StartOverPage(page);
    await startOver.open();
    await expect(startOver.heading).toBeVisible();

    await startOver.openConfirmation();

    await expect(startOver.dialog.getByRole('heading', { name: 'Start over?' })).toBeVisible();
    await expect(startOver.word).toBeVisible();
    await expect(startOver.cancel).toBeFocused();
    await expect(startOver.confirm).toHaveText('Start over');
  });
});

test.describe('Start over with a folder', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Folder storage needs the File System Access API, which only Chromium has'
  );

  test.beforeEach(async ({ page }) => {
    // Background, with my data stored in a local folder
    await installFolderPicker(page);
    await page.goto('/');
    await setupOrUnlock(page);
    await seedLabData(page);
    await switchToFolderStorage(page);
    await expect.poll(() => folderCopyHash(page)).not.toBeNull();
  });

  test('my folder copy and folder backups are unchanged afterwards', async ({ page }) => {
    // Scenario: My folder copy and folder backups are unchanged afterwards
    await putFolderBackup(page, FOLDER_NAME, BACKUP_NAME);
    const hash = await folderCopyHash(page);
    const backups = await folderBackupNames(page, FOLDER_NAME);
    expect(backups).toContain(BACKUP_NAME);
    expect(await storedFolderHandles(page)).toBe(1);

    await new StartOverPage(page).startOverConfirmed();

    await expectFirstRun(page);
    await expect.poll(() => hemoioStorageKeys(page)).toEqual([]);
    // Only the choice of folder is forgotten, not the folder
    expect(await storedFolderHandles(page)).toBe(0);
    expect(await folderCopyHash(page)).toBe(hash);
    expect(await folderBackupNames(page, FOLDER_NAME)).toEqual(backups);
  });

  test('the "another setup" message points to Start over', async ({ page }) => {
    // Scenario: The "another setup" message points to Start over
    await writeForeignFolderCopy(page, 'another-setup');
    await loseBrowserData(page);
    await unlockApp(page);

    const dialog = new FolderRestoreDialog(page);
    await expect(dialog.unreadable()).toBeVisible();
    await expect(dialog.dialog).toContainText(
      "HemoIO must be set up again from that folder's copy: in Settings > Security, choose Start over, then \"I already have a folder copy\"."
    );
  });
});
