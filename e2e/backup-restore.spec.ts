/**
 * E2E Tests for Backup and Restore Functionality
 *
 * Tests the backup and restore functionality including:
 * - Backup creation from settings
 * - Restore with confirmation
 * - File validation
 * - Data replacement
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import * as fs from 'fs';
import { openFromMenu, openSettingsTab, setupOrUnlock } from './steps/app.steps';
import { SEED_LAB_RESULTS, seedLabData } from './steps/data.steps';
import { goToNotes, noteCards } from './steps/userNotes.steps';
import { goToTimeline, labResultCards } from './steps/timeline.steps';
import { configureAnthropic, mockAnthropicApi } from './steps/aiModelSelection.steps';
import { removeTempFile, writeTempFile } from './steps/tempFiles';
import { loginWithOllama } from './steps/importWizard.steps';

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
    biomarkerKey: '718-7',
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
    biomarkerKey: '2345-7',
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
    biomarkerKey: '718-7',
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
    schemaVersion: 4,
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
 * Helper to navigate to settings
 */
async function navigateToSettings(page: Page) {
  // Use nav text selector for more reliable selection
  await openFromMenu(page, 'Settings');
}

/**
 * Helper to create a temporary backup file
 */
function createBackupFile(
  content: object,
  filename: string = 'test-backup.json'
): string {
  return writeTempFile(filename, JSON.stringify(content, null, 2));
}

/**
 * Helper to cleanup temp file
 */
function cleanupBackupFile(filePath: string) {
  removeTempFile(filePath);
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
      await openSettingsTab(page, 'AI Configuration');

      await expect(page.getByText(/configure your ai provider/i)).toBeVisible();
    });

    test('should switch to Display tab', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await openSettingsTab(page, 'Display');

      await expect(page.getByText(/theme/i)).toBeVisible();
    });

    test('should return to Data tab', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await openSettingsTab(page, 'Display');
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

      // Security comes right after Data
      await expect(page.getByRole('tab', { name: 'Security' })).toBeFocused();
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


      // Should show backup summary - the modal shows "2 lab results, 3 test values, 1 note"
      const dialog = page.getByRole('dialog', { name: 'Restore from Backup' });
      await expect(dialog.getByText(/2 lab result/i)).toBeVisible();
      await expect(dialog.getByText(/3 test value/i)).toBeVisible();
      await expect(dialog.getByText(/1 note/i)).toBeVisible();
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


      // Click the Restore button in the modal (it's inside the dialog)
      const restoreButton = page.getByRole('dialog', { name: 'Restore from Backup' }).getByRole('button', { name: 'Restore' });
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
    const backupPath = writeTempFile('corrupted-backup.json', '{ this is not valid JSON }}}');

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


      // Click restore button in modal
      const restoreButton = page.getByRole('dialog', { name: 'Restore from Backup' }).getByRole('button', { name: 'Restore' });
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


      // Click restore button in modal
      const restoreButton = page.getByRole('dialog', { name: 'Restore from Backup' }).getByRole('button', { name: 'Restore' });
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


      // Click restore button in modal
      const restoreButton = page.getByRole('dialog', { name: 'Restore from Backup' }).getByRole('button', { name: 'Restore' });
      await restoreButton.click();

      // Wait for navigation to timeline (restore navigates there on success)
      await expect(page.getByPlaceholder('Search by lab name')).toBeVisible({
        timeout: 10000,
      });

      // Navigate back to settings
      await navigateToSettings(page);

      // Should show data counts in the backup section (not the restore notification)
      const main = page.getByRole('main');
      await expect(main.getByText(/2 lab result/i)).toBeVisible();
      await expect(main.getByText(/3 test value/i)).toBeVisible();
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


      // Click restore button in modal
      const restoreButton = page.getByRole('dialog', { name: 'Restore from Backup' }).getByRole('button', { name: 'Restore' });
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
        const restoreButton = page.getByRole('dialog', { name: 'Restore from Backup' }).getByRole('button', { name: 'Restore' });
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
        const restoreButton = page.getByRole('dialog', { name: 'Restore from Backup' }).getByRole('button', { name: 'Restore' });
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
        const restoreButton = page.getByRole('dialog', { name: 'Restore from Backup' }).getByRole('button', { name: 'Restore' });
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
        const restoreButton = page.getByRole('dialog', { name: 'Restore from Backup' }).getByRole('button', { name: 'Restore' });
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
        const restoreButton = page.getByRole('dialog', { name: 'Restore from Backup' }).getByRole('button', { name: 'Restore' });
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
        const restoreButton = page.getByRole('dialog', { name: 'Restore from Backup' }).getByRole('button', { name: 'Restore' });
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

test.describe('Backups from earlier versions', () => {
  // Scenario: An older backup is refused
  test('refuses a backup made before tests were identified by LOINC', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    // My data: one lab result the old backup does not have
    await seedLabData(page, { labResults: [{ ...SEED_LAB_RESULTS[0], labName: 'Own Clinic' }], testValues: [] });
    await navigateToSettings(page);
    const backupPath = createBackupFile({ ...createValidBackupData(), schemaVersion: 3 });

    try {
      await uploadBackupFile(page, backupPath);

      await expect(
        page.getByText(/made before tests were identified by LOINC and cannot be restored/i)
      ).toBeVisible();
      await expect(page.getByText(/re-import your reports instead/i)).toBeVisible();
      await expect(page.getByRole('dialog', { name: 'Restore from Backup' })).toBeHidden();

      // And my data should be unchanged
      await goToTimeline(page);
      await expect(labResultCards(page)).toHaveCount(1);
      await expect(labResultCards(page)).toContainText('Own Clinic');
    } finally {
      cleanupBackupFile(backupPath);
    }
  });

  // Scenario: A backup naming a test HemoIO does not know is refused
  test('refuses a backup whose values name a test by anything but a LOINC code', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    await navigateToSettings(page);
    const data = createValidBackupData();
    const backupPath = createBackupFile({
      ...data,
      testValues: data.testValues.map((tv) => ({ ...tv, biomarkerKey: 'glucose' })),
    });

    try {
      await uploadBackupFile(page, backupPath);

      await expect(page.getByText(/holds values of tests HemoIO does not know/i)).toBeVisible();
      await expect(page.getByRole('dialog', { name: 'Restore from Backup' })).toBeHidden();
    } finally {
      cleanupBackupFile(backupPath);
    }
  });
});

