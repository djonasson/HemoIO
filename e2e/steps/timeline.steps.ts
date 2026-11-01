/**
 * Step definitions for features/timeline-view.feature
 *
 * Seed data is restored through a backup (see data.steps.ts). Test values
 * carry `rawText` because that is how imported values store the biomarker
 * name; the timeline and trends views display names from it.
 */

import { expect, type Locator, type Page } from '@playwright/test';
import { openFromMenu } from './app.steps';

/**
 * Built-in dictionary entries used by the tests. IDs are 1-indexed positions
 * in BIOMARKER_DEFINITIONS (src/data/biomarkers/dictionary.ts).
 */
export const BIOMARKERS = {
  WHITE_BLOOD_CELLS: { id: 1, name: 'White Blood Cell Count', unit: '10^9/L' },
  RED_BLOOD_CELLS: { id: 2, name: 'Red Blood Cell Count', unit: '10^12/L' },
  HEMOGLOBIN: { id: 3, name: 'Hemoglobin', unit: 'g/dL' },
  HEMATOCRIT: { id: 4, name: 'Hematocrit', unit: '%' },
  PLATELETS: { id: 5, name: 'Platelet Count', unit: '10^9/L' },
  MCV: { id: 6, name: 'Mean Corpuscular Volume', unit: 'fL' },
  MCH: { id: 7, name: 'Mean Corpuscular Hemoglobin', unit: 'pg' },
  MCHC: { id: 8, name: 'Mean Corpuscular Hemoglobin Concentration', unit: 'g/dL' },
  GLUCOSE: { id: 22, name: 'Glucose', unit: 'mg/dL' },
  CREATININE: { id: 23, name: 'Creatinine', unit: 'mg/dL' },
} as const;

type Biomarker = (typeof BIOMARKERS)[keyof typeof BIOMARKERS];

/** Biomarkers in dictionary order, for generating results with N values */
const PANEL: Biomarker[] = [
  BIOMARKERS.WHITE_BLOOD_CELLS,
  BIOMARKERS.RED_BLOOD_CELLS,
  BIOMARKERS.HEMOGLOBIN,
  BIOMARKERS.HEMATOCRIT,
  BIOMARKERS.PLATELETS,
  BIOMARKERS.MCV,
  BIOMARKERS.MCH,
  BIOMARKERS.MCHC,
];

/**
 * Midday UTC keeps the calendar day stable in any test-runner time zone
 */
export function isoDate(day: string): string {
  return `${day}T12:00:00.000Z`;
}

export interface LabResultSeed {
  id: number;
  date: string;
  labName: string;
  createdAt: string;
  updatedAt: string;
}

export function labResult(id: number, day: string, labName: string): LabResultSeed {
  const date = isoDate(day);
  return { id, date, labName, createdAt: date, updatedAt: date };
}

export interface TestValueSeed {
  id: number;
  labResultId: number;
  biomarkerId: number;
  rawText: string;
  value: number;
  unit: string;
  referenceRangeLow?: number;
  referenceRangeHigh?: number;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

export interface TestValueInput {
  biomarker: Biomarker;
  value: number;
  unit?: string;
  low?: number;
  high?: number;
}

/**
 * Build test values for a lab result, numbering IDs from `firstId`
 */
export function testValues(
  result: LabResultSeed,
  values: TestValueInput[],
  firstId: number
): TestValueSeed[] {
  return values.map((v, i) => ({
    id: firstId + i,
    labResultId: result.id,
    biomarkerId: v.biomarker.id,
    rawText: v.biomarker.name,
    value: v.value,
    unit: v.unit ?? v.biomarker.unit,
    referenceRangeLow: v.low,
    referenceRangeHigh: v.high,
    confidence: 0.95,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
  }));
}

/**
 * Build `count` test values from a standard blood panel
 */
export function panelValues(result: LabResultSeed, count: number, firstId: number): TestValueSeed[] {
  return testValues(
    result,
    PANEL.slice(0, count).map((biomarker, i) => ({ biomarker, value: 10 + i })),
    firstId
  );
}

/**
 * Format a YYYY-MM-DD day the way the card's accessible name does
 */
export function longDate(day: string): string {
  return new Date(isoDate(day)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format a YYYY-MM-DD day the way the card header displays it
 */
export function shortDate(day: string): string {
  return new Date(isoDate(day)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * When I navigate to the Timeline view
 */
export async function goToTimeline(page: Page): Promise<void> {
  await openFromMenu(page, 'Timeline');
}

/**
 * When I navigate to the Trends view
 */
export async function goToTrends(page: Page): Promise<void> {
  await openFromMenu(page, 'Trends');
}

/**
 * All lab result cards on the timeline, in display order
 */
export function labResultCards(page: Page): Locator {
  return page.getByRole('main').getByRole('region', { name: /^Lab result from / });
}

/**
 * The lab result card for a YYYY-MM-DD day
 */
export function labResultCard(page: Page, day: string): Locator {
  return page
    .getByRole('main')
    .getByRole('region', { name: `Lab result from ${longDate(day)}`, exact: true });
}

/**
 * A lab result card's expand button, which says whether the card is open
 */
export function expandButton(card: Locator): Locator {
  return card.getByRole('button', { name: /^(Expand|Collapse) lab result from / });
}

/**
 * And I expand the lab result card
 */
export async function expandLabResult(page: Page, day: string): Promise<Locator> {
  const card = labResultCard(page, day);
  await card.getByRole('button', { name: `Expand lab result from ${longDate(day)}` }).click();
  await expect(expandButton(card)).toHaveAttribute('aria-expanded', 'true');
  await waitForAnimations(card);
  return card;
}

/**
 * Wait until CSS transitions inside `container` have finished. Mantine's
 * Collapse animates height; clicking inside it mid-animation can lose the
 * click (the element moves between mousedown and mouseup).
 */
export async function waitForAnimations(container: Locator): Promise<void> {
  await expect
    .poll(() => container.evaluate((el) => el.getAnimations({ subtree: true }).length))
    .toBe(0);
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Pick a YYYY-MM-DD day in a Mantine DatePickerInput, going through the
 * decade and year levels so the starting month does not matter.
 */
export async function pickDate(page: Page, pickerLabel: string, day: string): Promise<void> {
  const [year, month, date] = day.split('-').map(Number);
  const monthName = MONTHS[month - 1];
  const picker = page.getByRole('main').getByRole('button', { name: pickerLabel, exact: true });

  await picker.click();
  const calendar = page.getByRole('dialog');
  await expect(calendar).toBeVisible();

  // Month level -> year level -> decade level
  await calendar.getByRole('button', { name: /^[A-Z][a-z]+ \d{4}$/ }).click();
  await calendar.getByRole('button', { name: /^\d{4}$/ }).click();

  await calendar.getByRole('button', { name: String(year), exact: true }).click();
  await calendar.getByRole('button', { name: new RegExp(`^${monthName.slice(0, 3)}`) }).click();
  await calendar.getByRole('button', { name: `${date} ${monthName} ${year}`, exact: true }).click();

  await expect(calendar).toBeHidden();
}

/** A test name in a lab result's table that opens the test's trend */
export function trendLink(card: Locator, biomarkerName: string): Locator {
  return card
    .getByRole('table', { name: 'Test values' })
    .getByRole('button', { name: `${biomarkerName}, open trend`, exact: true });
}
