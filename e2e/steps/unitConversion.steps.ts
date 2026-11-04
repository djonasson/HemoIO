/**
 * Step definitions for features/unit-conversion.feature
 *
 * The app converts units where the user can see it in two places:
 * - Trends: every value of a biomarker is plotted in the dictionary's
 *   canonical unit, whatever unit it was recorded in.
 * - Import review: the same biomarker reported twice in different units is
 *   compared after conversion and merged, or flagged as a conflict.
 *
 * Measurements are seeded through a backup restore (see data.steps.ts).
 * Biomarker IDs are 1-indexed positions in BIOMARKER_DEFINITIONS
 * (src/data/biomarkers/dictionary.ts); display names come from rawText.
 */

import { expect, type Locator, type Page } from '@playwright/test';
import { openFromMenu } from './app.steps';
import { expectAnalysisFinished } from './importWizard.steps';
import { configureOllamaProvider, mockOllama, type ExtractedBiomarkerFixture } from './ai.steps';
import { seedLabData } from './data.steps';
import { removeTempFile, writeTempFile } from './tempFiles';
import { dataPoints, goToTrends, selectBiomarker } from './trends.steps';

export interface DictionaryBiomarker {
  id: number;
  name: string;
}

export const HEMOGLOBIN: DictionaryBiomarker = { id: 3, name: 'Hemoglobin' };
export const HEMATOCRIT: DictionaryBiomarker = { id: 4, name: 'Hematocrit' };
export const GLUCOSE: DictionaryBiomarker = { id: 22, name: 'Glucose' };
export const CREATININE: DictionaryBiomarker = { id: 23, name: 'Creatinine' };
export const EGFR: DictionaryBiomarker = { id: 31, name: 'eGFR' };
export const TOTAL_CHOLESTEROL: DictionaryBiomarker = { id: 32, name: 'Total Cholesterol' };
export const TSH: DictionaryBiomarker = { id: 38, name: 'Thyroid Stimulating Hormone' };
export const TPO_ANTIBODIES: DictionaryBiomarker = { id: 43, name: 'TPO Antibodies' };
export const VITAMIN_D: DictionaryBiomarker = { id: 50, name: 'Vitamin D' };
export const URINE_EPITHELIAL_CELLS: DictionaryBiomarker = { id: 65, name: 'Urine Epithelial Cells' };
export const URINE_CREATININE: DictionaryBiomarker = { id: 66, name: 'Urine Creatinine' };
export const PROTEIN_CREATININE_RATIO: DictionaryBiomarker = { id: 70, name: 'Protein Creatinine Ratio' };
export const ALT: DictionaryBiomarker = { id: 73, name: 'Alanine Aminotransferase' };

/** One recorded value, as a lab report would state it */
export interface Measurement {
  /** YYYY-MM-DD; each distinct day becomes one lab result */
  day: string;
  biomarker: DictionaryBiomarker;
  value: number;
  unit: string;
  low?: number;
  high?: number;
  /** Name as printed on the report; defaults to the dictionary name */
  rawText?: string;
}

/**
 * Given I have these measurements — seed them through a backup restore.
 * Ends on the timeline.
 */
