/**
 * E2E Tests for records HemoIO cannot open with the session key
 *
 * Feature: features/unreadable-records.feature
 */

import { test, expect } from '@playwright/test';
import { openSettingsTab, setupOrUnlock, unlockApp } from './steps/app.steps';
import { seedLabData } from './steps/data.steps';
import { readStoredRows } from './steps/dataAtRest.steps';
import { goToTimeline, labResultCards } from './steps/timeline.steps';
import {
  seedUnreadableRecords,
  setAsideRowCount,
  setAsideTables,
  storeUndecryptableApiKey,
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
