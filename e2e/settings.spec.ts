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

// Test data constants
const TEST_PASSWORD = 'TestPassword123!';

/**
 * Helper to complete first-run setup
 */
async function completeSetup(page: Page, password: string = TEST_PASSWORD) {
  await page.getByPlaceholder(/enter your password/i).fill(password);
  await page.getByPlaceholder(/confirm your password/i).fill(password);
  await page.getByRole('button', { name: 'Go to next step' }).click();
  await page.getByRole('button', { name: 'Go to next step' }).click();
  await page.getByRole('button', { name: 'Go to next step' }).click();
  await page.getByRole('button', { name: 'Complete setup and get started' }).click();
}

/**
 * Helper to unlock the application
 */
async function unlockApp(page: Page, password: string = TEST_PASSWORD) {
  await page.getByRole('textbox', { name: /password/i }).fill(password);
  await page.getByRole('button', { name: /unlock/i }).click();
}

/**
 * Helper to detect if app needs setup or just unlock
 */
async function isSetupNeeded(page: Page): Promise<boolean> {
  const hasSetupStepper = await page
    .locator('.mantine-Stepper-root')
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  const hasSetupText = await page
    .getByText(/set up your password|create.*password/i)
    .isVisible({ timeout: 500 })
    .catch(() => false);
  return hasSetupStepper || hasSetupText;
}

/**
 * Helper to setup or unlock as needed
 */
async function setupOrUnlock(page: Page, password: string = TEST_PASSWORD) {
  const needsSetup = await isSetupNeeded(page);
  if (needsSetup) {
    await completeSetup(page, password);
  } else {
    await unlockApp(page, password);
  }
}

/**
 * Helper to navigate to settings page
 */
async function navigateToSettings(page: Page) {
  await page.locator('nav').getByText('Settings', { exact: true }).click();
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

      // Wait for theme to apply
      await page.waitForTimeout(500);

      // Verify dark mode is applied (check for dark color scheme)
      const colorScheme = await page.evaluate(() => {
        return document.documentElement.getAttribute('data-mantine-color-scheme');
      });
      expect(colorScheme).toBe('dark');
    });

    test('should change theme to light mode', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Click on Display tab
      await page.getByRole('tab', { name: /Display/i }).click();

      // Select light theme - click the Light label in the SegmentedControl
      await page.locator('.mantine-SegmentedControl-root').getByText('Light').click();

      // Wait for theme to apply
      await page.waitForTimeout(500);

      // Verify light mode is applied
      const colorScheme = await page.evaluate(() => {
        return document.documentElement.getAttribute('data-mantine-color-scheme');
      });
      expect(colorScheme).toBe('light');
    });

    test('theme preference should persist after reload', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Click on Display tab and set dark theme
      await page.getByRole('tab', { name: /Display/i }).click();
      await page.locator('.mantine-SegmentedControl-root').getByText('Dark').click();

      // Wait for theme to apply and localStorage to be saved
      await page.waitForTimeout(500);

      // Reload page
      await page.reload();
      await unlockApp(page);

      // Theme should still be dark
      const colorScheme = await page.evaluate(() => {
        return document.documentElement.getAttribute('data-mantine-color-scheme');
      });
      expect(colorScheme).toBe('dark');
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

      // Wait for UI to update
      await page.waitForTimeout(1000);

      // API key section should not be visible for Ollama
      // Instead, we should see Ollama-specific content - use specific text match
      await expect(page.getByText('Ollama runs AI models locally')).toBeVisible({ timeout: 10000 });

      // API Key label should not be visible
      await expect(page.locator('input[aria-label="API key"]')).not.toBeVisible();
    });

    test.skip('should mask API key after saving', async () => {
      // Skip: Requires actual API key storage and display
    });

    test.skip('should test AI connection', async () => {
      // Skip: Requires network mocking for AI providers
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

    test.skip('should allow setting personal target for a biomarker', async () => {
      // Skip: Requires complex interaction with biomarker selection and input
    });

    test.skip('should allow clearing personal target', async () => {
      // Skip: Requires setting a target first
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

    test.skip('should download backup file when clicking export', async () => {
      // Skip: Requires download handling
    });

    test.skip('should restore from backup file', async () => {
      // Skip: Requires file upload and restore flow
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

      // AI Configuration tab should be focused
      await expect(page.getByRole('tab', { name: /AI Configuration/i })).toBeFocused();
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
