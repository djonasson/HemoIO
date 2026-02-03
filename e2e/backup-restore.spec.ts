/**
 * E2E Tests for Backup and Restore Functionality
 *
 * Tests the backup and restore functionality including:
 * - Backup creation from settings
 * - Restore with confirmation
 * - File validation
 * - Data replacement
 */

import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// ES module compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test data constants
const TEST_PASSWORD = 'TestPassword123!';

// Mock lab result data for backup file
const MOCK_LAB_RESULTS = [
  {
    id: 1,
    date: '2024-01-15T10:00:00.000Z',
    labName: 'Quest Diagnostics',
    notes: 'Annual checkup',
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:00:00.000Z',
  },
  {
    id: 2,
    date: '2024-02-20T14:30:00.000Z',
    labName: 'LabCorp',
    notes: 'Follow-up test',
    createdAt: '2024-02-20T14:30:00.000Z',
    updatedAt: '2024-02-20T14:30:00.000Z',
  },
];

const MOCK_TEST_VALUES = [
  {
    id: 1,
    labResultId: 1,
    biomarkerId: 1,
    value: 14.5,
    unit: 'g/dL',
    referenceRangeLow: 12.0,
    referenceRangeHigh: 17.5,
    confidence: 0.95,
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:00:00.000Z',
  },
  {
    id: 2,
    labResultId: 1,
    biomarkerId: 2,
    value: 125,
    unit: 'mg/dL',
    referenceRangeLow: 70,
    referenceRangeHigh: 100,
    confidence: 0.92,
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:00:00.000Z',
  },
  {
    id: 3,
    labResultId: 2,
    biomarkerId: 1,
    value: 15.0,
    unit: 'g/dL',
    referenceRangeLow: 12.0,
    referenceRangeHigh: 17.5,
    confidence: 0.98,
    createdAt: '2024-02-20T14:30:00.000Z',
    updatedAt: '2024-02-20T14:30:00.000Z',
  },
];

const MOCK_USER_NOTES = [
  {
    id: 1,
    labResultId: 1,
    content: 'Glucose was slightly elevated, need to watch diet',
    tags: ['diet', 'glucose'],
    createdAt: '2024-01-16T09:00:00.000Z',
    updatedAt: '2024-01-16T09:00:00.000Z',
  },
];

// Valid backup file content
function createValidBackupData() {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    appVersion: '1.0.0',
    labResults: MOCK_LAB_RESULTS,
    testValues: MOCK_TEST_VALUES,
    userNotes: MOCK_USER_NOTES,
    userPreferences: null,
    settings: null,
  };
}

// Test encrypted backup password
const ENCRYPTED_BACKUP_PASSWORD = 'SecureBackup123!';

/**
 * Helper to complete first-run setup
 */
