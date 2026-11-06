/**
 * E2E Tests for records HemoIO cannot open with the session key
 *
 * Feature: features/unreadable-records.feature
 */

import { test, expect } from '@playwright/test';
import { completeSetup, openSettingsTab, setupOrUnlock, unlockApp } from './steps/app.steps';
import { seedLabData } from './steps/data.steps';
import { readStoredRows } from './steps/dataAtRest.steps';
import { goToTimeline, labResultCards } from './steps/timeline.steps';
import {
  forgetCredentials,
  restoreCredentials,
  saveCredentials,
  seedUnreadableRecords,
  setAsideRowCount,
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
