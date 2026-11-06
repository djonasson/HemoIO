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

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import * as fs from 'fs';
import { setupOrUnlock } from './steps/app.steps';
import { SEED_LAB_RESULTS, seedLabData } from './steps/data.steps';
import { goToTimeline, labResultCard, labResultCards } from './steps/timeline.steps';

/**
 * Helper to open export dialog
 */
async function openExportDialog(page: Page) {
  await page.getByRole('button', { name: /export data/i }).click();
  await expect(exportDialog(page)).toBeVisible();
}

function exportDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Export Data' });
}

async function selectExportFormat(page: Page, format: string) {
  await exportDialog(page).getByRole('textbox', { name: 'Select export format' }).click();
  await page.getByRole('option', { name: format }).click();
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
      await expect(page.getByRole('heading', { name: 'Export Data' })).toBeVisible();
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
      await expect(page.getByRole('heading', { name: 'Export Data' })).not.toBeVisible();
    });
  });

  test.describe('CSV Export Options', () => {
    test('should show CSV options when CSV format selected', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);

      await openExportDialog(page);

      // CSV should be default, so options should be visible
      const dialog = page.getByRole('dialog', { name: 'Export Data' });
      await expect(dialog.getByText('Date Range')).toBeVisible();
      await expect(dialog.getByText('Biomarkers')).toBeVisible();
      await expect(dialog.getByText('Include reference ranges')).toBeVisible();
    });
  });

  test.describe('JSON Export', () => {
    test('should show JSON description when JSON format selected', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await openExportDialog(page);

      await selectExportFormat(page, 'JSON (Full Backup)');

      await expect(exportDialog(page).getByText(/JSON export includes all lab results/)).toBeVisible();
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
      await expect(page.getByRole('heading', { name: 'Export Data' })).not.toBeVisible();
    });
  });
});

test.describe('Export with Data', () => {
  // Test values keyed by LOINC code (718-7 = Hemoglobin, 2345-7 = Glucose)
  const TEST_VALUES = [
    { id: 1, labResultId: 1, biomarkerKey: '718-7', value: 14.5, unit: 'g/dL', rawText: 'Hemoglobin', createdAt: '2024-01-15T10:00:00.000Z', updatedAt: '2024-01-15T10:00:00.000Z' },
    { id: 2, labResultId: 1, biomarkerKey: '2345-7', value: 125, unit: 'mg/dL', rawText: 'Glucose', createdAt: '2024-01-15T10:00:00.000Z', updatedAt: '2024-01-15T10:00:00.000Z' },
    { id: 3, labResultId: 2, biomarkerKey: '718-7', value: 15.0, unit: 'g/dL', rawText: 'Hemoglobin', createdAt: '2024-02-20T14:30:00.000Z', updatedAt: '2024-02-20T14:30:00.000Z' },
  ];

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    await seedLabData(page, { testValues: TEST_VALUES });
    await openExportDialog(page);
  });

  test('should show data counts in export preview', async ({ page }) => {
    await expect(exportDialog(page).getByText('2 lab results, 3 test values')).toBeVisible();
  });

  test('should download CSV file when exporting', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download');
    await exportDialog(page).getByRole('button', { name: 'Export', exact: true }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    const csv = fs.readFileSync(await download.path(), 'utf-8');
    expect(csv).toContain('Quest Diagnostics');
    expect(csv).toContain('LabCorp');
    expect(csv).toContain('Glucose');
    expect(csv).toContain('Hemoglobin');
  });

  test('should download JSON file when exporting full backup', async ({ page }) => {
    await selectExportFormat(page, 'JSON (Full Backup)');
    await expect(exportDialog(page).getByText('2 lab results, 3 test values, 0 notes')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await exportDialog(page).getByRole('button', { name: 'Export', exact: true }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.json$/);
    const backup = JSON.parse(fs.readFileSync(await download.path(), 'utf-8'));
    expect(backup.labResults).toHaveLength(SEED_LAB_RESULTS.length);
    expect(backup.testValues).toHaveLength(TEST_VALUES.length);
  });

  test('should filter by date range', async ({ page }) => {
    // The seeded results are from 2024, so a recent range excludes all of them
    await exportDialog(page).getByRole('textbox', { name: 'Select date range' }).click();
    await page.getByRole('option', { name: 'Last 30 Days' }).click();

    await expect(exportDialog(page).getByText('0 lab results, 0 test values')).toBeVisible();
    await expect(exportDialog(page).getByRole('button', { name: 'Export', exact: true })).toBeEnabled();
  });

  test('should filter by selected biomarkers', async ({ page }) => {
    await exportDialog(page).getByRole('textbox', { name: 'Select biomarkers to include' }).click();
    await page.getByRole('option', { name: 'Glucose' }).click();

    // Both lab results remain in range; only the one Glucose value is included
    await expect(exportDialog(page).getByText('2 lab results, 1 test value')).toBeVisible();
  });
});

