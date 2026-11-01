/**
 * E2E tests for features/save-errors.feature
 *
 * Every write path, with the browser's storage refusing or cancelling the
 * write: the app must say what was not saved and keep showing only what is
 * stored, which a lock and unlock (a fresh read) confirms.
 */

import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { openFromMenu, setupOrUnlock } from './steps/app.steps';
import { seedLabData } from './steps/data.steps';
import { readStoredRows } from './steps/dataAtRest.steps';
import { continueToConfirm, saveResults } from './steps/importWizard.steps';
import { goToTimeline, labResultCard, labResultCards } from './steps/timeline.steps';
import { analyzeReport, openTrend, preferredUnitControl } from './steps/unitConversion.steps';
import {
  JAN_DAY,
  noteEditor,
  noteSeed,
  openLabResultNotes,
  seedNotesData,
  viewTrendsFor,
} from './steps/userNotes.steps';
import { alertCard, viewAlerts } from './steps/alerts.steps';
import { seedVisits, GLUCOSE } from './steps/trends.steps';
import {
  breakStorage,
  expectEmptyTimeline,
  lockAndUnlock,
  notification,
  repairStorage,
  resumeStorage,
  stallStorage,
  startRestore,
} from './steps/saveErrors.steps';

const REPORT = [
  { name: 'Glucose', value: 100, unit: 'mg/dL', confidence: 0.95, referenceRange: { low: 70, high: 100, unit: 'mg/dL' } },
];

/** Health data the messages must never show */
const PRIVATE_TEXT = /Glucose|Unit Test Laboratory|Quest Diagnostics|100 mg|lab-report/;

async function start(page: Page): Promise<void> {
  await page.goto('/');
  await setupOrUnlock(page);
}

async function openSettingsTab(page: Page, tab: string): Promise<void> {
  await openFromMenu(page, 'Settings');
  await page.getByRole('tab', { name: tab }).click();
}

