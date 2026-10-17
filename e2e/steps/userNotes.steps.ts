/**
 * Step definitions for features/user-notes.feature
 */

import { expect, type Locator, type Page } from '@playwright/test';
import { seedLabData } from './data.steps';
import {
  BIOMARKERS,
  expandLabResult,
  goToTrends,
  isoDate,
  labResult,
  testValues,
  waitForAnimations,
} from './timeline.steps';

export const JAN_DAY = '2024-01-15';
export const FEB_DAY = '2024-02-20';

const JAN = labResult(1, JAN_DAY, 'Quest Diagnostics');
const FEB = labResult(2, FEB_DAY, 'LabCorp');

/**
 * Two results with Glucose and Hemoglobin in both, so each has a trend
 */
export const NOTES_LAB_RESULTS = [JAN, FEB];
export const NOTES_TEST_VALUES = [
  ...testValues(
    JAN,
    [
      { biomarker: BIOMARKERS.HEMOGLOBIN, value: 14.5, low: 12.0, high: 17.5 },
      { biomarker: BIOMARKERS.GLUCOSE, value: 125, low: 70, high: 100 },
    ],
    1
  ),
  ...testValues(
    FEB,
    [
      { biomarker: BIOMARKERS.HEMOGLOBIN, value: 15.0, low: 12.0, high: 17.5 },
      { biomarker: BIOMARKERS.GLUCOSE, value: 98, low: 70, high: 100 },
    ],
    3
  ),
];

export interface NoteSeed {
  id: number;
  labResultId?: number;
  biomarkerId?: number;
  testValueId?: number;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export function noteSeed(
  id: number,
  attachTo: Pick<NoteSeed, 'labResultId' | 'biomarkerId' | 'testValueId'>,
  content: string,
  tags: string[] = [],
  day = '2024-01-16'
): NoteSeed {
  const at = isoDate(day);
  return { id, ...attachTo, content, tags, createdAt: at, updatedAt: at };
}

/**
 * And I have lab results imported (optionally with notes)
 */
export async function seedNotesData(page: Page, userNotes: NoteSeed[] = []): Promise<void> {
  // Notes reference lab results by ID. Restore keeps insertion order on a
  // fresh database, so seeded result N gets ID N.
  await seedLabData(page, {
    labResults: NOTES_LAB_RESULTS,
    testValues: NOTES_TEST_VALUES,
    userNotes,
  });
}

/**
 * The notes header of a NotesSection ("Notes section, collapsed" etc.)
 */
export function notesHeader(container: Locator, title = 'Notes'): Locator {
  return container.getByRole('button', { name: new RegExp(`^${title} section, `) });
}

/**
 * Expand the lab result card and make sure its notes section is open.
 *
 * NotesSection picks its collapsed state once, on mount (collapsed when the
 * result has no notes). The card can mount before the notes finish loading,
 * so a result with notes may still start collapsed: that behaviour is covered
 * by its own tests. Tests about editing or deleting notes do not depend on
 * it, so they open the section either way. The state is final by the time
 * the card has expanded, so reading it here does not race the app.
 */
export async function openLabResultNotes(page: Page, day: string): Promise<Locator> {
  const card = await expandLabResult(page, day);
  const header = notesHeader(card);
  if ((await header.getAttribute('aria-expanded')) !== 'true') {
    await header.click();
  }
  await expect(header).toHaveAttribute('aria-expanded', 'true');
  await waitForAnimations(card);
  return card;
}

export function noteEditor(container: Locator): Locator {
  return container.getByRole('textbox', { name: 'Note content', exact: true });
}

/**
 * When I click "Add Note" and save a note with this content
 */
export async function addNote(container: Locator, content: string): Promise<void> {
  await container.getByRole('button', { name: 'Add Note' }).click();
  await noteEditor(container).fill(content);
  await container.getByRole('button', { name: 'Save Note' }).click();
  await expect(noteEditor(container)).toBeHidden();
  await expect(container.getByText(content, { exact: true })).toBeVisible();
}

/**
 * Given I am viewing the trends for "<biomarker>"
 */
export async function viewTrendsFor(page: Page, biomarkerName: string): Promise<Locator> {
  await goToTrends(page);
  const main = page.getByRole('main');
  await main.locator('input[aria-label="Select biomarker to view trend"]').click();
  await page.getByRole('option', { name: new RegExp(`^${biomarkerName} \\(`) }).click();
  await expect(notesHeader(main, `Notes for ${biomarkerName}`)).toBeVisible();
  return main;
}

/**
 * Today's date as NoteDisplay formats the date part of a timestamp
 */
export function todayShort(): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());
}
