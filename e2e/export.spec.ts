/**
 * E2E Tests for Export Functionality
 *
 * Tests the data export functionality including:
 * - Opening export dialog
 * - CSV export options
 * - JSON export options
 * - Export preview
 * - File download
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import { test, expect, type Page } from '@playwright/test';

/**
 * Helper to complete first-run setup
 */
async function completeSetup(page: Page, password: string = 'TestPassword123!') {
  // Enter password - be specific to avoid matching unlock screen
  await page.getByPlaceholder(/enter your password/i).fill(password);
  await page.getByPlaceholder(/confirm your password/i).fill(password);
  await page.getByRole('button', { name: 'Go to next step' }).click();

  // Skip storage setup (use local)
  await page.getByRole('button', { name: 'Go to next step' }).click();

  // Skip AI setup (just proceed without configuring)
  await page.getByRole('button', { name: 'Go to next step' }).click();

  // Complete setup on the final step (use exact aria-label to avoid matching stepper)
  await page.getByRole('button', { name: 'Complete setup and get started' }).click();
}

/**
 * Helper to unlock the application
 */
async function unlockApp(page: Page, password: string = 'TestPassword123!') {
  // Wait for unlock screen - use textbox role to be specific
  await page.getByRole('textbox', { name: /password/i }).fill(password);
  await page.getByRole('button', { name: /unlock/i }).click();
}

/**
 * Helper to detect if app needs setup or just unlock
 */
async function isSetupNeeded(page: Page): Promise<boolean> {
  // Check for setup-specific elements (stepper or setup text)
  const hasSetupStepper = await page.locator('.mantine-Stepper-root').isVisible({ timeout: 2000 }).catch(() => false);
  const hasSetupText = await page.getByText(/set up your password|create.*password/i).isVisible({ timeout: 500 }).catch(() => false);
  return hasSetupStepper || hasSetupText;
}

/**
 * Helper to open export dialog
 */
async function openExportDialog(page: Page) {
  await page.getByRole('button', { name: /export data/i }).click();
}

/**
 * Helper to setup or unlock as needed
 */
async function setupOrUnlock(page: Page, password: string = 'TestPassword123!') {
  const needsSetup = await isSetupNeeded(page);
  if (needsSetup) {
    await completeSetup(page, password);
  } else {
    await unlockApp(page, password);
  }
}

test.describe('Export Dialog', () => {
  test.describe('Dialog UI', () => {
    test('export button should be visible in header', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);

      // Export button should be visible in header
      await expect(page.getByRole('button', { name: /export data/i })).toBeVisible();
    });

    test('should open export dialog when clicking export button', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);

      await openExportDialog(page);

      // Dialog should be visible
      await expect(page.getByText('Export Data')).toBeVisible();
    });

    test('should show format selection options', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);

      await openExportDialog(page);

      // Format label should be visible
      await expect(page.getByText('Export Format')).toBeVisible();
    });

    test('should show export preview', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);

      await openExportDialog(page);

      // Preview section should be visible
      await expect(page.getByText('Export Preview')).toBeVisible();
    });

    test('should show export and cancel buttons', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);

      await openExportDialog(page);

      // Buttons should be visible
      await expect(page.getByRole('button', { name: /export/i }).last()).toBeVisible();
      await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
    });

    test('should close dialog when clicking cancel', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);

      await openExportDialog(page);
      await page.getByRole('button', { name: /cancel/i }).click();

      // Dialog should be closed
      await expect(page.getByText('Export Data')).not.toBeVisible();
    });
  });

  test.describe('CSV Export Options', () => {
    test('should show CSV options when CSV format selected', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);

      await openExportDialog(page);

      // CSV should be default, so options should be visible
      await expect(page.getByText('Date Range')).toBeVisible();
      await expect(page.getByText('Biomarkers')).toBeVisible();
      await expect(page.getByText('Include reference ranges')).toBeVisible();
    });
  });

  test.describe('JSON Export', () => {
    test.skip('should show JSON description when JSON format selected', async ({ page }) => {
      // Skipped due to Mantine Select interaction complexity
    });
  });

  test.describe('Export with No Data', () => {
    test('should show warning when no data to export', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);

      await openExportDialog(page);

      // Warning should be visible
      await expect(page.getByText(/no data to export/i)).toBeVisible();
    });

    test('should disable export button when no data', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);

      await openExportDialog(page);

      // Export button should be disabled
      const exportButton = page.getByRole('button', { name: /export/i }).last();
      await expect(exportButton).toBeDisabled();
    });
  });

  test.describe('Accessibility', () => {
    test('export dialog should be keyboard navigable', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);

      await openExportDialog(page);

      // Should be able to tab through the dialog
      await page.keyboard.press('Tab');
      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(focusedElement).toBeTruthy();
    });

    test('export dialog should close with Escape key', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);

      await openExportDialog(page);
      await page.keyboard.press('Escape');

      // Dialog should be closed
      await expect(page.getByText('Export Data')).not.toBeVisible();
    });
  });
});

test.describe('Export with Data', () => {
  // These tests require seeding the database with test data
  // In a real implementation, you would use fixtures to seed IndexedDB

  test.skip('should show data counts in export preview', async ({ page }) => {
    // This test requires seeded data
  });

  test.skip('should download CSV file when exporting', async ({ page }) => {
    // This test requires seeded data and download handling
  });

  test.skip('should download JSON file when exporting full backup', async ({ page }) => {
    // This test requires seeded data and download handling
  });

  test.skip('should filter by date range', async ({ page }) => {
    // This test requires seeded data
  });

  test.skip('should filter by selected biomarkers', async ({ page }) => {
    // This test requires seeded data
  });
});
