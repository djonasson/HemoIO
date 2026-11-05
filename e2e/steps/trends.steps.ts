/**
 * Step definitions for features/trend-charts.feature (also used by alerts)
 *
 * Builds scenario-specific lab data for seedLabData(). A test is keyed by its
 * LOINC code, or by an "unknown:" key for a value saved as not a LOINC test,
 * which is named by its rawText as imported values are.
 */

import { expect, type Locator, type Page } from '@playwright/test';
import { openFromMenu } from './app.steps';
import { seedLabData } from './data.steps';

export interface BiomarkerFixture {
  /** LOINC code, or an "unknown:" key */
  key: string;
  name: string;
  unit: string;
  low: number;
  high: number;
}

export const HEMOGLOBIN: BiomarkerFixture = { key: '718-7', name: 'Hemoglobin', unit: 'g/dL', low: 12, high: 17.5 };
export const GLUCOSE: BiomarkerFixture = { key: '2345-7', name: 'Glucose', unit: 'mg/dL', low: 70, high: 100 };
export const LDL: BiomarkerFixture = { key: '13457-7', name: 'LDL Cholesterol', unit: 'mg/dL', low: 0, high: 100 };
export const HDL: BiomarkerFixture = { key: '2085-9', name: 'HDL Cholesterol', unit: 'mg/dL', low: 40, high: 60 };
/** One unit only, so its chart offers no unit choice */
export const RDW: BiomarkerFixture = { key: '788-0', name: 'Red Cell Distribution Width', unit: '%', low: 11.5, high: 14.5 };
export const VITAMIN_D: BiomarkerFixture = { key: '62292-8', name: 'Vitamin D', unit: 'ng/mL', low: 30, high: 100 };

/** One lab visit: its date, lab and the values measured on it */
export interface LabVisit {
  /** ISO date (YYYY-MM-DD); stored at 10:00 UTC so it never straddles a day */
  date: string;
  labName?: string;
  /** A value is in its biomarker's unit unless it names another */
  values: Array<{ biomarker: BiomarkerFixture; value: number; unit?: string }>;
}

/**
 * Turn lab visits into backup labResults/testValues
 */
export function buildLabData(visits: LabVisit[]): { labResults: object[]; testValues: object[] } {
  const labResults: object[] = [];
  const testValues: object[] = [];

  visits.forEach((visit, index) => {
    const labResultId = index + 1;
    const timestamp = `${visit.date}T10:00:00.000Z`;
    labResults.push({
      id: labResultId,
      date: timestamp,
      labName: visit.labName ?? `Lab ${labResultId}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    for (const { biomarker, value, unit } of visit.values) {
      testValues.push({
        id: testValues.length + 1,
        labResultId,
        biomarkerKey: biomarker.key,
        rawText: biomarker.name,
        value,
        unit: unit ?? biomarker.unit,
        referenceRangeLow: biomarker.low,
        referenceRangeHigh: biomarker.high,
        confidence: 0.95,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  });

  return { labResults, testValues };
}

/**
 * Given I have lab results — seed the visits through a backup restore
 */
export async function seedVisits(page: Page, visits: LabVisit[]): Promise<void> {
  await seedLabData(page, { ...buildLabData(visits), userNotes: [] });
}

/**
 * When I navigate to the Trends view
 */
export async function goToTrends(page: Page): Promise<void> {
  await openFromMenu(page, 'Trends');
  await expect(page.getByRole('main').getByRole('heading', { name: 'Trends', level: 2 })).toBeVisible();
}

export function biomarkerSelect(page: Page): Locator {
  return page.getByRole('main').getByRole('textbox', { name: 'Select biomarker to view trend' });
}

/**
 * And I select "<name>" from the biomarker dropdown
 */
export async function selectBiomarker(page: Page, name: string): Promise<void> {
  await biomarkerSelect(page).click();
  await page.getByRole('option', { name: new RegExp(`^${name} \\(\\d+ values?\\)$`) }).click();
  await expect(biomarkerSelect(page)).toHaveValue(new RegExp(`^${name} \\(`));
}

/**
 * The trend chart's SVG data points, labelled "<date>: <value> <unit> (<status>)"
 */
export function dataPoints(page: Page): Locator {
  return page.getByRole('main').locator('.recharts-line-dots circle');
}

/**
 * Pick a calendar day in a Mantine DatePickerInput by drilling down
 * decade → year → month, so it works whatever month the picker opens on.
 */
export async function pickDate(page: Page, inputLabel: string, isoDate: string): Promise<void> {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const monthName = date.toLocaleDateString('en-US', { month: 'long' });

  await page.getByRole('main').getByRole('button', { name: inputLabel }).click();
  const dropdown = page.getByRole('dialog');
  await expect(dropdown).toBeVisible();

  // Month level header → year level, then year level header → decade level
  await dropdown.locator('.mantine-DatePickerInput-calendarHeaderLevel').click();
  await dropdown.locator('.mantine-DatePickerInput-calendarHeaderLevel').click();
  await dropdown.getByRole('button', { name: String(year), exact: true }).click();
  await dropdown.getByRole('button', { name: new RegExp(`^${monthName.slice(0, 3)}`) }).click();
  await dropdown.getByRole('button', { name: `${day} ${monthName} ${year}`, exact: true }).click();
  await expect(dropdown).toBeHidden();
}

/**
 * The reference link next to the chart's biomarker picker
 */
export function referenceLink(page: Page, name: string): Locator {
  return page.getByRole('main').getByRole('button', { name: `View reference for ${name}`, exact: true });
}
