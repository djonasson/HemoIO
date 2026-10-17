/**
 * Shared steps for seeding lab data
 *
 * The database is encrypted with a key derived from the user's password, so
 * tests cannot write to IndexedDB directly. Data is seeded the way a user
 * would: by restoring a backup file through Settings.
 */

import { expect, type Page } from '@playwright/test';
import { removeTempFile, writeTempFile } from './tempFiles';

export const SEED_LAB_RESULTS = [
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

// Written as a schema version 1 backup: biomarkerId is the legacy dictionary
// position (3 = Hemoglobin, 22 = Glucose), converted to a key on restore
export const SEED_TEST_VALUES = [
  {
    id: 1,
    labResultId: 1,
    biomarkerId: 3,
    rawText: 'Hemoglobin',
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
    biomarkerId: 22,
    rawText: 'Glucose',
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
    biomarkerId: 3,
    rawText: 'Hemoglobin',
    value: 15.0,
    unit: 'g/dL',
    referenceRangeLow: 12.0,
    referenceRangeHigh: 17.5,
    confidence: 0.98,
    createdAt: '2024-02-20T14:30:00.000Z',
    updatedAt: '2024-02-20T14:30:00.000Z',
  },
];

export interface SeedData {
  labResults?: unknown[];
  testValues?: unknown[];
  userNotes?: unknown[];
}

export function createBackupData(data: SeedData = {}): object {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    appVersion: '1.0.0',
    labResults: data.labResults ?? SEED_LAB_RESULTS,
    testValues: data.testValues ?? SEED_TEST_VALUES,
    userNotes: data.userNotes ?? [],
    userPreferences: null,
    settings: null,
  };
}

/**
 * Write a backup file to a unique temp path and return it
 */
export function writeBackupFile(content: object): string {
  return writeTempFile('backup.json', JSON.stringify(content, null, 2));
}

/**
 * Given I have lab results — restore them from a backup via Settings.
 * Ends on the timeline, which the app shows after a successful restore.
 */
export async function seedLabData(page: Page, data: SeedData = {}): Promise<void> {
  const backupPath = writeBackupFile(createBackupData(data));
  try {
    await page.locator('nav').getByText('Settings', { exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles(backupPath);

    const dialog = page.getByRole('dialog', { name: 'Restore from Backup' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Restore' }).click();

    await expect(page.getByPlaceholder('Search by lab name')).toBeVisible();
  } finally {
    removeTempFile(backupPath);
  }
}