export async function seedMeasurements(
  page: Page,
  measurements: Measurement[],
  options: { userPreferences?: unknown } = {}
): Promise<void> {
  const days = [...new Set(measurements.map((m) => m.day))].sort();
  const labResults = days.map((day, index) => {
    // Midday UTC keeps the calendar day stable in any time zone
    const timestamp = `${day}T12:00:00.000Z`;
    return { id: index + 1, date: timestamp, labName: `Lab ${index + 1}`, createdAt: timestamp, updatedAt: timestamp };
  });

  const testValues = measurements.map((m, index) => {
    const timestamp = `${m.day}T12:00:00.000Z`;
    return {
      id: index + 1,
      labResultId: days.indexOf(m.day) + 1,
      biomarkerId: m.biomarker.id,
      rawText: m.rawText ?? m.biomarker.name,
      value: m.value,
      unit: m.unit,
      referenceRangeLow: m.low,
      referenceRangeHigh: m.high,
      confidence: 0.95,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });

  await seedLabData(page, {
    labResults,
    testValues,
    userNotes: [],
    userPreferences: options.userPreferences,
  });
}

/**
 * When I view the trend for <name>
 */
export async function openTrend(page: Page, biomarkerName: string): Promise<void> {
  await goToTrends(page);
  await selectBiomarker(page, biomarkerName);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Then the trend shows these values, in date order, each in the given unit.
 * Data points are labelled "<date>: <value> <unit> (<status>)".
 */
export async function expectTrendValues(page: Page, expected: Array<{ value: string; unit: string }>): Promise<void> {
  const points = dataPoints(page);
  await expect(points).toHaveCount(expected.length);
  for (const [index, { value, unit }] of expected.entries()) {
    await expect(points.nth(index)).toHaveAttribute(
      'aria-label',
      new RegExp(`: ${escapeRegExp(value)} ${escapeRegExp(unit)} \\(`)
    );
  }
}

/**
 * The chart title, "<biomarker> (<unit>)"
 */
export function trendTitle(page: Page, biomarkerName: string, unit: string): Locator {
  return page.getByRole('main').getByText(`${biomarkerName} (${unit})`, { exact: true });
}

/**
 * The searchable select, on the Trends view, for the unit a biomarker is
 * shown in
 */
export function preferredUnitControl(page: Page): Locator {
  return page.getByRole('main').getByRole('textbox', { name: 'Preferred unit' });
}

/**
 * When I set my preferred unit to <unit>
 */
export async function setPreferredUnit(page: Page, unit: string): Promise<void> {
  await preferredUnitControl(page).click();
  await page.getByRole('option', { name: unit, exact: true }).click();
  await expect(preferredUnitControl(page)).toHaveValue(unit);
}

/**
 * Build a one-page PDF containing the given lines of text, so the import
 * pipeline takes its PDF text-extraction path (no OCR).
 */
export function buildTextPdf(lines: string[]): Buffer {
  const escapePdf = (text: string): string => text.replace(/[\\()]/g, '\\$&');
  const stream = ['BT', '/F1 12 Tf', '72 720 Td', '16 TL', ...lines.map((l) => `(${escapePdf(l)}) Tj T*`), 'ET'].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/**
 * Given a lab report contains <biomarkers> / When the values are analyzed.
 *
 * Imports `reportCount` text PDFs with a mocked local AI that extracts
 * exactly `biomarkers` from each, and ends on the review step. A single
 * report may be given its file name; `onUploaded` runs once the files are
 * chosen, before they are analyzed, and `onAnalyzed` once the analysis step
 * is done, before going on to review. With `toReview: false` it stops on
 * the analysis step — as it must when no file has values to review.
 */
export async function analyzeReport(
  page: Page,
  biomarkers: ExtractedBiomarkerFixture[],
  reportCount = 1,
  {
    fileName = 'lab-report.pdf',
    onUploaded,
    onAnalyzed,
    toReview = true,
  }: {
    fileName?: string;
    onUploaded?: () => Promise<void>;
    onAnalyzed?: () => Promise<void>;
    toReview?: boolean;
  } = {}
): Promise<void> {
  await mockOllama(page, {
    biomarkers,
    labDate: '2024-03-10',
    labName: 'Unit Test Laboratory',
    warnings: [],
  });
  await configureOllamaProvider(page);

  const reportText = biomarkers.map((b) => `${b.name} ${b.value} ${b.unit.replace('µ', 'u')}`);
  const pdf = buildTextPdf(['Laboratory report', ...reportText]);
  const pdfPaths = Array.from({ length: reportCount }, (_, i) =>
    writeTempFile(reportCount === 1 ? fileName : `lab-report-${i + 1}.pdf`, pdf)
  );
  try {
    await openFromMenu(page, 'Import');
    await page.locator('input[type="file"]').setInputFiles(pdfPaths);
    await onUploaded?.();
    await page.getByRole('button', { name: `Analyze (${reportCount})` }).click();

    await expectAnalysisFinished(page);
    await onAnalyzed?.();
    if (!toReview) return;

    const review = page.getByRole('button', { name: /^Review Results/ });
    await expect(review).toBeEnabled();
    await review.click();
    await expect(page.getByText('Review Extracted Values', { exact: true })).toBeVisible();
  } finally {
    pdfPaths.forEach(removeTempFile);
  }
}

/**
 * Rows of the review table, one per extracted value
 */
export function reviewRows(page: Page): Locator {
  return page
    .getByRole('main')
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: 'Remove biomarker' }) });
}

/**
 * The "Duplicate Biomarkers Detected" warning on the review step
 */
export function duplicateWarning(page: Page): Locator {
  return page
    .getByRole('main')
    .getByRole('alert')
    .filter({ hasText: 'Duplicate Biomarkers Detected' });
}
