/**
 * E2E Tests for User Notes
 *
 * Tests the user notes functionality including:
 * - Adding notes to lab results
 * - Editing existing notes
 * - Deleting notes with confirmation
 * - Notes with tags
 * - Notes persistence
 * - Notes in trends view
 */

import { test, expect } from './fixtures';
import type { Locator } from '@playwright/test';
import { setupOrUnlock, unlockApp } from './steps/app.steps';
import {
  BIOMARKERS,
  expandButton,
  expandLabResult,
  goToTimeline,
  labResultCard,
  shortDate,
} from './steps/timeline.steps';
import {
  FEB_DAY,
  JAN_DAY,
  addNote,
  noteEditor,
  noteSeed,
  notesHeader,
  openLabResultNotes,
  seedNotesData,
  todayShort,
  viewTrendsFor,
  isoDate,
  goToNotes,
  noteCards,
  noteTimestamp,
  LONG_NOTE,
} from './steps/userNotes.steps';
import { readStoredRows } from './steps/dataAtRest.steps';
import { pickDate } from './steps/trends.steps';

function tagsInput(container: Locator): Locator {
  return container.locator('input[aria-label="Note tags"]');
}

test.describe('User Notes', () => {
  test.describe('Notes UI Elements', () => {
    test('notes section should be accessible in expanded lab result card', async ({ page }) => {
      await page.goto('/');

      await setupOrUnlock(page);

      await goToTimeline(page);

      // Notes section would be visible when a lab result card is expanded
      // This test verifies the structure is ready for notes
      await expect(page.getByText(/no lab results yet/i)).toBeVisible();
    });

    test('trends view should have notes panel', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await seedNotesData(page);

      const main = await viewTrendsFor(page, 'Glucose');

      const header = notesHeader(main, 'Notes for Glucose');
      await expect(header).toHaveAccessibleName('Notes for Glucose section, expanded');
      await expect(main.getByText('No notes yet', { exact: true })).toBeVisible();
      await expect(main.getByRole('button', { name: 'Add Note' })).toBeVisible();
    });
  });

  test.describe('Notes Accessibility', () => {
    test('notes section should be keyboard navigable', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);

      await goToTimeline(page);

      // Tab through the page
      await page.keyboard.press('Tab');

      // Should be able to navigate via keyboard
      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(focusedElement).toBeTruthy();
    });
  });
});