/**
 * On a fresh install: configure Anthropic with the default test key (ending
 * in "0000"), add data, and create an encrypted backup. Returns its path.
 */
async function createEncryptedBackupWithApiKey(page: Page): Promise<string> {
  await mockAnthropicApi(page);
  await page.goto('/');
  await setupOrUnlock(page);
  await configureAnthropic(page);
  await seedLabData(page);
  await openSettingsTab(page, 'Data');
  await page.locator('.mantine-SegmentedControl-root').getByText('Encrypted', { exact: true }).click();
  await page.getByRole('button', { name: 'Create Encrypted Backup' }).click();
  const exportDialog = page.getByRole('dialog');
  await exportDialog.getByRole('textbox', { name: 'Backup Password' }).fill(ENCRYPTED_BACKUP_PASSWORD);
  await exportDialog.getByRole('textbox', { name: 'Confirm Password' }).fill(ENCRYPTED_BACKUP_PASSWORD);
  const downloadPromise = page.waitForEvent('download');
  await exportDialog.getByRole('button', { name: 'Create Encrypted Backup' }).click();
  return writeTempFile('restore.hemoio', fs.readFileSync(await (await downloadPromise).path()));
}

/**
 * Open the restore dialog for an encrypted backup on `page` (already unlocked)
 */
async function openEncryptedRestore(page: Page, backupPath: string) {
  await openSettingsTab(page, 'Data');
  await page.locator('input[type="file"]').setInputFiles(backupPath);
  const passwordDialog = page.getByRole('dialog');
  await passwordDialog.getByRole('textbox', { name: 'Backup Password' }).fill(ENCRYPTED_BACKUP_PASSWORD);
  await passwordDialog.getByRole('button', { name: /Decrypt/ }).click();
  return page.getByRole('dialog', { name: 'Restore from Backup' });
}