async function completeSetup(page: Page, password: string = TEST_PASSWORD) {
  await page.getByPlaceholder(/enter your password/i).fill(password);
  await page.getByPlaceholder(/confirm your password/i).fill(password);
  await page.getByRole('button', { name: 'Go to next step' }).click();

  // Skip storage setup (use local)
  await page.getByRole('button', { name: 'Go to next step' }).click();

  // Skip AI setup (just proceed without configuring)
  await page.getByRole('button', { name: 'Go to next step' }).click();

  // Complete setup on the final step
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
 * Helper to navigate to settings
 */
async function navigateToSettings(page: Page) {
  // Use nav text selector for more reliable selection
  await page.locator('nav').getByText('Settings', { exact: true }).click();
}

/**
 * Helper to create a temporary backup file
 */
function createBackupFile(
  content: object,
  filename: string = 'test-backup.json'
): string {
  const tempDir = path.join(__dirname, '..', 'test-results', 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const filePath = path.join(tempDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
  return filePath;
}

/**
 * Helper to cleanup temp file
 */
function cleanupBackupFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Helper to upload a backup file reliably (handles browser timing differences)
 */
async function uploadBackupFile(page: Page, backupPath: string) {
  const fileInput = page.locator('input[type="file"]');
  // Wait for file input to be attached and visible
  await fileInput.waitFor({ state: 'attached', timeout: 5000 });
  await fileInput.setInputFiles(backupPath);
}

test.describe('Backup & Restore Settings', () => {
  test.describe('Settings Page Navigation', () => {
    test('should navigate to settings page', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    });

    test('should show Data tab with backup/restore section', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      await expect(page.getByRole('tab', { name: /data/i })).toBeVisible();
      await expect(page.getByText('Backup & Restore')).toBeVisible();
    });

    test('should show settings tabs', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      await expect(page.getByRole('tab', { name: /data/i })).toBeVisible();
      await expect(
        page.getByRole('tab', { name: /ai configuration/i })
      ).toBeVisible();
      await expect(page.getByRole('tab', { name: /display/i })).toBeVisible();
    });
  });

  test.describe('Backup Section UI', () => {
    test('should show create backup section', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Use heading text selector to avoid matching button label
      await expect(page.getByText('Create Backup').first()).toBeVisible();
      await expect(
        page.getByRole('button', { name: /create backup/i })
      ).toBeVisible();
    });

    test('should show restore section', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      await expect(page.getByText('Restore from Backup')).toBeVisible();
    });

    test('should show warning when no data to backup', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      await expect(
        page.getByText(/don't have any data to backup/i)
      ).toBeVisible();
    });

    test('should disable create backup button when no data', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      await expect(
        page.getByRole('button', { name: /create backup/i })
      ).toBeDisabled();
    });

    test('should show file input for restore', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      await expect(page.getByText('Select backup file')).toBeVisible();
    });
  });

  test.describe('Tab Navigation', () => {
    test('should switch to AI Configuration tab', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      await page.getByRole('tab', { name: /ai configuration/i }).click();

      await expect(page.getByText(/configure your ai provider/i)).toBeVisible();
    });

    test('should switch to Display tab', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      await page.getByRole('tab', { name: /display/i }).click();

      await expect(page.getByText(/theme/i)).toBeVisible();
    });

    test('should return to Data tab', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      await page.getByRole('tab', { name: /display/i }).click();
      await page.getByRole('tab', { name: /data/i }).click();

      await expect(page.getByText('Backup & Restore')).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('settings tabs should be keyboard navigable', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      await page.getByRole('tab', { name: /data/i }).focus();
      await page.keyboard.press('ArrowRight');

      await expect(
        page.getByRole('tab', { name: /ai configuration/i })
      ).toBeFocused();
    });
  });
});

test.describe('Restore Flow', () => {
  test('should show restore dialog when selecting valid backup file', async ({
    page,
  }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    await navigateToSettings(page);

    // Create a valid backup file
    const backupPath = createBackupFile(createValidBackupData());

    try {
      // Upload the backup file using the hidden file input
      await uploadBackupFile(page, backupPath);

      // Restore dialog should appear with "Restore from Backup" title
      await expect(
        page.getByRole('heading', { name: 'Restore from Backup' })
      ).toBeVisible({ timeout: 10000 });
    } finally {
      cleanupBackupFile(backupPath);
    }
  });

  test('should show backup contents in restore dialog', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    await navigateToSettings(page);

    const backupPath = createBackupFile(createValidBackupData());

    try {
      await uploadBackupFile(page, backupPath);

      // Wait for the modal to appear first with longer timeout for CI
      await expect(
        page.getByRole('heading', { name: 'Restore from Backup' })
      ).toBeVisible({ timeout: 15000 });

      // Wait for modal content to be fully rendered
      await page.waitForTimeout(500);

      // Should show backup summary - the modal shows "2 lab results, 3 test values, 1 note"
      await expect(page.getByText(/2 lab result/i)).toBeVisible();
      await expect(page.getByText(/3 test value/i)).toBeVisible();
      await expect(page.getByText(/1 note/i)).toBeVisible();
    } finally {
      cleanupBackupFile(backupPath);
    }
  });

  test('should restore data after confirmation', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    await navigateToSettings(page);

    const backupPath = createBackupFile(createValidBackupData());

    try {
      await uploadBackupFile(page, backupPath);

      // Wait for modal to be fully visible
      const modalHeading = page.getByRole('heading', { name: 'Restore from Backup' });
      await expect(modalHeading).toBeVisible();

      // Wait a bit for modal animation to complete
      await page.waitForTimeout(300);

      // Click the Restore button in the modal (it's inside the dialog)
      const restoreButton = page.locator('.mantine-Modal-content').getByRole('button', { name: 'Restore' });
      await restoreButton.click();

      // Wait for restore to complete - should show notification and navigate to timeline
      await expect(page.getByText(/Restore Complete/i)).toBeVisible({
        timeout: 10000,
      });
    } finally {
      cleanupBackupFile(backupPath);
    }
  });

  test('should cancel restore when clicking cancel', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    await navigateToSettings(page);

    const backupPath = createBackupFile(createValidBackupData());

    try {
      await uploadBackupFile(page, backupPath);

      // Wait for modal
      await expect(
        page.getByRole('heading', { name: 'Restore from Backup' })
      ).toBeVisible({ timeout: 10000 });

      // Click cancel
      await page.getByRole('button', { name: /cancel/i }).click();

      // Modal should close - heading should not be visible
      await expect(
        page.getByRole('heading', { name: 'Restore from Backup' })
      ).not.toBeVisible();
    } finally {
      cleanupBackupFile(backupPath);
    }
  });

  test('should show error for invalid backup file structure', async ({
    page,
  }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    await navigateToSettings(page);

    // Create an invalid backup file (missing required fields)
    const invalidBackup = {
      notABackup: true,
      someOtherField: 'value',
    };
    const backupPath = createBackupFile(invalidBackup, 'invalid-backup.json');

    try {
      await uploadBackupFile(page, backupPath);

      // Should show error message (detectBackupType returns "Unrecognized backup file format")
      await expect(page.getByText(/unrecognized backup file format/i)).toBeVisible();
    } finally {
      cleanupBackupFile(backupPath);
    }
  });

  test('should show error for corrupted JSON file', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    await navigateToSettings(page);

    // Create a corrupted backup file (invalid JSON)
    const tempDir = path.join(__dirname, '..', 'test-results', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const backupPath = path.join(tempDir, 'corrupted-backup.json');
    fs.writeFileSync(backupPath, '{ this is not valid JSON }}}');

    try {
      await uploadBackupFile(page, backupPath);

      // Should show error message about invalid JSON
      await expect(page.getByText(/invalid json/i)).toBeVisible();
    } finally {
      cleanupBackupFile(backupPath);
    }
  });

  test('should navigate to timeline after successful restore', async ({
    page,
  }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    await navigateToSettings(page);

    const backupPath = createBackupFile(createValidBackupData());

    try {
      await uploadBackupFile(page, backupPath);

      await expect(
        page.getByRole('heading', { name: 'Restore from Backup' })
      ).toBeVisible({ timeout: 10000 });

      // Wait for modal animation
      await page.waitForTimeout(300);

      // Click restore button in modal
      const restoreButton = page.locator('.mantine-Modal-content').getByRole('button', { name: 'Restore' });
      await restoreButton.click();

      // Wait for navigation to timeline - check for timeline heading
      await expect(page.getByPlaceholder('Search by lab name')).toBeVisible({
        timeout: 10000,
      });
    } finally {
      cleanupBackupFile(backupPath);
    }
  });
});

