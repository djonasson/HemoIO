/**
 * E2E Tests for Settings Page
 *
 * Tests the settings page including:
 * - Display settings (theme, date format)
 * - AI Configuration (provider, API key)
 * - Personal Targets
 * - Data management (backup/restore)
 */

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import { setupOrUnlock, unlockApp } from './steps/app.steps';
import { SEED_LAB_RESULTS, SEED_TEST_VALUES, seedLabData } from './steps/data.steps';
import {
  configureAnthropic,
  mockAnthropicApi,
  selectModel,
} from './steps/aiModelSelection.steps';

/**
 * Helper to navigate to settings page
 */
async function navigateToSettings(page: Page) {
  await page.locator('nav').getByText('Settings', { exact: true }).click();
}

function glucoseTargetRow(page: Page) {
  return page.getByRole('row').filter({ has: page.getByText('Glucose', { exact: true }) });
}

/**
 * Set a personal target range for Glucose from the Personal Targets tab
 */
async function setGlucoseTarget(page: Page, low: string, high: string) {
  await page.getByRole('tab', { name: /Personal Targets/i }).click();
  await page.getByRole('textbox', { name: 'Search biomarkers' }).fill('Glucose');
  await page.getByRole('button', { name: 'Set personal target for Glucose', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Set Personal Target for Glucose', exact: true });
  await dialog.getByRole('textbox', { name: 'Personal target low value' }).fill(low);
  await dialog.getByRole('textbox', { name: 'Personal target high value' }).fill(high);
  await dialog.getByRole('button', { name: 'Save Target' }).click();
  await expect(dialog).toBeHidden();
}

test.describe('Settings Page', () => {
  test.describe('Navigation', () => {
    test('should display settings page when navigating to Settings', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Should see the Settings title
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    });

    test('should display all settings tabs', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Should see all tabs
      await expect(page.getByRole('tab', { name: /Data/i })).toBeVisible();
      await expect(page.getByRole('tab', { name: /AI Configuration/i })).toBeVisible();
      await expect(page.getByRole('tab', { name: /Display/i })).toBeVisible();
      await expect(page.getByRole('tab', { name: /Personal Targets/i })).toBeVisible();
    });
  });

  test.describe('Display Settings', () => {
    test('should show theme selection options', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Click on Display tab
      await page.getByRole('tab', { name: /Display/i }).click();

      // Should see theme section with label
      await expect(page.getByText('Theme').first()).toBeVisible();

      // SegmentedControl has visible labels we can check for
      await expect(page.locator('text=Light').first()).toBeVisible();
      await expect(page.locator('text=Dark').first()).toBeVisible();
      await expect(page.locator('text=System').first()).toBeVisible();
    });

    test('should show date format options', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Click on Display tab
      await page.getByRole('tab', { name: /Display/i }).click();

      // Should see date format section
      await expect(page.getByText(/Date Format/i).first()).toBeVisible();
    });

    test('should change theme to dark mode', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Click on Display tab
      await page.getByRole('tab', { name: /Display/i }).click();

      // Select dark theme - click the Dark label in the SegmentedControl
      await page.locator('.mantine-SegmentedControl-root').getByText('Dark').click();

      // Verify dark mode is applied
      await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'dark');
    });

    test('should change theme to light mode', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Click on Display tab
      await page.getByRole('tab', { name: /Display/i }).click();

      // Select light theme - click the Light label in the SegmentedControl
      await page.locator('.mantine-SegmentedControl-root').getByText('Light').click();

      // Verify light mode is applied
      await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'light');
    });

    test('theme preference should persist after reload', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Click on Display tab and set dark theme
      await page.getByRole('tab', { name: /Display/i }).click();
      await page.locator('.mantine-SegmentedControl-root').getByText('Dark').click();

      await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'dark');

      // Reload page
      await page.reload();
      await unlockApp(page);

      // Theme should still be dark
      await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'dark');
    });
  });

  test.describe('AI Configuration', () => {
    test('should show AI provider selection', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Click on AI Configuration tab
      await page.getByRole('tab', { name: /AI Configuration/i }).click();

      // Should see provider selection
      await expect(page.getByText(/Provider/i).first()).toBeVisible();
    });

    test('should show OpenAI option', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Click on AI Configuration tab
      await page.getByRole('tab', { name: /AI Configuration/i }).click();

      // Should see OpenAI option
      await expect(page.getByText(/OpenAI/i).first()).toBeVisible();
    });

    test('should show Anthropic option in provider dropdown', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Click on AI Configuration tab
      await page.getByRole('tab', { name: /AI Configuration/i }).click();

      // Click the provider dropdown to open it (find by current value)
      await page.locator('input[aria-label="Select AI provider"]').click();

      // Should see Anthropic option in dropdown
      await expect(page.getByRole('option', { name: /Anthropic/i })).toBeVisible();
    });

    test('should show Ollama option in provider dropdown', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Click on AI Configuration tab
      await page.getByRole('tab', { name: /AI Configuration/i }).click();

      // Click the provider dropdown to open it
      await page.locator('input[aria-label="Select AI provider"]').click();

      // Should see Ollama option in dropdown
      await expect(page.getByRole('option', { name: /Ollama/i })).toBeVisible();
    });

    test('should show API key input for OpenAI', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Click on AI Configuration tab
      await page.getByRole('tab', { name: /AI Configuration/i }).click();

      // OpenAI is the default, should see API key section
      await expect(page.getByText('API Key', { exact: true })).toBeVisible();
      // The password input has aria-label="API key"
      await expect(page.locator('input[aria-label="API key"]')).toBeVisible();
    });

    test('should not require API key for Ollama', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Click on AI Configuration tab
      await page.getByRole('tab', { name: /AI Configuration/i }).click();

      // Select Ollama from the dropdown
      await page.locator('input[aria-label="Select AI provider"]').click();
      await page.getByRole('option', { name: /Ollama/i }).click();

      // API key section should not be visible for Ollama
      // Instead, we should see Ollama-specific content - use specific text match
      await expect(page.getByText('Ollama runs AI models locally')).toBeVisible({ timeout: 10000 });

      // API Key label should not be visible
      await expect(page.locator('input[aria-label="API key"]')).not.toBeVisible();
    });

    test('should mask API key after saving', async ({ page }) => {
      await mockAnthropicApi(page);
      await page.goto('/');
      await setupOrUnlock(page);
      // Saves the key "sk-ant-test-0000000000000000000000"
      await configureAnthropic(page);

      await expect(page.getByText('Configured', { exact: true })).toBeVisible();
      await expect(page.getByText('••••••••0000')).toBeVisible();
      await expect(page.locator('input[aria-label="API key"]')).toHaveCount(0);
      await expect(page.getByText(/sk-ant-test/)).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Update API Key' })).toBeVisible();
    });

    test('should test AI connection', async ({ page }) => {
      await mockAnthropicApi(page);
      await page.goto('/');
      await setupOrUnlock(page);
      await configureAnthropic(page);
      await selectModel(page, 'claude-sonnet-5-5');

      await page.getByRole('button', { name: 'Test Connection' }).click();

      await expect(page.getByText('Connection successful! Your API key is working.')).toBeVisible();
    });
  });

  test.describe('Personal Targets', () => {
    test('should show personal targets tab', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Click on Personal Targets tab
      await page.getByRole('tab', { name: /Personal Targets/i }).click();

      // Should see personal targets section
      await expect(page.getByText(/Personal Targets/i).first()).toBeVisible();
    });

    test('should display list of biomarkers', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Click on Personal Targets tab
      await page.getByRole('tab', { name: /Personal Targets/i }).click();

      // Should see some biomarkers in the list (e.g., Glucose)
      await expect(page.getByText(/Glucose/i).first()).toBeVisible({ timeout: 10000 });
    });

    test('should allow setting personal target for a biomarker', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);
      await setGlucoseTarget(page, '80', '95');

      const glucoseRow = glucoseTargetRow(page);
      await expect(glucoseRow.getByText('80 - 95')).toBeVisible();

      // The target is persisted, not just held in component state
      await page.reload();
      await unlockApp(page);
      await navigateToSettings(page);
      await page.getByRole('tab', { name: /Personal Targets/i }).click();
      await page.getByRole('textbox', { name: 'Search biomarkers' }).fill('Glucose');
      await expect(
        glucoseTargetRow(page).getByText('80 - 95')
      ).toBeVisible();
    });

    test('should allow clearing personal target', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);
      await setGlucoseTarget(page, '80', '95');

      await page.getByRole('button', { name: 'Clear personal target for Glucose', exact: true }).click();

      const glucoseRow = glucoseTargetRow(page);
      await expect(glucoseRow.getByText('Using standard')).toBeVisible();
      await expect(glucoseRow.getByText('80 - 95')).toHaveCount(0);
    });
  });

  test.describe('Data Management', () => {
    test('should show data tab by default', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Data tab should be selected by default
      await expect(page.getByRole('tab', { name: /Data/i, selected: true })).toBeVisible();
    });

    test('should show backup/restore section', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Should see backup/restore options
      await expect(page.getByText(/backup|export/i).first()).toBeVisible();
    });

    test('should have create backup button', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Should have a backup button
      await expect(
        page.getByRole('button', { name: /backup|export|download/i }).first()
      ).toBeVisible();
    });

    test('should download backup file when clicking export', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await seedLabData(page);
      await navigateToSettings(page);

      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Create Backup' }).click();
      const download = await downloadPromise;

      expect(download.suggestedFilename()).toMatch(/^hemoio-backup-.*\.json$/);
      const backup = JSON.parse(fs.readFileSync(await download.path(), 'utf-8'));
      expect(backup.labResults).toHaveLength(SEED_LAB_RESULTS.length);
      expect(backup.testValues).toHaveLength(SEED_TEST_VALUES.length);
    });

    test('should restore from backup file', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);

      // Restores through Settings and lands on the timeline
      await seedLabData(page);

      const main = page.getByRole('main');
      await expect(main.getByText('Quest Diagnostics')).toBeVisible();
      await expect(main.getByText('LabCorp')).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('settings tabs should be keyboard accessible', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Tab to the tabs list
      const dataTab = page.getByRole('tab', { name: /Data/i });
      await dataTab.focus();

      // Press arrow right to move to next tab
      await page.keyboard.press('ArrowRight');

      // Security tab, right after Data, should be focused
      await expect(page.getByRole('tab', { name: 'Security' })).toBeFocused();
    });

    test('should have accessible labels on form fields', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Navigate to AI Configuration tab
      await page.getByRole('tab', { name: /AI Configuration/i }).click();

      // AI provider dropdown should have accessible label
      const providerSelect = page.locator('input[aria-label="Select AI provider"]');
      await expect(providerSelect).toBeVisible();

      // Navigate to Display tab
      await page.getByRole('tab', { name: /Display/i }).click();

      // SegmentedControl should have an aria-label
      const themeControl = page.locator('[aria-label="Select theme"]');
      await expect(themeControl).toBeVisible();

      // Date format select should have accessible label
      const dateFormatSelect = page.locator('input[aria-label="Select date format"]');
      await expect(dateFormatSelect).toBeVisible();
    });
  });
});