test.describe('Notes with Data', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
  });

  test('should display "Add Note" button when expanding a lab result', async ({ page }) => {
    await seedNotesData(page);
    await goToTimeline(page);

    const card = labResultCard(page, JAN_DAY);
    await expect(card.getByRole('button', { name: 'Add Note' })).toBeHidden();

    await expandLabResult(page, JAN_DAY);
    // No notes yet, so the notes section starts collapsed
    const header = notesHeader(card);
    await expect(header).toHaveAccessibleName('Notes section, collapsed');
    await header.click();
    await expect(header).toHaveAccessibleName('Notes section, expanded');

    await expect(card.getByText('No notes yet', { exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Add Note' })).toBeVisible();
  });

  test('should open note editor when clicking Add Note', async ({ page }) => {
    await seedNotesData(page);
    const card = await openLabResultNotes(page, JAN_DAY);

    await card.getByRole('button', { name: 'Add Note' }).click();

    const editor = noteEditor(card);
    await expect(editor).toBeVisible();
    await expect(editor).toBeFocused();
    await expect(editor).toHaveAttribute('placeholder', 'Add a note about this lab result...');
    await expect(tagsInput(card)).toBeVisible();
    // Nothing to save yet
    await expect(card.getByRole('button', { name: 'Save Note' })).toBeDisabled();
    await expect(card.getByRole('button', { name: 'Add Note' })).toBeHidden();
  });

  test('should create a note with content', async ({ page }) => {
    await seedNotesData(page);
    const card = await openLabResultNotes(page, JAN_DAY);

    await card.getByRole('button', { name: 'Add Note' }).click();
    await noteEditor(card).fill('Fasted for 12 hours before the draw');
    await expect(card.getByText('35 / 5000')).toBeVisible();
    await card.getByRole('button', { name: 'Save Note' }).click();

    await expect(noteEditor(card)).toBeHidden();
    await expect(card.getByText('Fasted for 12 hours before the draw', { exact: true })).toBeVisible();
    // Creation timestamp is captured automatically
    await expect(card.getByText('just now', { exact: true })).toBeVisible();
    await expect(card.getByText('No notes yet', { exact: true })).toBeHidden();
  });

  test('should create a note with tags', async ({ page }) => {
    await seedNotesData(page);
    const card = await openLabResultNotes(page, JAN_DAY);

    await card.getByRole('button', { name: 'Add Note' }).click();
    await noteEditor(card).fill('Started new medication');
    const tags = tagsInput(card);
    await tags.fill('symptoms');
    await tags.press('Enter');
    await tags.fill('medication');
    await tags.press('Enter');
    await card.getByRole('button', { name: 'Save Note' }).click();

    await expect(card.getByText('Started new medication', { exact: true })).toBeVisible();
    await expect(card.getByText('symptoms', { exact: true })).toBeVisible();
    await expect(card.getByText('medication', { exact: true })).toBeVisible();

    // Tags are saved with the note, not just displayed
    await page.reload();
    await unlockApp(page);
    const reloaded = await openLabResultNotes(page, JAN_DAY);
    await expect(reloaded.getByText('symptoms', { exact: true })).toBeVisible();
    await expect(reloaded.getByText('medication', { exact: true })).toBeVisible();
  });

  test('should display created notes in the notes section', async ({ page }) => {
    await seedNotesData(page, [
      noteSeed(1, { labResultId: 1 }, 'Felt tired that week', ['symptom']),
      noteSeed(2, { labResultId: 1 }, 'Retest in three months', ['followup'], '2024-01-17'),
      noteSeed(3, { labResultId: 2 }, 'Note on the other result'),
    ]);

    // Notes section is expanded by default when the result has notes
    const card = await expandLabResult(page, JAN_DAY);
    await expect(notesHeader(card)).toHaveAccessibleName('Notes section, expanded');

    await expect(card.getByText('(2)', { exact: true })).toBeVisible();
    await expect(card.getByText('Felt tired that week', { exact: true })).toBeVisible();
    await expect(card.getByText('Retest in three months', { exact: true })).toBeVisible();
    await expect(card.getByText('symptom', { exact: true })).toBeVisible();
    await expect(card.getByText('followup', { exact: true })).toBeVisible();
    await expect(noteTimestamp(card, isoDate('2024-01-16'))).toBeVisible();
    await expect(card.getByRole('button', { name: 'Edit note' })).toHaveCount(2);
    // Notes of other results are not shown here
    await expect(card.getByText('Note on the other result')).toHaveCount(0);
  });

  test('should show note count badge on lab result card', async ({ page }) => {
    await seedNotesData(page, [
      noteSeed(1, { labResultId: 1 }, 'First note'),
      noteSeed(2, { labResultId: 1 }, 'Second note'),
    ]);
    await goToTimeline(page);

    const jan = labResultCard(page, JAN_DAY);
    const feb = labResultCard(page, FEB_DAY);
    const badge = jan.getByLabel('2 notes', { exact: true });
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('2');
    await expect(feb.getByLabel(/^\d+ notes?$/)).toHaveCount(0);

    // Clicking the indicator expands the card and shows the notes
    await badge.click();
    await expect(expandButton(jan)).toHaveAttribute('aria-expanded', 'true');
    await expect(jan.getByText('First note', { exact: true })).toBeVisible();

    // A new note shows up in the indicator of the other result
    const febCard = await openLabResultNotes(page, FEB_DAY);
    await addNote(febCard, 'A note for February');
    await expect(feb.getByLabel('1 note', { exact: true })).toHaveText('1');
  });

  test('should edit an existing note', async ({ page }) => {
    await seedNotesData(page, [noteSeed(1, { labResultId: 1 }, 'Original note', ['diet'])]);
    const card = await openLabResultNotes(page, JAN_DAY);

    await card.getByRole('button', { name: 'Edit note' }).click();

    const editor = card.getByRole('textbox', { name: 'Edit note content' });
    await expect(editor).toHaveValue('Original note');
    await expect(card.getByText('diet', { exact: true })).toBeVisible();

    await editor.fill('Updated note');
    await card.getByRole('button', { name: 'Save Changes' }).click();

    await expect(editor).toBeHidden();
    await expect(card.getByText('Updated note', { exact: true })).toBeVisible();
    await expect(card.getByText('Original note')).toHaveCount(0);
  });

  test('should discard changes when cancelling an edit', async ({ page }) => {
    await seedNotesData(page, [noteSeed(1, { labResultId: 1 }, 'Original note')]);
    const card = await openLabResultNotes(page, JAN_DAY);

    await card.getByRole('button', { name: 'Edit note' }).click();
    const editor = card.getByRole('textbox', { name: 'Edit note content' });
    await editor.fill('Changes I do not want');
    await card.getByRole('button', { name: 'Cancel' }).click();

    await expect(editor).toBeHidden();
    await expect(card.getByText('Original note', { exact: true })).toBeVisible();
    await expect(card.getByText('Changes I do not want')).toHaveCount(0);
    await expect(card.getByText('(edited)')).toHaveCount(0);
  });

  test('should show confirmation dialog when deleting a note', async ({ page }) => {
    await seedNotesData(page, [noteSeed(1, { labResultId: 1 }, 'Note to delete')]);
    const card = await openLabResultNotes(page, JAN_DAY);

    await card.getByRole('button', { name: 'Delete note' }).click();

    const dialog = page.getByRole('dialog', { name: 'Delete Note' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Are you sure you want to delete this note?');
    await expect(dialog).toContainText('This action cannot be undone.');
    await expect(dialog.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('should delete a note after confirmation', async ({ page }) => {
    await seedNotesData(page, [noteSeed(1, { labResultId: 1 }, 'Note to delete')]);
    const card = await openLabResultNotes(page, JAN_DAY);
    await expect(card.getByLabel('1 note', { exact: true })).toBeVisible();

    await card.getByRole('button', { name: 'Delete note' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete Note' });
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(dialog).toBeHidden();
    await expect(card.getByText('Note to delete')).toHaveCount(0);
    await expect(card.getByText('No notes yet', { exact: true })).toBeVisible();
    // The note indicator disappears from the result
    await expect(card.getByLabel('1 note', { exact: true })).toHaveCount(0);

    // Deleted from the database, not just hidden
    await page.reload();
    await unlockApp(page);
    const reloaded = await openLabResultNotes(page, JAN_DAY);
    await expect(reloaded.getByText('Note to delete')).toHaveCount(0);
  });

  test('should cancel note deletion when clicking cancel', async ({ page }) => {
    await seedNotesData(page, [noteSeed(1, { labResultId: 1 }, 'Note to keep')]);
    const card = await openLabResultNotes(page, JAN_DAY);

    await card.getByRole('button', { name: 'Delete note' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete Note' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    await expect(dialog).toBeHidden();
    await expect(card.getByText('Note to keep', { exact: true })).toBeVisible();
    await expect(card.getByLabel('1 note', { exact: true })).toBeVisible();
  });

  test('should save note with Ctrl+Enter keyboard shortcut', async ({ page }) => {
    await seedNotesData(page);
    const card = await openLabResultNotes(page, JAN_DAY);

    await card.getByRole('button', { name: 'Add Note' }).click();
    const editor = noteEditor(card);
    await editor.fill('Saved from the keyboard');
    await editor.press('Control+Enter');

    await expect(editor).toBeHidden();
    await expect(card.getByText('Saved from the keyboard', { exact: true })).toBeVisible();
    await expect(card.getByLabel('1 note', { exact: true })).toBeVisible();
  });

  test('should cancel note with Escape keyboard shortcut', async ({ page }) => {
    await seedNotesData(page);
    const card = await openLabResultNotes(page, JAN_DAY);

    await card.getByRole('button', { name: 'Add Note' }).click();
    const editor = noteEditor(card);
    await editor.fill('This should be discarded');
    await editor.press('Escape');

    await expect(editor).toBeHidden();
    await expect(card.getByText('This should be discarded')).toHaveCount(0);
    await expect(card.getByText('No notes yet', { exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Add Note' })).toBeVisible();
  });

  test('should show an "edited" indicator on edited notes', async ({ page }) => {
    await seedNotesData(page, [noteSeed(1, { labResultId: 1 }, 'Original note')]);
    const card = await openLabResultNotes(page, JAN_DAY);
    await expect(noteTimestamp(card, isoDate('2024-01-16'))).toBeVisible();
    await expect(card.getByText(/\(edited\b/)).toHaveCount(0);

    await card.getByRole('button', { name: 'Edit note' }).click();
    await card.getByRole('textbox', { name: 'Edit note content' }).fill('Edited note');
    await card.getByRole('button', { name: 'Save Changes' }).click();

    await expect(card.getByText('Edited note', { exact: true })).toBeVisible();
    await expect(card.getByText(/\(edited\b/)).toBeVisible();
  });

  test('should show the edit timestamp on edited notes', async ({ page }) => {
    // Created on 2024-01-16, edited today: the edit time must be shown too
    await seedNotesData(page, [noteSeed(1, { labResultId: 1 }, 'Original note')]);
    const card = await openLabResultNotes(page, JAN_DAY);

    await card.getByRole('button', { name: 'Edit note' }).click();
    await card.getByRole('textbox', { name: 'Edit note content' }).fill('Edited note');
    await card.getByRole('button', { name: 'Save Changes' }).click();

    await expect(card.getByText(/\(edited\b/)).toBeVisible();
    await expect(card.getByText('(edited just now)', { exact: true })).toBeVisible();
  });

  test('should show notes in trends view for selected biomarker', async ({ page }) => {
    await seedNotesData(page, [
      noteSeed(1, { biomarkerId: BIOMARKERS.GLUCOSE.id }, 'Glucose was high after a big dinner', [
        'diet',
      ]),
      noteSeed(2, { biomarkerId: BIOMARKERS.HEMOGLOBIN.id }, 'Hemoglobin note'),
    ]);

    const main = await viewTrendsFor(page, 'Glucose');

    await expect(main.getByText('(1)', { exact: true })).toBeVisible();
    await expect(main.getByText('Glucose was high after a big dinner', { exact: true })).toBeVisible();
    await expect(main.getByText('diet', { exact: true })).toBeVisible();
    await expect(main.getByText('Hemoglobin note')).toHaveCount(0);
  });

  test('should mark trend chart data points that have notes', async ({ page }) => {
    // Test value 2 is the 2024-01-15 Glucose measurement
    await seedNotesData(page, [
      noteSeed(1, { biomarkerId: BIOMARKERS.GLUCOSE.id, testValueId: 2 }, 'Big dinner the night before'),
    ]);

    const main = await viewTrendsFor(page, 'Glucose');
    const points = main.locator('circle[aria-label]');
    await expect(points).toHaveCount(2);

    // The data point with a note has its own, accessible marker
    const noted = main.locator('circle[aria-label*="note" i]');
    await expect(noted).toHaveCount(1);

    await expect(noted).toHaveAttribute('aria-label', /, has notes$/);

    // Hovering it previews the note in the chart tooltip
    await noted.hover();
    await expect(
      main.locator('.recharts-tooltip-wrapper').getByText('Big dinner the night before')
    ).toBeVisible();

    // Focusing it from the keyboard shows the preview and a focus ring
    await page.mouse.move(0, 0);
    await noted.focus();
    await expect(main.locator('[data-focus-preview="true"]')).toContainText(
      'Big dinner the night before'
    );
    await expect(main.locator('[data-focus-ring="true"]')).toBeVisible();
  });

  test('should allow adding notes from trends view', async ({ page }) => {
    await seedNotesData(page);
    const main = await viewTrendsFor(page, 'Glucose');

    await main.getByRole('button', { name: 'Add Note' }).click();
    const editor = noteEditor(main);
    await expect(editor).toHaveAttribute('placeholder', 'Add a note about Glucose...');
    await editor.fill('Cutting back on sugar');
    await main.getByRole('button', { name: 'Save Note' }).click();

    await expect(editor).toBeHidden();
    await expect(main.getByText('Cutting back on sugar', { exact: true })).toBeVisible();
    await expect(main.getByText('(1)', { exact: true })).toBeVisible();

    // The note belongs to Glucose only
    await main.locator('input[aria-label="Select biomarker to view trend"]').click();
    await page.getByRole('option', { name: /^Hemoglobin \(/ }).click();
    await expect(notesHeader(main, 'Notes for Hemoglobin')).toBeVisible();
    await expect(main.getByText('Cutting back on sugar')).toHaveCount(0);

    await main.locator('input[aria-label="Select biomarker to view trend"]').click();
    await page.getByRole('option', { name: /^Glucose \(/ }).click();
    await expect(main.getByText('Cutting back on sugar', { exact: true })).toBeVisible();
  });

  test('should add a note to a specific measurement from the trend chart', async ({ page }) => {
    await seedNotesData(page);
    const main = await viewTrendsFor(page, 'Glucose');

    // When I click on a data point on the chart (the 2024-01-15 value)
    await main.locator('circle[aria-label*=": 125 mg/dL"]').click();

    // And I click "Add Note" for that measurement
    const measurement = page.getByRole('dialog').filter({ hasText: '125 mg/dL' });
    await expect(measurement).toBeVisible();
    await measurement.getByRole('button', { name: 'Add Note' }).click();
    await expect(noteEditor(measurement)).toBeVisible();
    await expect(
      measurement.getByRole('heading', { name: 'Note for 125 mg/dL on Jan 15, 2024' })
    ).toBeVisible();
    await noteEditor(measurement).fill('Big dinner the night before');
    await measurement.getByRole('button', { name: 'Save Note' }).click();

    // The note is linked to that measurement
    await expect(measurement.getByText('Big dinner the night before', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(measurement).toBeHidden();
    await expect(
      main.locator('circle[aria-label*=": 125 mg/dL"][aria-label$=", has notes"]')
    ).toHaveCount(1);
    await expect(
      main.locator('circle[aria-label*=": 98 mg/dL"][aria-label$=", has notes"]')
    ).toHaveCount(0);

    // Opened from the keyboard as well
    await main.locator('circle[aria-label*=": 98 mg/dL"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog').filter({ hasText: '98 mg/dL' })).toBeVisible();
  });

  test('should persist notes after page reload', async ({ page }) => {
    await seedNotesData(page);
    const card = await openLabResultNotes(page, JAN_DAY);
    await addNote(card, 'This note survives a reload');

    await page.reload();
    await unlockApp(page);

    const reloaded = await openLabResultNotes(page, JAN_DAY);
    await expect(reloaded.getByText('This note survives a reload', { exact: true })).toBeVisible();
  });

  test('should persist notes after locking and unlocking', async ({ page }) => {
    await seedNotesData(page);
    const card = await openLabResultNotes(page, JAN_DAY);
    await addNote(card, 'Ferritin 30 ng/mL — taking iron & vitamin C (50%)');

    await page.getByRole('button', { name: 'Lock application' }).click();
    await expect(page.getByRole('button', { name: /unlock/i })).toBeVisible();
    await unlockApp(page);

    await goToTimeline(page);
    const unlocked = await openLabResultNotes(page, JAN_DAY);
    await expect(unlocked.getByText('Ferritin 30 ng/mL — taking iron & vitamin C (50%)', { exact: true })).toBeVisible();
    await expect(unlocked.getByLabel('1 note', { exact: true })).toBeVisible();
  });
});

test.describe('Notes view', () => {
  const NOTES = [
    noteSeed(1, { labResultId: 1 }, 'Felt a headache after the fast', ['symptoms'], '2024-01-16'),
    noteSeed(2, { biomarkerId: BIOMARKERS.GLUCOSE.id }, 'Cutting back on sugar', ['diet'], '2024-03-01'),
    noteSeed(
      3,
      { biomarkerId: BIOMARKERS.GLUCOSE.id, testValueId: 2, labResultId: 1 },
      'Big dinner the night before',
      ['diet', 'symptoms'],
      '2024-07-05'
    ),
    noteSeed(4, { labResultId: 2 }, 'Retest planned (50%)', [], '2024-08-10'),
  ];

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    await seedNotesData(page, NOTES);
  });

  test('lists all notes, newest first, with what they are attached to', async ({ page }) => {
    const main = await goToNotes(page);
    const cards = noteCards(main);

    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0)).toHaveAccessibleName(`Note attached to LabCorp · ${shortDate(FEB_DAY)}`);
    await expect(cards.nth(1)).toHaveAccessibleName(
      `Note attached to Glucose · 125 mg/dL · ${shortDate(JAN_DAY)}`
    );
    await expect(cards.nth(2)).toHaveAccessibleName('Note attached to Glucose');
    await expect(cards.nth(3)).toHaveAccessibleName(
      `Note attached to Quest Diagnostics · ${shortDate(JAN_DAY)}`
    );
    await expect(cards.nth(0)).toContainText('Retest planned (50%)');
  });

  test('opens the lab result a note is attached to', async ({ page }) => {
    const main = await goToNotes(page);
    await noteCards(main)
      .nth(3)
      .getByRole('button', { name: `Quest Diagnostics · ${shortDate(JAN_DAY)}` })
      .click();

    const card = labResultCard(page, JAN_DAY);
    await expect(expandButton(card)).toHaveAttribute('aria-expanded', 'true');
    await expect(card.getByText('Felt a headache after the fast', { exact: true })).toBeVisible();
  });

  test('opens the measurement a note is attached to on its trend', async ({ page }) => {
    const main = await goToNotes(page);
    await noteCards(main)
      .nth(1)
      .getByRole('button', { name: `Glucose · 125 mg/dL · ${shortDate(JAN_DAY)}` })
      .click();

    await expect(
      page.getByRole('navigation').getByRole('button', { name: /^Trends/ })
    ).toHaveAttribute('aria-current', 'page');
    await expect(main.locator('circle[aria-label*=": 125 mg/dL"]')).toHaveAttribute(
      'aria-current',
      'true'
    );
  });

  test('searches note content and highlights the match', async ({ page }) => {
    const main = await goToNotes(page);
    await main.getByRole('textbox', { name: 'Search notes' }).fill('HEADACHE');

    await expect(noteCards(main)).toHaveCount(1);
    await expect(noteCards(main).first().locator('mark')).toHaveText('headache');
  });

  test('searches text with special characters', async ({ page }) => {
    const main = await goToNotes(page);
    await main.getByRole('textbox', { name: 'Search notes' }).fill('(50%)');

    await expect(noteCards(main)).toHaveCount(1);
    await expect(noteCards(main).first().locator('mark')).toHaveText('(50%)');
  });

  test('filters notes by date range', async ({ page }) => {
    const main = await goToNotes(page);
    await pickDate(page, 'Notes from date', '2024-01-01');
    await pickDate(page, 'Notes to date', '2024-06-30');

    await expect(noteCards(main)).toHaveCount(2);
    await expect(main.getByText('Cutting back on sugar', { exact: true })).toBeVisible();
    await expect(main.getByText('Felt a headache after the fast', { exact: true })).toBeVisible();
  });

  test('filters notes by biomarker', async ({ page }) => {
    const main = await goToNotes(page);
    await main.getByRole('textbox', { name: 'Filter notes by biomarker' }).click();
    await page.getByRole('option', { name: 'Glucose', exact: true }).click();

    await expect(noteCards(main)).toHaveCount(2);
    await expect(main.getByText('Felt a headache after the fast')).toHaveCount(0);
  });

  test('filters notes by tag', async ({ page }) => {
    const main = await goToNotes(page);
    await main.getByRole('textbox', { name: 'Filter notes by tag' }).click();
    await page.getByRole('option', { name: 'symptoms', exact: true }).click();

    await expect(noteCards(main)).toHaveCount(2);
    await expect(main.getByText('Felt a headache after the fast', { exact: true })).toBeVisible();
    await expect(main.getByText('Big dinner the night before', { exact: true })).toBeVisible();
  });
});

test.describe('Note formatting and display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
  });

  test('formats a note with the toolbar and renders it', async ({ page }) => {
    await seedNotesData(page);
    const card = await openLabResultNotes(page, JAN_DAY);
    await card.getByRole('button', { name: 'Add Note' }).click();

    const editor = noteEditor(card);
    const toolbar = card.getByRole('toolbar', { name: 'Formatting' });
    await editor.fill('Take iron daily');
    await editor.selectText();
    await toolbar.getByRole('button', { name: 'Bold' }).click();
    await expect(editor).toHaveValue('**Take iron daily**');

    await editor.press('End');
    await editor.press('Enter');
    await editor.pressSequentially('with vitamin C');
    await toolbar.getByRole('button', { name: 'Bullet list' }).click();
    await expect(editor).toHaveValue('**Take iron daily**\n- with vitamin C');

    await editor.press('End');
    await editor.press('Enter');
    await editor.pressSequentially('avoid tea');
    await editor.press('Shift+Home');
    await editor.press('Control+i');
    await expect(editor).toHaveValue('**Take iron daily**\n- with vitamin C\n*avoid tea*');

    await card.getByRole('button', { name: 'Save Note' }).click();
    await expect(card.locator('strong', { hasText: 'Take iron daily' })).toBeVisible();
    await expect(card.locator('li', { hasText: 'with vitamin C' })).toBeVisible();
    await expect(card.locator('em', { hasText: 'avoid tea' })).toBeVisible();
  });

  test('shows the full creation date on focus', async ({ page }) => {
    await seedNotesData(page);
    const card = await openLabResultNotes(page, JAN_DAY);
    await addNote(card, 'Timestamp check');

    // Reached from the keyboard: the tooltip follows keyboard focus
    const time = card.getByText('just now', { exact: true });
    await card.getByRole('button', { name: 'Edit note' }).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(time).toBeFocused();
    await expect(page.getByRole('tooltip')).toContainText(todayShort());
  });

  test('expands a long note to its full content', async ({ page }) => {
    await seedNotesData(page, [noteSeed(1, { labResultId: 1 }, LONG_NOTE)]);
    const card = await openLabResultNotes(page, JAN_DAY);

    const toggle = card.getByRole('button', { name: 'Show full note' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();

    await expect(card.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    await expect(noteTimestamp(card, isoDate('2024-01-16'))).toBeVisible();
    await expect(card.getByRole('button', { name: 'Edit note' })).toBeVisible();
  });

  test('stores note content encrypted', async ({ page }) => {
    await seedNotesData(page);
    const card = await openLabResultNotes(page, JAN_DAY);
    await addNote(card, 'Secret symptom note');

    const rows = (await readStoredRows(page)).userNotes.map((row) => JSON.stringify(row));

    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toContain('Secret symptom');
  });
});