test.describe('Backup with Data', () => {
  // These tests require seeded data through the app's encrypted database layer.
  // Since we can't easily seed the encrypted database from tests, we use the
  // restore flow to seed data first, then test backup.

  test('should enable backup button after restoring data', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    await navigateToSettings(page);

    // First restore some data
    const backupPath = createBackupFile(createValidBackupData());

    try {
      await uploadBackupFile(page, backupPath);

      // Wait for modal animation
      await page.waitForTimeout(300);

      // Click restore button in modal
      const restoreButton = page.locator('.mantine-Modal-content').getByRole('button', { name: 'Restore' });
      await restoreButton.click();

      // Wait for navigation to timeline (restore navigates there on success)
      await expect(page.getByPlaceholder('Search by lab name')).toBeVisible({
        timeout: 10000,
      });

      // Navigate back to settings
      await navigateToSettings(page);

      // Now the backup button should be enabled
      await expect(
        page.getByRole('button', { name: /create backup/i })
      ).toBeEnabled();
    } finally {
      cleanupBackupFile(backupPath);
    }
  });

  test('should show data counts after restoring data', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    await navigateToSettings(page);

    // First restore some data
    const backupPath = createBackupFile(createValidBackupData());

    try {
      await uploadBackupFile(page, backupPath);

      // Wait for the modal to appear
      await expect(
        page.getByRole('heading', { name: 'Restore from Backup' })
      ).toBeVisible({ timeout: 10000 });

      // Wait for modal animation
      await page.waitForTimeout(300);

      // Click restore button in modal
      const restoreButton = page.locator('.mantine-Modal-content').getByRole('button', { name: 'Restore' });
      await restoreButton.click();

      // Wait for navigation to timeline (restore navigates there on success)
      await expect(page.getByPlaceholder('Search by lab name')).toBeVisible({
        timeout: 10000,
      });

      // Navigate back to settings
      await navigateToSettings(page);

      // Should show data counts in the backup section
      await expect(page.getByText(/2 lab result/i)).toBeVisible();
      await expect(page.getByText(/3 test value/i)).toBeVisible();
    } finally {
      cleanupBackupFile(backupPath);
    }
  });

  test('should download backup file when clicking create backup', async ({
    page,
  }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    await navigateToSettings(page);

    // First restore some data
    const backupPath = createBackupFile(createValidBackupData());

    try {
      await uploadBackupFile(page, backupPath);

      // Wait for modal animation
      await page.waitForTimeout(300);

      // Click restore button in modal
      const restoreButton = page.locator('.mantine-Modal-content').getByRole('button', { name: 'Restore' });
      await restoreButton.click();

      // Wait for navigation to timeline (restore navigates there on success)
      await expect(page.getByPlaceholder('Search by lab name')).toBeVisible({
        timeout: 10000,
      });

      // Navigate back to settings
      await navigateToSettings(page);

      // Set up download listener
      const downloadPromise = page.waitForEvent('download');

      // Click create backup
      await page.getByRole('button', { name: /create backup/i }).click();

      // Wait for download
      const download = await downloadPromise;

      // Verify filename format
      expect(download.suggestedFilename()).toMatch(/hemoio-backup-.*\.json/);
    } finally {
      cleanupBackupFile(backupPath);
    }
  });
});

