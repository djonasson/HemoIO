/**
 * E2E Tests for records HemoIO cannot open with the session key
 *
 * Feature: features/unreadable-records.feature
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import { completeSetup, openSettingsTab, setupOrUnlock, unlockApp } from './steps/app.steps';
import { createBackupData, seedLabData, SEED_TEST_VALUES, writeBackupFile } from './steps/data.steps';
import { keepExistingDataAside } from './steps/setup.steps';
import { removeTempFile } from './steps/tempFiles';
import { readStoredRows } from './steps/dataAtRest.steps';
import { goToTimeline, labResultCards } from './steps/timeline.steps';
import {
  forgetCredentials,
  restoreCredentials,
  saveCredentials,
  seedUnreadableRecords,
  downloadSealedFile,
  openDeleteConfirmation,
  setAsideBanner,
  sealedFileWritten,
  setAsideRowCount,
  setAsideSavedFlags,
  withSavePicker,
  withoutSavePicker,
  writeSetAsideRow,
  setAsideTables,
  storeUndecryptableApiKey,
  writeUnreadableRecords,
} from './steps/unreadableRecords.steps';

test.describe('Unreadable records: the data', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
  });

  test('keeps unreadable records aside when I unlock', async ({ page }) => {
    // Scenario: Unreadable records are kept aside when I unlock
    await seedLabData(page);
    await seedUnreadableRecords(page, { labResults: 1, testValues: 2 });

    expect(await setAsideRowCount(page)).toBe(3);
    await goToTimeline(page);
    // Only the two results of the backup
    await expect(labResultCards(page)).toHaveCount(2);
    const stored = await readStoredRows(page);
    expect(stored.labResults).toHaveLength(2);
    expect(stored.testValues).toHaveLength(3);
  });

  test('keeps unreadable records aside through a restore', async ({ page }) => {
    // Scenario: Restoring a backup keeps unreadable records aside
    await seedUnreadableRecords(page, { labResults: 1, testValues: 2 });
    expect(await setAsideRowCount(page)).toBe(3);

    await seedLabData(page);

    expect(await setAsideRowCount(page)).toBe(3);
    await expect(labResultCards(page)).toHaveCount(2);
  });

  test('a restore moves unreadable records it meets aside', async ({ page }) => {
    // Scenario: Restoring a backup keeps unreadable records aside
    // Written after unlock, so the restore itself must keep them
    await writeUnreadableRecords(page, { labResults: 1, testValues: 2 });

    await seedLabData(page);

    expect(await setAsideRowCount(page)).toBe(3);
    await expect(labResultCards(page)).toHaveCount(2);
  });

  test('a preferences save moves unreadable preferences it meets aside', async ({ page }) => {
    // Scenario: Saving preferences keeps unreadable preferences aside
    // Written after unlock, so the save itself must keep them
    await writeUnreadableRecords(page, { labResults: 0, testValues: 0, preferences: true });

    await openSettingsTab(page, 'Display');
    await page.locator('.mantine-SegmentedControl-root').getByText('Dark').click();
    await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'dark');

    await expect.poll(() => setAsideTables(page)).toEqual(['userPreferences']);
    const stored = await readStoredRows(page);
    expect(stored.userPreferences).toHaveLength(1);
    expect(stored.userPreferences[0].id).not.toBe(1000);
  });

  test('keeps unreadable preferences aside when the theme is saved', async ({ page }) => {
    // Scenario: Saving preferences keeps unreadable preferences aside
    await seedUnreadableRecords(page, { labResults: 0, testValues: 0, preferences: true });

    await openSettingsTab(page, 'Display');
    await page.locator('.mantine-SegmentedControl-root').getByText('Dark').click();
    await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'dark');

    await page.reload();
    await unlockApp(page);
    await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'dark');
    expect(await setAsideTables(page)).toEqual(['userPreferences']);
    // The saved preferences are a new row: the unreadable one was not overwritten
    const stored = await readStoredRows(page);
    expect(stored.userPreferences).toHaveLength(1);
    expect(stored.userPreferences[0].id).not.toBe(1000);
  });

  test('treats an API key that cannot be decrypted as not set', async ({ page }) => {
    // Scenario: An API key that cannot be decrypted is treated as not set
    await storeUndecryptableApiKey(page);
    await page.reload();
    await unlockApp(page);

    await openSettingsTab(page, 'AI Configuration');

    await expect(page.locator('input[aria-label="API key"]')).toBeVisible();
    await expect(page.getByText('Configured', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('hemoio_ai_api_key_encrypted'))).toBeNull();
  });
});

test.describe('Unreadable records: coming back', () => {
  test('records come back when HemoIO gets the key they were saved with', async ({ page }) => {
    // Scenario: Records that open with a key HemoIO gets later come back
    await page.goto('/');
    await setupOrUnlock(page);
    await seedLabData(page);
    const firstSetup = await saveCredentials(page);

    // Set up again with a new key: the first setup's records go aside
    await forgetCredentials(page);
    await page.reload();
    await keepExistingDataAside(page);
    await completeSetup(page);
    expect((await setAsideTables(page)).filter((table) => table !== 'userPreferences')).toHaveLength(5);
    await goToTimeline(page);
    await expect(labResultCards(page)).toHaveCount(0);

    // The first setup's key is back
    await restoreCredentials(page, firstSetup);
    await page.reload();
    await unlockApp(page);

    await goToTimeline(page);
    await expect(labResultCards(page)).toHaveCount(2);
    const stored = await readStoredRows(page);
    expect(stored.labResults).toHaveLength(2);
    expect(stored.testValues).toHaveLength(3);
    expect(await setAsideRowCount(page)).toBe(0);
  });
});

test.describe('Unreadable records: the banner', () => {
  const TITLE = "3 stored records can't be opened";

  test.beforeEach(async ({ page }) => {
    // A plain download, as in Firefox and Safari; the save picker is tested below
    await withoutSavePicker(page);
    await page.goto('/');
    await setupOrUnlock(page);
    await seedLabData(page);
    await seedUnreadableRecords(page, { labResults: 1, testValues: 2 });
  });

  test('says how many stored records cannot be opened, and nothing they hold', async ({ page }) => {
    // Scenario: I am told how many records are kept aside
    const banner = setAsideBanner(page);
    await expect(banner).toBeVisible();
    await expect(banner).toHaveText(
      TITLE +
        'They were saved with a different key, or are damaged. HemoIO keeps them aside and does not delete them. You can download them as a sealed file or delete them.' +
        'Download sealed file' +
        'Delete…'
    );
    // Still stored, still sealed
    const stored = await readStoredRows(page);
    expect(stored.setAside).toHaveLength(3);
    for (const entry of stored.setAside) {
      expect((entry.row as { encrypted?: unknown }).encrypted).toEqual(expect.any(String));
    }
  });

  test('downloads the records as a sealed file named by the date only', async ({ page }) => {
    // Scenario: I can download the unreadable records as a sealed file
    const download = await downloadSealedFile(page);

    expect(download.suggestedFilename()).toMatch(/^hemoio-unreadable-records-\d{4}-\d{2}-\d{2}\.json$/);
    const content = fs.readFileSync(await download.path(), 'utf-8');
    const file = JSON.parse(content);
    expect(file.format).toBe('hemoio-unreadable-records');
    expect(file.records).toHaveLength(3);
    // Exactly as stored: the ciphertext of each row
    const stored = await readStoredRows(page);
    expect(file.records.map((record: { row: unknown }) => record.row)).toEqual(
      expect.arrayContaining(stored.setAside.map((entry) => entry.row))
    );
    for (const name of new Set(SEED_TEST_VALUES.map((value) => value.rawText))) {
      expect(content).not.toContain(name);
    }
    // Still kept aside, and not counted as saved until I say the file saved
    const banner = setAsideBanner(page);
    await expect(banner).toBeVisible();
    await expect(banner.getByRole('status')).toContainText('Did the file save?');
    expect(await setAsideSavedFlags(page)).toEqual([0, 0, 0]);
    await banner.getByRole('button', { name: 'Yes, I saved it' }).click();
    await expect.poll(() => setAsideSavedFlags(page)).toEqual([1, 1, 1]);
    await expect(banner.getByText('Did the file save?')).toHaveCount(0);
  });

  test('a sealed file cannot be restored as a backup', async ({ page }) => {
    // Scenario: The downloaded file cannot be restored as a backup
    const download = await downloadSealedFile(page);
    const filePath = await download.path();

    await openSettingsTab(page, 'Data');
    await page.locator('input[type="file"]').setInputFiles({
      name: download.suggestedFilename(),
      mimeType: 'application/json',
      buffer: fs.readFileSync(filePath),
    });

    await expect(
      page.getByText('This file holds records HemoIO could not read. It is not a backup and cannot be restored.')
    ).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Restore from Backup' })).toHaveCount(0);
    await goToTimeline(page);
    await expect(labResultCards(page)).toHaveCount(2);
    expect(await setAsideRowCount(page)).toBe(3);
  });

  test('deletes the records only after I confirm', async ({ page }) => {
    // Scenario: I can delete the unreadable records after confirming
    let dialog = await openDeleteConfirmation(page);
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(setAsideBanner(page)).toBeVisible();
    expect(await setAsideRowCount(page)).toBe(3);

    dialog = await openDeleteConfirmation(page);
    await dialog.getByRole('button', { name: 'Delete 3 records' }).click();

    await expect(setAsideBanner(page)).toHaveCount(0);
    expect(await setAsideRowCount(page)).toBe(0);
    // The banner is gone: focus goes to the main content, not to the page itself
    await expect(page.getByRole('main')).toBeFocused();
    await goToTimeline(page);
    await expect(labResultCards(page)).toHaveCount(2);
  });

  test('keeps a record set aside after the delete confirmation opened', async ({ page }) => {
    // Scenario: I can delete the unreadable records after confirming
    const dialog = await openDeleteConfirmation(page);
    // Another tab sets one more record aside meanwhile
    await writeSetAsideRow(page);

    await dialog.getByRole('button', { name: 'Delete 3 records' }).click();

    await expect(setAsideBanner(page).getByText("1 stored record can't be opened")).toBeVisible();
    expect(await setAsideRowCount(page)).toBe(1);
  });

  test('a backup export says what it leaves out, and saves nothing unless I confirm', async ({ page }) => {
    // Scenario: A backup export tells me what it leaves out and asks first
    await page.getByRole('button', { name: 'Export data' }).click();
    const dialog = page.getByRole('dialog', { name: 'Export Data' });
    await dialog.getByRole('textbox', { name: 'Select export format' }).click();
    await page.getByRole('option', { name: 'JSON (Full Backup)' }).click();
    let downloads = 0;
    page.on('download', () => downloads++);

    await dialog.getByRole('button', { name: 'Export', exact: true }).click();
    const leftOut =
      "3 records that can't be opened are not in this backup. Download them from the banner to keep them.";
    await expect(dialog.getByText(leftOut)).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog.getByText(leftOut)).toBeHidden();
    expect(downloads).toBe(0);

    await dialog.getByRole('button', { name: 'Export', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export anyway' }).click();
    const backup = JSON.parse(fs.readFileSync(await (await downloadPromise).path(), 'utf-8'));
    expect(backup.labResults).toHaveLength(2);
  });

  test('the restore confirmation says the records kept aside are not affected', async ({ page }) => {
    // Scenario: The restore confirmation says how many records are kept aside
    const backupPath = writeBackupFile(createBackupData());
    try {
      await openSettingsTab(page, 'Data');
      await page.locator('input[type="file"]').setInputFiles(backupPath);

      const dialog = page.getByRole('dialog', { name: 'Restore from Backup' });
      await expect(
        dialog.getByText("3 records that can't be opened are kept aside and are not affected.")
      ).toBeVisible();
      await dialog.getByRole('button', { name: 'Cancel' }).click();
    } finally {
      removeTempFile(backupPath);
    }
  });

  test('the banner is a labelled region whose buttons the keyboard reaches', async ({ page }) => {
    // Scenario: The banner is accessible
    const banner = setAsideBanner(page);
    await expect(banner.getByText(TITLE)).toBeVisible();
    // An icon beside the words, so the meaning is not in the color alone
    await expect(banner.locator('svg').first()).toBeVisible();

    // Clicking plain text sets the sequential focus navigation starting point
    await banner.getByText(TITLE).click();
    await page.keyboard.press('Tab');
    await expect(banner.getByRole('button', { name: 'Download sealed file' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(banner.getByRole('button', { name: 'Delete…' })).toBeFocused();

    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Delete unreadable records?' });
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(banner).toBeVisible();
    expect(await setAsideRowCount(page)).toBe(3);
  });
});

test.describe('Unreadable records: preferences', () => {
  test('tells once a session that earlier preferences were kept aside', async ({ page }) => {
    // Scenario: I am told once when my earlier preferences are kept aside
    await page.goto('/');
    await setupOrUnlock(page);
    await writeUnreadableRecords(page, { labResults: 0, testValues: 0, preferences: true });

    await openSettingsTab(page, 'Display');
    const themes = page.locator('.mantine-SegmentedControl-root');
    await themes.getByText('Dark').click();
    const notice = page.getByRole('alert').filter({ hasText: 'Earlier preferences kept aside' });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(
      "Your saved preferences couldn't be opened, so HemoIO kept them aside and saved your change."
    );
    await notice.getByRole('button').click();
    await expect(notice).toHaveCount(0);

    // Unreadable preferences again, as another tab under another key would write
    await writeUnreadableRecords(page, { labResults: 0, testValues: 0, preferences: true });
    await themes.getByText('Light').click();
    await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'light');

    await expect.poll(() => setAsideTables(page)).toEqual(['userPreferences', 'userPreferences']);
    await expect(notice).toHaveCount(0);
  });
});

test.describe('Unreadable records: the save picker', () => {
  test('a file the save picker wrote counts as saved', async ({ page }) => {
    // Scenario: I can download the unreadable records as a sealed file
    await withSavePicker(page, 'save');
    await page.goto('/');
    await setupOrUnlock(page);
    await seedUnreadableRecords(page, { labResults: 1, testValues: 2 });

    await setAsideBanner(page).getByRole('button', { name: 'Download sealed file' }).click();

    await expect.poll(() => setAsideSavedFlags(page)).toEqual([1, 1, 1]);
    const file = JSON.parse((await sealedFileWritten(page))!);
    expect(file.format).toBe('hemoio-unreadable-records');
    expect(file.records).toHaveLength(3);
    await expect(setAsideBanner(page).getByText('Did the file save?')).toHaveCount(0);
  });

  test('a cancelled save picker leaves the records unsaved', async ({ page }) => {
    // Scenario: I can download the unreadable records as a sealed file
    await withSavePicker(page, 'cancel');
    await page.goto('/');
    await setupOrUnlock(page);
    await seedUnreadableRecords(page, { labResults: 1, testValues: 2 });
    const button = setAsideBanner(page).getByRole('button', { name: 'Download sealed file' });

    await button.click();

    // Done once the button stops loading
    await expect(button).toBeEnabled();
    await expect(button).not.toHaveAttribute('data-loading');
    expect(await setAsideSavedFlags(page)).toEqual([0, 0, 0]);
    expect(await sealedFileWritten(page)).toBeUndefined();
    await expect(setAsideBanner(page).getByText('Did the file save?')).toHaveCount(0);
  });
});