test.describe('Encrypted backup restores the API key', () => {
  // Two devices each set up a password, then a backup is encrypted and
  // decrypted: several deliberately slow key derivations, which on a busy
  // machine outlast the default test timeout
  test.slow();

  test('keeps my own API key unless I choose to restore the backup\'s', async ({ page, browser }) => {
    const backupPath = await createEncryptedBackupWithApiKey(page);

    // Device B already has its own key, ending in "1111"
    const otherContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    try {
      const other = await otherContext.newPage();
      await mockAnthropicApi(other);
      await other.goto('/');
      await setupOrUnlock(other);
      await configureAnthropic(other, 'sk-ant-test-1111111111111111111111');

      const restoreDialog = await openEncryptedRestore(other, backupPath);
      const restoreAI = restoreDialog.getByRole('checkbox', { name: /restore AI configuration/i });
      await expect(restoreAI).not.toBeChecked();
      await expect(restoreDialog.getByText(/ending in 0000/)).toBeVisible();
      await expect(restoreDialog.getByText(/Your current API key will be replaced/)).toBeVisible();
      await restoreDialog.getByRole('button', { name: 'Restore' }).click();

      await expect(other.getByRole('main').getByText('Quest Diagnostics')).toBeVisible();
      await openSettingsTab(other, 'AI Configuration');
      await expect(other.getByText('••••••••1111')).toBeVisible();
    } finally {
      await otherContext.close();
      removeTempFile(backupPath);
    }
  });

  test('keeps a local Ollama setup unless I choose to restore the backup\'s', async ({ page, browser }) => {
    const backupPath = await createEncryptedBackupWithApiKey(page);

    // Device B analyzes with a local Ollama model and has no API key
    const otherContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    try {
      const other = await otherContext.newPage();
      await loginWithOllama(other);

      const restoreDialog = await openEncryptedRestore(other, backupPath);
      await expect(
        restoreDialog.getByRole('checkbox', { name: /restore AI configuration/i })
      ).not.toBeChecked();
      await expect(
        restoreDialog.getByText(/Your current AI provider and model will be replaced/)
      ).toBeVisible();
    } finally {
      await otherContext.close();
      removeTempFile(backupPath);
    }
  });

  test('restores data, AI provider and API key from an encrypted backup', async ({ page, browser }) => {
    // Two installs, each deriving keys from a password, and an encrypted backup between them
    test.slow();
    const backupPath = await createEncryptedBackupWithApiKey(page);

    // Device B: a fresh install with no API key restores the backup
    const otherContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    try {
      const other = await otherContext.newPage();
      await mockAnthropicApi(other);
      await other.goto('/');
      await setupOrUnlock(other);

      const restoreDialog = await openEncryptedRestore(other, backupPath);
      await expect(restoreDialog.getByText(/Anthropic/)).toBeVisible();
      await expect(restoreDialog.getByText(/ending in 0000/)).toBeVisible();
      await expect(restoreDialog.getByRole('checkbox', { name: /restore AI configuration/i })).toBeChecked();
      await restoreDialog.getByRole('button', { name: 'Restore' }).click();

      // Data restored
      await expect(other.getByRole('main').getByText('Quest Diagnostics')).toBeVisible();
      // AI provider and API key restored
      await openSettingsTab(other, 'AI Configuration');
      await expect(other.locator('input[aria-label="Select AI provider"]')).toHaveValue(/Anthropic/);
      await expect(other.getByText('Configured', { exact: true })).toBeVisible();
      await expect(other.getByText('••••••••0000')).toBeVisible();
    } finally {
      await otherContext.close();
      removeTempFile(backupPath);
    }
  });
});

test.describe('Records with an invalid date', () => {
  // Scenario: A lab result without a valid date is restored and kept
  // Scenario: Results without a date are listed last, under "No date"
  test('keeps a lab result without a date, lists it under "No date" and exports it', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    await seedLabData(page, {
      labResults: [{ ...SEED_LAB_RESULTS[0], labName: 'Undated Clinic', date: null }, SEED_LAB_RESULTS[1]],
      testValues: [],
    });

    await goToTimeline(page);
    await expect(labResultCards(page)).toHaveCount(2);
    const heading = page.getByRole('heading', { name: 'No date' });
    await expect(heading).toBeVisible();
    const dated = labResultCards(page).filter({ hasText: 'LabCorp' });
    const undated = labResultCards(page).filter({ hasText: 'Undated Clinic' });
    await expect(undated).toContainText('No date');
    const [datedBox, headingBox, undatedBox] = await Promise.all([
      dated.boundingBox(),
      heading.boundingBox(),
      undated.boundingBox(),
    ]);
    expect(datedBox!.y).toBeLessThan(headingBox!.y);
    expect(headingBox!.y).toBeLessThan(undatedBox!.y);

    // The next backup still holds it, so a restore of that backup does not delete it
    await openSettingsTab(page, 'Data');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /create backup/i }).click();
    const download = await downloadPromise;
    const backup = JSON.parse(fs.readFileSync(await download.path(), 'utf-8'));
    expect(backup.labResults).toHaveLength(2);
  });

  // Scenario: A note with an unreadable creation date is restored with a repaired date
  test('restores a note whose creation date is unreadable', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    await seedLabData(page, {
      userNotes: [
        {
          id: 1,
          labResultId: 1,
          content: 'Note with a broken date',
          tags: [],
          createdAt: 'garbage',
          updatedAt: '2024-01-16T09:00:00.000Z',
        },
      ],
    });

    const main = await goToNotes(page);
    await expect(noteCards(main)).toHaveCount(1);
    await expect(main.getByText('Note with a broken date')).toBeVisible();
  });
});