test.describe('Export on LOINC codes', () => {
  test("gives each value's LOINC code, and none for a value that is not a LOINC test", async ({ page }) => {
    // Scenario: CSV export gives each value's LOINC code
    const at = '2024-01-15T10:00:00.000Z';
    await page.goto('/');
    await setupOrUnlock(page);
    await seedLabData(page, {
      labResults: [{ id: 1, date: at, labName: 'Quest Diagnostics', createdAt: at, updatedAt: at }],
      testValues: [
        { id: 1, labResultId: 1, biomarkerKey: '2345-7', value: 95, unit: 'mg/dL', rawText: 'Glicemia', createdAt: at, updatedAt: at },
        { id: 2, labResultId: 1, biomarkerKey: 'unknown:zorblatin', value: 3, unit: 'U/L', rawText: 'Zorblatin', createdAt: at, updatedAt: at },
      ],
    });
    await openExportDialog(page);

    const downloadPromise = page.waitForEvent('download');
    await exportDialog(page).getByRole('button', { name: 'Export', exact: true }).click();
    const download = await downloadPromise;
    const rows = fs.readFileSync(await download.path(), 'utf-8').trim().split(/\r?\n/);

    expect(rows[0]).toMatch(/^Date,Lab Name,Biomarker,LOINC,Value,Unit/);
    // ="2345-7": a spreadsheet keeps the code as text instead of reading it as a date
    expect(rows.find((row) => row.includes('Glucose'))).toMatch(/,Glucose,"=""2345-7""",95,mg\/dL/);
    expect(rows.find((row) => row.includes('Zorblatin'))).toMatch(/,Zorblatin,,3,U\/L/);
  });
});