test.describe('Save errors', () => {
  test.describe('Importing', () => {
    // Each analyzes a report, saves it and unlocks again, which derives a key from the password
    test.slow();

    test('an import the browser has no room for is not saved, and can be saved later', async ({ page }) => {
      await start(page);
      await analyzeReport(page, REPORT);
      await continueToConfirm(page);
      await breakStorage(page, 'full');

      await saveResults(page);

      const error = notification(page, 'Import not saved');
      await expect(error).toBeVisible();
      await expect(error).toContainText('no room left');
      await expect(error).not.toContainText(PRIVATE_TEXT);
      // Still on the confirm step, with everything reviewed, to try again
      await expect(page.getByRole('main').getByText('Values to Import')).toBeVisible();
      expect((await readStoredRows(page)).labResults).toHaveLength(0);

      await repairStorage(page);
      await saveResults(page);

      await expect(notification(page, 'Import Complete')).toBeVisible();
      await expect(labResultCards(page)).toHaveCount(1);
      await lockAndUnlock(page);
      await goToTimeline(page);
      await expect(labResultCards(page)).toHaveCount(1);
    });

    test('an import the browser cancels before keeping it is not shown', async ({ page }) => {
      await start(page);
      await analyzeReport(page, REPORT);
      await continueToConfirm(page);
      await breakStorage(page, 'cancel');

      await saveResults(page);

      await expect(notification(page, 'Import not saved')).toBeVisible();
      await expect(page.getByRole('main').getByText('Values to Import')).toBeVisible();
      await expectEmptyTimeline(page);

      await repairStorage(page);
      await lockAndUnlock(page);
      await expectEmptyTimeline(page);
      const stored = await readStoredRows(page);
      expect(stored.labResults).toHaveLength(0);
      expect(stored.testValues).toHaveLength(0);
    });

    test('saving an import cannot be started twice, or left half-way', async ({ page }) => {
      await start(page);
      await analyzeReport(page, REPORT);
      await continueToConfirm(page);
      await stallStorage(page, 'encrypt');

      await saveResults(page);

      const main = page.getByRole('main');
      await expect(main.getByRole('button', { name: 'Save Results', exact: true })).toBeDisabled();
      await expect(main.getByRole('button', { name: 'Back to Review' })).toBeDisabled();
      const timeline = page.locator('nav').getByRole('button', { name: /^Timeline/ });
      await expect(timeline).toHaveAttribute('aria-disabled', 'true');
      await timeline.focus();
      await page.keyboard.press('Enter');
      await main.getByRole('button', { name: /^Review/ }).first().click();
      await expect(main.getByText('Values to Import')).toBeVisible();

      await resumeStorage(page);

      await expect(notification(page, 'Import Complete')).toBeVisible();
      await expect(labResultCards(page)).toHaveCount(1);
      expect((await readStoredRows(page)).labResults).toHaveLength(1);
    });

    test('an import saves all of its files or none of them', async ({ page }) => {
      await start(page);
      await analyzeReport(page, REPORT, 2);
      await continueToConfirm(page);
      // Both lab results, then their values: room for all but the last value,
      // so a save per file would keep the first file
      await breakStorage(page, 'full', { fromWrite: 4 });

      await saveResults(page);

      await expect(notification(page, 'Import not saved')).toBeVisible();
      let stored = await readStoredRows(page);
      expect(stored.labResults).toHaveLength(0);
      expect(stored.testValues).toHaveLength(0);

      await repairStorage(page);
      await saveResults(page);

      await expect(notification(page, 'Import Complete')).toBeVisible();
      stored = await readStoredRows(page);
      expect(stored.labResults).toHaveLength(2);
      expect(stored.testValues).toHaveLength(2);
    });
  });

  test.describe('Notes', () => {
    test('a note that cannot be saved stays in the editor', async ({ page }) => {
      await start(page);
      await seedNotesData(page);
      const card = await openLabResultNotes(page, JAN_DAY);
      await breakStorage(page, 'cancel');

      await card.getByRole('button', { name: 'Add Note' }).click();
      await noteEditor(card).fill('Felt tired before the test');
      await card.getByRole('button', { name: 'Save Note' }).click();

      const error = card.getByRole('alert').filter({ hasText: 'Note not saved' });
      await expect(error).toBeVisible();
      await expect(error).not.toContainText('Felt tired');
      await expect(noteEditor(card)).toHaveValue('Felt tired before the test');

      await repairStorage(page);
      await lockAndUnlock(page);
      await goToTimeline(page);
      const reloaded = await openLabResultNotes(page, JAN_DAY);
      await expect(reloaded.getByText('Felt tired before the test')).toHaveCount(0);
      expect((await readStoredRows(page)).userNotes).toHaveLength(0);
    });

    test('a note on a measurement that cannot be saved stays in the editor', async ({ page }) => {
      await start(page);
      await seedNotesData(page);
      const main = await viewTrendsFor(page, 'Glucose');
      await main.locator('circle[aria-label*=": 125 mg/dL"]').click();
      const measurement = page.getByRole('dialog').filter({ hasText: '125 mg/dL' });
      await measurement.getByRole('button', { name: 'Add Note' }).click();
      await noteEditor(measurement).fill('Big dinner the night before');
      await breakStorage(page, 'cancel');

      await measurement.getByRole('button', { name: 'Save Note' }).click();

      const error = measurement.getByRole('alert').filter({ hasText: 'Note not saved' });
      await expect(error).toBeVisible();
      await expect(error).not.toContainText('Big dinner');
      await expect(noteEditor(measurement)).toHaveValue('Big dinner the night before');
    });

    test('a note that cannot be saved for a lost connection asks for a reload', async ({ page }) => {
      await start(page);
      await seedNotesData(page);
      const card = await openLabResultNotes(page, JAN_DAY);
      await breakStorage(page, 'closed');

      await card.getByRole('button', { name: 'Add Note' }).click();
      await noteEditor(card).fill('Felt tired');
      await card.getByRole('button', { name: 'Save Note' }).click();

      const error = card.getByRole('alert').filter({ hasText: 'Note not saved' });
      await expect(error).toContainText('Reload the page');
    });

    test('an edit the storage never answers is stopped, and not saved later', async ({ page }) => {
      // Waits for the 30-second deadline on writes
      test.slow();
      await start(page);
      await seedNotesData(page, [noteSeed(1, { labResultId: 1 }, 'Original note')]);
      const card = await openLabResultNotes(page, JAN_DAY);
      await card.getByRole('button', { name: 'Edit note' }).click();
      const editor = card.getByRole('textbox', { name: 'Edit note content' });
      await editor.fill('Changed note');
      await stallStorage(page, 'decrypt');

      await card.getByRole('button', { name: 'Save Changes' }).click();

      const error = card.getByRole('alert').filter({ hasText: 'Note not saved' });
      await expect(error).toContainText('did not respond', { timeout: 45_000 });
      await expect(editor).toHaveValue('Changed note');

      await resumeStorage(page);
      await lockAndUnlock(page);
      await goToTimeline(page);
      const reloaded = await openLabResultNotes(page, JAN_DAY);
      await expect(reloaded.getByText('Original note', { exact: true })).toBeVisible();
      await expect(reloaded.getByText('Changed note')).toHaveCount(0);
    });

    test('an edit to a note that cannot be saved keeps the note as it was', async ({ page }) => {
      await start(page);
      await seedNotesData(page, [noteSeed(1, { labResultId: 1 }, 'Original note')]);
      const card = await openLabResultNotes(page, JAN_DAY);
      await breakStorage(page, 'cancel');

      await card.getByRole('button', { name: 'Edit note' }).click();
      const editor = card.getByRole('textbox', { name: 'Edit note content' });
      await editor.fill('Changed note');
      await card.getByRole('button', { name: 'Save Changes' }).click();

      await expect(card.getByRole('alert').filter({ hasText: 'Note not saved' })).toBeVisible();
      await expect(editor).toHaveValue('Changed note');
      await card.getByRole('button', { name: 'Cancel' }).click();
      await expect(card.getByText('Original note', { exact: true })).toBeVisible();
      await expect(card.getByText('Changed note')).toHaveCount(0);
    });

    test('a note that cannot be deleted stays', async ({ page }) => {
      await start(page);
      await seedNotesData(page, [noteSeed(1, { labResultId: 1 }, 'Note to keep')]);
      const card = await openLabResultNotes(page, JAN_DAY);
      await breakStorage(page, 'cancel');

      await card.getByRole('button', { name: 'Delete note' }).click();
      const dialog = page.getByRole('dialog', { name: 'Delete Note' });
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click();

      await expect(dialog.getByRole('alert').filter({ hasText: 'Note not deleted' })).toBeVisible();
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(card.getByText('Note to keep', { exact: true })).toBeVisible();
    });
  });

  test('a lab result that cannot be deleted stays', async ({ page }) => {
    await start(page);
    await seedLabData(page);
    await goToTimeline(page);
    await breakStorage(page, 'cancel');

    const card = labResultCard(page, '2024-01-15');
    await card.getByRole('button', { name: 'Delete this lab result' }).click();
    await page
      .getByRole('dialog', { name: 'Delete Lab Result' })
      .getByRole('button', { name: 'Delete', exact: true })
      .click();

    const error = notification(page, 'Lab result not deleted');
    await expect(error).toBeVisible();
    await expect(error).not.toContainText(PRIVATE_TEXT);
    await expect(card).toBeVisible();

    await repairStorage(page);
    await lockAndUnlock(page);
    await goToTimeline(page);
    await expect(labResultCards(page)).toHaveCount(2);
  });

  test.describe('Preferences', () => {
    test('a preferred unit that cannot be saved goes back', async ({ page }) => {
      await start(page);
      await seedLabData(page);
      await openTrend(page, 'Glucose');
      await expect(preferredUnitControl(page)).toHaveValue('mg/dL');
      await breakStorage(page, 'cancel');

      await preferredUnitControl(page).click();
      await page.getByRole('option', { name: 'mmol/L', exact: true }).click();

      await expect(notification(page, 'Preferred unit not saved')).toBeVisible();
      await expect(preferredUnitControl(page)).toHaveValue('mg/dL');
    });

    test('a display setting that cannot be saved goes back', async ({ page }) => {
      await start(page);
      await openSettingsTab(page, 'Display');
      await breakStorage(page, 'cancel');

      const dateFormat = page.getByRole('textbox', { name: 'Select date format' });
      await dateFormat.click();
      await page.getByRole('option', { name: 'YYYY-MM-DD (ISO)' }).click();

      await expect(notification(page, 'Date format not saved')).toBeVisible();
      // Checked once, at once: a confirmation shown wrongly is gone in 2 seconds
      expect(await page.getByText('Preferences saved').count()).toBe(0);
      await expect(dateFormat).toHaveValue('MM/DD/YYYY (US)');
    });

    test('a theme that cannot be saved puts the colors back', async ({ page }) => {
      await start(page);
      await openSettingsTab(page, 'Display');
      const html = page.locator('html');
      const before = await html.getAttribute('data-mantine-color-scheme');
      await breakStorage(page, 'cancel');

      await page.getByText('Dark', { exact: true }).click();

      await expect(notification(page, 'Theme not saved')).toBeVisible();
      await expect(html).toHaveAttribute('data-mantine-color-scheme', before ?? 'light');
      await expect(page.getByRole('radio', { name: 'System' })).toBeChecked();
    });

    test('an AI setting that cannot be saved goes back', async ({ page }) => {
      await start(page);
      await openSettingsTab(page, 'AI Configuration');
      const provider = page.getByRole('textbox', { name: 'Select AI provider' });
      const before = await provider.inputValue();
      await breakStorage(page, 'cancel');

      await provider.click();
      const other = before.startsWith('Anthropic') ? 'OpenAI (GPT-5)' : 'Anthropic (Claude)';
      await page.getByRole('option', { name: other }).click();

      await expect(notification(page, 'AI setting not saved')).toBeVisible();
      // Checked once, at once: a confirmation shown wrongly is gone in 2 seconds
      expect(await page.getByText('Settings saved').count()).toBe(0);
      await expect(provider).toHaveValue(before);
    });
  });

  test('an alert acknowledgement that cannot be saved shows the alert again', async ({ page }) => {
    await start(page);
    await seedVisits(page, [{ date: '2024-03-10', values: [{ biomarker: GLUCOSE, value: 150 }] }]);
    await viewAlerts(page);
    await breakStorage(page, 'cancel');

    const glucose = alertCard(page, 'Glucose');
    await glucose.getByRole('button', { name: 'Acknowledge all Glucose results' }).click();

    await expect(page.getByRole('main').getByText(/Could not save the acknowledgement/)).toBeVisible();
    await expect(glucose.getByRole('button', { name: 'Acknowledge all Glucose results' })).toBeVisible();
  });

  test('a restore that cannot be saved keeps the current data', async ({ page }) => {
    await start(page);
    await seedLabData(page);
    await breakStorage(page, 'cancel');

    await startRestore(page, {
      labResults: [
        {
          id: 1,
          date: '2023-05-05T10:00:00.000Z',
          labName: 'Other Lab',
          createdAt: '2023-05-05T10:00:00.000Z',
          updatedAt: '2023-05-05T10:00:00.000Z',
        },
      ],
      testValues: [],
    });

    const error = notification(page, 'Restore failed');
    await expect(error).toBeVisible();
    await expect(error).not.toContainText(PRIVATE_TEXT);
    await goToTimeline(page);
    await expect(labResultCards(page)).toHaveCount(2);

    await repairStorage(page);
    await lockAndUnlock(page);
    await goToTimeline(page);
    await expect(labResultCards(page)).toHaveCount(2);
    expect((await readStoredRows(page)).labResults).toHaveLength(2);
  });
});