test.describe('Encrypted Backup', () => {
  // Helper to click the Encrypted option in the segmented control
  async function selectEncryptedBackupType(page: Page) {
    // The segmented control has labels inside, use the label with exact match
    await page.locator('.mantine-SegmentedControl-root').getByText('Encrypted', { exact: true }).click();
  }

  test.describe('Backup Type Selection', () => {
    test('should show backup type selector', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Should see the segmented control with Standard and Encrypted options
      const segmentedControl = page.locator('.mantine-SegmentedControl-root');
      await expect(segmentedControl.getByText('Standard', { exact: true })).toBeVisible();
      await expect(segmentedControl.getByText('Encrypted', { exact: true })).toBeVisible();
    });

    test('should show different descriptions for each backup type', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // First restore some data so segmented control is enabled
      const backupPath = createBackupFile(createValidBackupData());
      try {
        await uploadBackupFile(page, backupPath);
        await expect(
          page.getByRole('heading', { name: 'Restore from Backup' })
        ).toBeVisible({ timeout: 10000 });
        await page.waitForTimeout(300);
        const restoreButton = page.locator('.mantine-Modal-content').getByRole('button', { name: 'Restore' });
        await restoreButton.click();
        await expect(page.getByPlaceholder('Search by lab name')).toBeVisible({ timeout: 10000 });
        await navigateToSettings(page);

        // Standard description should mention no API keys
        await expect(page.getByText(/does not include api keys/i)).toBeVisible();

        // Switch to encrypted
        await selectEncryptedBackupType(page);

        // Encrypted description should mention password protection and API keys
        await expect(page.getByText(/password-protected.*includes api keys/i)).toBeVisible();
      } finally {
        cleanupBackupFile(backupPath);
      }
    });

    test('should change button text when selecting encrypted backup', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // First restore some data so button is enabled
      const backupPath = createBackupFile(createValidBackupData());
      try {
        await uploadBackupFile(page, backupPath);
        await page.waitForTimeout(300);
        const restoreButton = page.locator('.mantine-Modal-content').getByRole('button', { name: 'Restore' });
        await restoreButton.click();
        await expect(page.getByPlaceholder('Search by lab name')).toBeVisible({ timeout: 10000 });
        await navigateToSettings(page);

        // Initially shows "Create Backup"
        await expect(page.getByRole('button', { name: 'Create Backup' })).toBeVisible();

        // Switch to encrypted
        await selectEncryptedBackupType(page);

        // Should show "Create Encrypted Backup"
        await expect(page.getByRole('button', { name: 'Create Encrypted Backup' })).toBeVisible();
      } finally {
        cleanupBackupFile(backupPath);
      }
    });
  });

  test.describe('Encrypted Backup Creation', () => {
    test('should show password modal when creating encrypted backup', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // First restore some data so button is enabled
      const backupPath = createBackupFile(createValidBackupData());
      try {
        await uploadBackupFile(page, backupPath);
        await page.waitForTimeout(300);
        const restoreButton = page.locator('.mantine-Modal-content').getByRole('button', { name: 'Restore' });
        await restoreButton.click();
        await expect(page.getByPlaceholder('Search by lab name')).toBeVisible({ timeout: 10000 });
        await navigateToSettings(page);

        // Switch to encrypted
        await selectEncryptedBackupType(page);

        // Click create encrypted backup
        await page.getByRole('button', { name: 'Create Encrypted Backup' }).click();

        // Should show password modal
        await expect(page.getByRole('heading', { name: 'Set Backup Password' })).toBeVisible();
        await expect(page.getByRole('textbox', { name: 'Backup Password' })).toBeVisible();
        await expect(page.getByRole('textbox', { name: 'Confirm Password' })).toBeVisible();
      } finally {
        cleanupBackupFile(backupPath);
      }
    });

    test('should show password strength indicator', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // First restore some data
      const backupPath = createBackupFile(createValidBackupData());
      try {
        await uploadBackupFile(page, backupPath);
        await page.waitForTimeout(300);
        const restoreButton = page.locator('.mantine-Modal-content').getByRole('button', { name: 'Restore' });
        await restoreButton.click();
        await expect(page.getByPlaceholder('Search by lab name')).toBeVisible({ timeout: 10000 });
        await navigateToSettings(page);

        await selectEncryptedBackupType(page);
        await page.getByRole('button', { name: 'Create Encrypted Backup' }).click();

        // Type a weak password
        await page.getByRole('textbox', { name: 'Backup Password' }).fill('weak');

        // Should show strength indicators
        await expect(page.getByText('At least 8 characters')).toBeVisible();
        await expect(page.getByText('Uppercase letter')).toBeVisible();
        await expect(page.getByText('Lowercase letter')).toBeVisible();
        await expect(page.getByText('Number')).toBeVisible();
        await expect(page.getByText('Special character')).toBeVisible();
      } finally {
        cleanupBackupFile(backupPath);
      }
    });

    test('should show password mismatch error', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // First restore some data
      const backupPath = createBackupFile(createValidBackupData());
      try {
        await uploadBackupFile(page, backupPath);
        await page.waitForTimeout(300);
        const restoreButton = page.locator('.mantine-Modal-content').getByRole('button', { name: 'Restore' });
        await restoreButton.click();
        await expect(page.getByPlaceholder('Search by lab name')).toBeVisible({ timeout: 10000 });
        await navigateToSettings(page);

        await selectEncryptedBackupType(page);
        await page.getByRole('button', { name: 'Create Encrypted Backup' }).click();

        // Enter mismatched passwords
        await page.getByRole('textbox', { name: 'Backup Password' }).fill(ENCRYPTED_BACKUP_PASSWORD);
        await page.getByRole('textbox', { name: 'Confirm Password' }).fill('DifferentPassword123!');
        await page.getByRole('textbox', { name: 'Confirm Password' }).blur();

        // Should show mismatch error
        await expect(page.getByText('Passwords do not match')).toBeVisible();
      } finally {
        cleanupBackupFile(backupPath);
      }
    });

    test('should download encrypted backup with valid password', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // First restore some data
      const backupPath = createBackupFile(createValidBackupData());
      try {
        await uploadBackupFile(page, backupPath);
        await page.waitForTimeout(300);
        const restoreButton = page.locator('.mantine-Modal-content').getByRole('button', { name: 'Restore' });
        await restoreButton.click();
        await expect(page.getByPlaceholder('Search by lab name')).toBeVisible({ timeout: 10000 });
        await navigateToSettings(page);

        await selectEncryptedBackupType(page);
        await page.getByRole('button', { name: 'Create Encrypted Backup' }).click();

        // Enter valid matching passwords
        await page.getByRole('textbox', { name: 'Backup Password' }).fill(ENCRYPTED_BACKUP_PASSWORD);
        await page.getByRole('textbox', { name: 'Confirm Password' }).fill(ENCRYPTED_BACKUP_PASSWORD);

        // Set up download listener
        const downloadPromise = page.waitForEvent('download');

        // Click create encrypted backup in modal
        await page.locator('.mantine-Modal-content').getByRole('button', { name: 'Create Encrypted Backup' }).click();

        // Wait for download
        const download = await downloadPromise;

        // Verify filename has .hemoio extension
        expect(download.suggestedFilename()).toMatch(/hemoio-backup-.*\.hemoio/);
      } finally {
        cleanupBackupFile(backupPath);
      }
    });
  });

  test.describe('File Input Acceptance', () => {
    test('should accept both .json and .hemoio files', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Check the accept attribute of the file input
      const fileInput = page.locator('input[type="file"]');
      const acceptAttribute = await fileInput.getAttribute('accept');
      expect(acceptAttribute).toContain('.json');
      expect(acceptAttribute).toContain('.hemoio');
    });

    test('should show placeholder mentioning both file types', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      await expect(page.getByText(/\.json or \.hemoio/i)).toBeVisible();
    });
  });
});