test.describe('Export after changes in this session', () => {
  test('exports nothing for a choice of biomarkers that no longer have values', async ({ page }) => {
    // Scenario: A choice of biomarkers that no longer have values exports nothing
    await page.goto('/');
    await setupOrUnlock(page);
    // Glucose (2345-7) only on 2024-01-15; hemoglobin on both days
    await seedLabData(page, {
      testValues: [
        { id: 1, labResultId: 1, biomarkerKey: '718-7', value: 14.5, unit: 'g/dL', rawText: 'Hemoglobin', createdAt: '2024-01-15T10:00:00.000Z', updatedAt: '2024-01-15T10:00:00.000Z' },
        { id: 2, labResultId: 1, biomarkerKey: '2345-7', value: 125, unit: 'mg/dL', rawText: 'Glucose', createdAt: '2024-01-15T10:00:00.000Z', updatedAt: '2024-01-15T10:00:00.000Z' },
        { id: 3, labResultId: 2, biomarkerKey: '718-7', value: 15.0, unit: 'g/dL', rawText: 'Hemoglobin', createdAt: '2024-02-20T14:30:00.000Z', updatedAt: '2024-02-20T14:30:00.000Z' },
      ],
    });

    // When I choose to export only Glucose values and cancel the export
    await openExportDialog(page);
    await exportDialog(page).getByRole('textbox', { name: 'Select biomarkers to include' }).click();
    await page.getByRole('option', { name: 'Glucose' }).click();
    await expect(exportDialog(page).getByText('2 lab results, 1 test value')).toBeVisible();
    await exportDialog(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(exportDialog(page)).toBeHidden();

    // And I delete the lab result from 2024-01-15
    await goToTimeline(page);
    await labResultCard(page, '2024-01-15')
      .getByRole('button', { name: 'Delete this lab result' })
      .click();
    const confirm = page.getByRole('dialog', { name: 'Delete Lab Result' });
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(labResultCards(page)).toHaveCount(1);

    // And I open the export dialog again
    await openExportDialog(page);
    const dialog = exportDialog(page);
    await expect(dialog.getByText('1 lab result, 0 test values')).toBeVisible();
    await expect(dialog.getByText(/The biomarkers you chose have no values now/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Export', exact: true })).toBeDisabled();

    // When I clear the choice
    await dialog.getByRole('button', { name: 'Clear the choice' }).click();
    await expect(dialog.getByText('1 lab result, 1 test value')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Export', exact: true })).toBeEnabled();
  });

  test('includes changes made since the app was opened', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    await seedLabData(page);

    // When I delete the lab result from 2024-01-15
    await goToTimeline(page);
    await labResultCard(page, '2024-01-15')
      .getByRole('button', { name: 'Delete this lab result' })
      .click();
    const confirm = page.getByRole('dialog', { name: 'Delete Lab Result' });
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(labResultCards(page)).toHaveCount(1);

    // And I export to JSON format
    await openExportDialog(page);
    await selectExportFormat(page, 'JSON (Full Backup)');
    const downloadPromise = page.waitForEvent('download');
    await exportDialog(page).getByRole('button', { name: 'Export', exact: true }).click();
    const download = await downloadPromise;

    // Then the exported file contains only the lab result from 2024-02-20
    const backup = JSON.parse(fs.readFileSync(await download.path(), 'utf-8'));
    expect(backup.labResults).toHaveLength(1);
    expect(backup.labResults[0].date).toMatch(/^2024-02-20/);
  });
});

test.describe('Export of results without a date', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    // The undated result holds the only Glucose value; Hemoglobin is also in the dated one
    await seedLabData(page, {
      labResults: [{ ...SEED_LAB_RESULTS[0], date: null }, SEED_LAB_RESULTS[1]],
    });
    await openExportDialog(page);
  });

  async function downloadCsvRows(page: Page): Promise<string[]> {
    const downloadPromise = page.waitForEvent('download');
    await exportDialog(page).getByRole('button', { name: 'Export', exact: true }).click();
    const download = await downloadPromise;
    return fs.readFileSync(await download.path(), 'utf-8').trim().split(/\r?\n/);
  }

  // Scenario: The CSV holds results without a date
  test('offers and exports the tests of an undated result', async ({ page }) => {
    await exportDialog(page).getByRole('textbox', { name: 'Select biomarkers to include' }).click();
    await expect(page.getByRole('option', { name: 'Glucose' })).toBeVisible();
    await page.keyboard.press('Escape');

    const rows = await downloadCsvRows(page);

    // The undated result's row starts with an empty Date field
    expect(rows.find((row) => row.includes('Glucose'))).toMatch(/^,Quest Diagnostics,Glucose,/);
  });

  // Scenario: A date range leaves results without a date out of the CSV
  test('leaves an undated result out when a date range is set', async ({ page }) => {
    await exportDialog(page).getByRole('textbox', { name: 'Select date range' }).click();
    await page.getByRole('option', { name: 'Last Year' }).click();

    const rows = await downloadCsvRows(page);

    expect(rows.some((row) => row.includes('Glucose'))).toBe(false);
  });
});
