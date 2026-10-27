/**
 * E2E Tests for Unit Conversion (features/unit-conversion.feature)
 *
 * Conversion arithmetic is covered by unit tests in src/services/units. These
 * tests check what the user sees:
 * - the dictionary lists each biomarker's standard and alternative units
 * - the Trends view shows every value of a biomarker in its standard unit,
 *   converting values (and reference ranges) recorded in other units
 * - international names and unit spellings are recognized
 * - the import review merges the same value reported in two units, and
 *   flags genuinely different values as a conflict
 * - the user can choose a preferred display unit per biomarker
 */

import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { setupOrUnlock, unlockApp } from './steps/app.steps';
import { expandLabResult } from './steps/timeline.steps';
import {
  ALT,
  CREATININE,
  EGFR,
  GLUCOSE,
  HEMATOCRIT,
  HEMOGLOBIN,
  PROTEIN_CREATININE_RATIO,
  TOTAL_CHOLESTEROL,
  TPO_ANTIBODIES,
  TSH,
  URINE_CREATININE,
  URINE_EPITHELIAL_CELLS,
  VITAMIN_D,
  analyzeReport,
  duplicateWarning,
  expectTrendValues,
  openTrend,
  preferredUnitControl,
  reviewRows,
  seedMeasurements,
  setPreferredUnit,
  trendTitle,
} from './steps/unitConversion.steps';

const DAY_1 = '2024-01-15';
const DAY_2 = '2024-02-20';

async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await setupOrUnlock(page);
}

async function navigateToDictionary(page: Page): Promise<void> {
  await page.getByRole('navigation').getByRole('button', { name: /^Biomarkers/ }).click();
  await expect(page.getByRole('heading', { name: 'Biomarker Dictionary' })).toBeVisible();
}

/**
 * The detail panel for a biomarker, identified by its heading
 */
function biomarkerDetail(page: Page, name: string) {
  return page
    .getByRole('main')
    .locator('.mantine-Paper-root')
    .filter({ has: page.getByRole('heading', { level: 3, name, exact: true }) });
}

test.describe('Unit Conversion', () => {
  test.describe('Biomarker Dictionary - Units Display', () => {
    test('should list the standard unit and the alternative units of a biomarker', async ({ page }) => {
      await openApp(page);
      await navigateToDictionary(page);

      await page.getByRole('textbox', { name: 'Search biomarkers' }).fill('Glucose');
      await page.getByRole('button', { name: 'View details for Glucose', exact: true }).click();

      const detail = biomarkerDetail(page, 'Glucose');
      await expect(detail).toBeVisible();
      await expect(detail.getByText('Units', { exact: true })).toBeVisible();
      await expect(detail.getByText('mg/dL', { exact: true })).toBeVisible();
      await expect(detail.getByText('mmol/L', { exact: true })).toBeVisible();
    });

    test('should show the standard reference range in the standard unit', async ({ page }) => {
      await openApp(page);
      await navigateToDictionary(page);

      await page.getByRole('textbox', { name: 'Search biomarkers' }).fill('Hemoglobin');
      await page.getByRole('button', { name: 'View details for Hemoglobin', exact: true }).click();

      const detail = biomarkerDetail(page, 'Hemoglobin');
      await expect(detail.getByText('12 - 17.5 g/dL', { exact: true })).toBeVisible();
      await expect(detail.getByText('g/dL', { exact: true })).toBeVisible();
      await expect(detail.getByText('g/L', { exact: true })).toBeVisible();
    });
  });
});

test.describe('Unit Conversion - With Data', () => {
  test('should display glucose value with correct unit', async ({ page }) => {
    // Scenario: No conversion needed for same unit
    await openApp(page);
    await seedMeasurements(page, [
      { day: DAY_1, biomarker: GLUCOSE, value: 95, unit: 'mg/dL' },
      { day: DAY_2, biomarker: GLUCOSE, value: 100, unit: 'mg/dL' },
    ]);

    const card = await expandLabResult(page, DAY_2);
    await expect(card.getByRole('row', { name: /^Glucose: 100 mg\/dL,/ })).toBeVisible();

    await openTrend(page, 'Glucose');
    await expect(trendTitle(page, 'Glucose', 'mg/dL')).toBeVisible();
    await expectTrendValues(page, [
      { value: '95', unit: 'mg/dL' },
      { value: '100', unit: 'mg/dL' },
    ]);
  });

  test('should convert glucose from mmol/L to mg/dL', async ({ page }) => {
    // Scenario: Convert glucose from mmol/L to mg/dL (5.55 mmol/L ≈ 100 mg/dL)
    await openApp(page);
    await seedMeasurements(page, [
      { day: DAY_1, biomarker: GLUCOSE, value: 90, unit: 'mg/dL' },
      { day: DAY_2, biomarker: GLUCOSE, value: 5.55, unit: 'mmol/L' },
    ]);

    await openTrend(page, 'Glucose');
    await expect(trendTitle(page, 'Glucose', 'mg/dL')).toBeVisible();
    await expectTrendValues(page, [
      { value: '90', unit: 'mg/dL' },
      { value: '100', unit: 'mg/dL' },
    ]);
  });

  test('should convert glucose from mg/dL to mmol/L when mmol/L is the preferred unit', async ({ page }) => {
    // Scenarios: Convert glucose from mg/dL to mmol/L (100 mg/dL ≈ 5.55 mmol/L)
    //            User sets preferred unit for a biomarker
    await openApp(page);
    await seedMeasurements(page, [
      { day: DAY_1, biomarker: GLUCOSE, value: 100, unit: 'mg/dL' },
      { day: DAY_2, biomarker: GLUCOSE, value: 120, unit: 'mg/dL' },
    ]);

    await openTrend(page, 'Glucose');
    await setPreferredUnit(page, 'mmol/L');

    await expect(trendTitle(page, 'Glucose', 'mmol/L')).toBeVisible();
    await expectTrendValues(page, [
      { value: '5.55', unit: 'mmol/L' },
      { value: '6.66', unit: 'mmol/L' },
    ]);
  });

  test('should convert cholesterol between mmol/L and mg/dL', async ({ page }) => {
    // Scenario: Convert cholesterol (200 mg/dL ≈ 5.17 mmol/L)
    await openApp(page);
    await seedMeasurements(page, [
      { day: DAY_1, biomarker: TOTAL_CHOLESTEROL, value: 180, unit: 'mg/dL' },
      { day: DAY_2, biomarker: TOTAL_CHOLESTEROL, value: 5.17, unit: 'mmol/L' },
    ]);

    await openTrend(page, 'Total Cholesterol');
    await expect(trendTitle(page, 'Total Cholesterol', 'mg/dL')).toBeVisible();
    await expectTrendValues(page, [
      { value: '180', unit: 'mg/dL' },
      { value: '200', unit: 'mg/dL' },
    ]);
  });

  test('should convert hemoglobin between g/L and g/dL', async ({ page }) => {
    // Scenario: Convert hemoglobin (14 g/dL = 140 g/L)
    await openApp(page);
    await seedMeasurements(page, [
      { day: DAY_1, biomarker: HEMOGLOBIN, value: 13.5, unit: 'g/dL' },
      { day: DAY_2, biomarker: HEMOGLOBIN, value: 140, unit: 'g/L' },
    ]);

    await openTrend(page, 'Hemoglobin');
    await expect(trendTitle(page, 'Hemoglobin', 'g/dL')).toBeVisible();
    await expectTrendValues(page, [
      { value: '13.5', unit: 'g/dL' },
      { value: '14', unit: 'g/dL' },
    ]);
  });

  test('should convert creatinine between µmol/L and mg/dL', async ({ page }) => {
    // Scenario: Convert creatinine (1.0 mg/dL ≈ 88.4 µmol/L)
    await openApp(page);
    await seedMeasurements(page, [
      { day: DAY_1, biomarker: CREATININE, value: 0.9, unit: 'mg/dL' },
      { day: DAY_2, biomarker: CREATININE, value: 88.4, unit: 'µmol/L' },
    ]);

    await openTrend(page, 'Creatinine');
    await expect(trendTitle(page, 'Creatinine', 'mg/dL')).toBeVisible();
    await expectTrendValues(page, [
      { value: '0.9', unit: 'mg/dL' },
      { value: '1', unit: 'mg/dL' },
    ]);
  });

  test('should convert vitamin D between nmol/L and ng/mL', async ({ page }) => {
    // Scenario: Convert vitamin D (30 ng/mL ≈ 75 nmol/L)
    await openApp(page);
    await seedMeasurements(page, [
      { day: DAY_1, biomarker: VITAMIN_D, value: 28, unit: 'ng/mL' },
      { day: DAY_2, biomarker: VITAMIN_D, value: 75, unit: 'nmol/L' },
    ]);

    await openTrend(page, 'Vitamin D');
    await expect(trendTitle(page, 'Vitamin D', 'ng/mL')).toBeVisible();
    await expectTrendValues(page, [
      { value: '28', unit: 'ng/mL' },
      { value: '30.1', unit: 'ng/mL' },
    ]);
  });

  test('should show no conversion for equivalent units like TSH', async ({ page }) => {
    // Scenario: Convert TSH between equivalent units (2.5 mIU/L = 2.5 µIU/mL)
    await openApp(page);
    await seedMeasurements(page, [
      { day: DAY_1, biomarker: TSH, value: 2, unit: 'mIU/L' },
      { day: DAY_2, biomarker: TSH, value: 2.5, unit: 'µIU/mL' },
    ]);

    await openTrend(page, 'Thyroid Stimulating Hormone');
    await expect(trendTitle(page, 'Thyroid Stimulating Hormone', 'mIU/L')).toBeVisible();
    await expectTrendValues(page, [
      { value: '2', unit: 'mIU/L' },
      { value: '2.5', unit: 'mIU/L' },
    ]);
  });

  test('should convert reference ranges along with values', async ({ page }) => {
    // Scenario: Reference ranges are converted along with values
    // (70-100 mg/dL ≈ 3.9-5.6 mmol/L)
    await openApp(page);
    await seedMeasurements(page, [
      { day: DAY_1, biomarker: GLUCOSE, value: 5.0, unit: 'mmol/L', low: 3.9, high: 5.6 },
      { day: DAY_2, biomarker: GLUCOSE, value: 5.55, unit: 'mmol/L', low: 3.9, high: 5.6 },
    ]);

    await openTrend(page, 'Glucose');
    await expectTrendValues(page, [
      { value: '90', unit: 'mg/dL' },
      { value: '100', unit: 'mg/dL' },
    ]);

    const main = page.getByRole('main');
    await expect(main.getByText('70 - 101 mg/dL', { exact: true })).toBeVisible();
    await expect(main.getByText('Low: 70', { exact: true })).toBeVisible();
    await expect(main.getByText('High: 101', { exact: true })).toBeVisible();
  });

  test('should save unit preference per biomarker', async ({ page }) => {
    // Scenario: User sets preferred unit for a biomarker — "the preference
    // should be saved"
    await openApp(page);
    await seedMeasurements(page, [
      { day: DAY_1, biomarker: GLUCOSE, value: 100, unit: 'mg/dL' },
      { day: DAY_2, biomarker: GLUCOSE, value: 120, unit: 'mg/dL' },
    ]);

    await openTrend(page, 'Glucose');
    await setPreferredUnit(page, 'mmol/L');

    // A new session: reload locks the app again
    await page.reload();
    await unlockApp(page);
    await openTrend(page, 'Glucose');

    await expect(preferredUnitControl(page)).toHaveValue('mmol/L');
    await expectTrendValues(page, [
      { value: '5.55', unit: 'mmol/L' },
      { value: '6.66', unit: 'mmol/L' },
    ]);
  });

  test('should show the preferred unit on the timeline and in alerts', async ({ page }) => {
    // Scenario: User sets preferred unit — "the timeline and the alerts
    // should show glucose in mmol/L"
    await openApp(page);
    await seedMeasurements(page, [
      { day: DAY_1, biomarker: GLUCOSE, value: 100, unit: 'mg/dL', low: 70, high: 100 },
      { day: DAY_2, biomarker: GLUCOSE, value: 120, unit: 'mg/dL', low: 70, high: 100 },
    ]);

    await openTrend(page, 'Glucose');
    await setPreferredUnit(page, 'mmol/L');

    await page.getByRole('navigation').getByRole('button', { name: /^Timeline/ }).click();
    const card = await expandLabResult(page, DAY_2);
    await expect(card.getByRole('row', { name: /^Glucose: 6\.66 mmol\/L,/ })).toBeVisible();

    await page.getByRole('navigation').getByRole('button', { name: /^Alerts/ }).click();
    await expect(
      page.getByRole('main').getByText(/Glucose is high at 6\.66 mmol\/L/).first()
    ).toBeVisible();
  });

  test('should handle precision appropriately', async ({ page }) => {
    // Scenario: Handle precision appropriately — converted values are shown
    // with sensible decimals, never raw floating-point results
    await openApp(page);
    await seedMeasurements(page, [
      { day: DAY_1, biomarker: GLUCOSE, value: 99.7, unit: 'mg/dL', low: 70, high: 100 },
      // 5.53 mmol/L × 18.018 = 99.63954 mg/dL
      { day: DAY_2, biomarker: GLUCOSE, value: 5.53, unit: 'mmol/L', low: 3.9, high: 5.6 },
    ]);

    await openTrend(page, 'Glucose');
    await expectTrendValues(page, [
      { value: '99.7', unit: 'mg/dL' },
      { value: '100', unit: 'mg/dL' },
    ]);

    // Statistics (latest, average, min, max, reference) show no excessive decimals
    await expect(page.getByRole('main').getByText('Latest Value', { exact: true })).toBeVisible();
    await expect(page.getByRole('main')).not.toContainText(/\d\.\d{3,}/);
  });
});

test.describe('Unit Conversion - International Aliases', () => {
  test('should recognize Italian creatinine alias', async ({ page }) => {
    // Scenario: Convert using Italian biomarker alias
    // (67 µmol/L ≈ 0.76 mg/dL, recognized as Creatinine)
    await openApp(page);
    await seedMeasurements(page, [
      { day: DAY_1, biomarker: CREATININE, value: 0.9, unit: 'mg/dL' },
      {
        day: DAY_2,
        biomarker: CREATININE,
        value: 67,
        unit: 'µmol/L',
        rawText: 'P-Creatinina (metodo enzimatico)',
      },
    ]);

    // Both values appear under one "Creatinine" trend
    await openTrend(page, 'Creatinine');
    await expect(trendTitle(page, 'Creatinine', 'mg/dL')).toBeVisible();
    await expectTrendValues(page, [
      { value: '0.9', unit: 'mg/dL' },
      { value: '0.76', unit: 'mg/dL' },
    ]);
  });

  test('should convert urine creatinine with Italian alias', async ({ page }) => {
    // Scenario: Convert urine creatinine with Italian alias
    // (3780 µmol/L ≈ 0.43 g/L = 43 mg/dL)
    await openApp(page);
    await seedMeasurements(page, [
      { day: DAY_1, biomarker: URINE_CREATININE, value: 3780, unit: 'µmol/L', rawText: 'U-Creatinina' },
      { day: DAY_2, biomarker: URINE_CREATININE, value: 0.43, unit: 'g/L', rawText: 'U-Creatinina' },
    ]);

    await openTrend(page, 'Urine Creatinine');
    await expect(trendTitle(page, 'Urine Creatinine', 'mg/dL')).toBeVisible();
    await expectTrendValues(page, [
      { value: '43', unit: 'mg/dL' },
      { value: '43', unit: 'mg/dL' },
    ]);
  });

  test('should convert protein/creatinine ratio with Italian alias', async ({ page }) => {
    // Scenario: Convert protein/creatinine ratio with Italian alias
    // (15 mg/mmol ≈ 133 mg/g)
    await openApp(page);
    await seedMeasurements(page, [
      {
        day: DAY_1,
        biomarker: PROTEIN_CREATININE_RATIO,
        value: 15,
        unit: 'mg/mmol',
        rawText: 'U-Proteine/Creatinina',
      },
      { day: DAY_2, biomarker: PROTEIN_CREATININE_RATIO, value: 120, unit: 'mg/g' },
    ]);

    await openTrend(page, 'Protein Creatinine Ratio');
    await expect(trendTitle(page, 'Protein Creatinine Ratio', 'mg/g')).toBeVisible();
    await expectTrendValues(page, [
      { value: '132.6', unit: 'mg/g' },
      { value: '120', unit: 'mg/g' },
    ]);
  });

  test('should normalize European decimal notation', async ({ page }) => {
    // Scenario: Convert eGFR with European notation
    // ("mL/min/1,73m²" is recognized as mL/min/1.73m²)
    await openApp(page);
    await seedMeasurements(page, [
      { day: DAY_1, biomarker: EGFR, value: 90, unit: 'mL/min/1,73m²' },
      { day: DAY_2, biomarker: EGFR, value: 85, unit: 'mL/min/1.73m²' },
    ]);

    await openTrend(page, 'eGFR');
    await expect(trendTitle(page, 'eGFR', 'mL/min/1.73m²')).toBeVisible();
    await expectTrendValues(page, [
      { value: '90', unit: 'mL/min/1.73m²' },
      { value: '85', unit: 'mL/min/1.73m²' },
    ]);
  });

  test('should recognize equivalent enzyme units', async ({ page }) => {
    // Scenario: Convert enzymes between U/L and IU/L (35 U/L = 35 IU/L)
    await openApp(page);
    await seedMeasurements(page, [
      { day: DAY_1, biomarker: ALT, value: 35, unit: 'IU/L' },
      { day: DAY_2, biomarker: ALT, value: 30, unit: 'U/L' },
    ]);

    await openTrend(page, 'Alanine Aminotransferase');
    await expect(trendTitle(page, 'Alanine Aminotransferase', 'U/L')).toBeVisible();
    await expectTrendValues(page, [
      { value: '35', unit: 'U/L' },
      { value: '30', unit: 'U/L' },
    ]);
  });

  test('should recognize equivalent TPO antibody units', async ({ page }) => {
    // Scenario: Convert TPO antibodies between unit variants (150 IU/mL = 150 kIU/L)
    await openApp(page);
    await seedMeasurements(page, [
      { day: DAY_1, biomarker: TPO_ANTIBODIES, value: 150, unit: 'kIU/L' },
      { day: DAY_2, biomarker: TPO_ANTIBODIES, value: 100, unit: 'IU/mL' },
    ]);

    await openTrend(page, 'TPO Antibodies');
    await expect(trendTitle(page, 'TPO Antibodies', 'IU/mL')).toBeVisible();
    await expectTrendValues(page, [
      { value: '150', unit: 'IU/mL' },
      { value: '100', unit: 'IU/mL' },
    ]);
  });

  test('should convert hematocrit between a ratio and a percentage', async ({ page }) => {
    // Scenario: Convert hematocrit from percentage to ratio (45% = 0.45 L/L)
    await openApp(page);
    await seedMeasurements(page, [
      { day: DAY_1, biomarker: HEMATOCRIT, value: 0.45, unit: 'L/L' },
      { day: DAY_2, biomarker: HEMATOCRIT, value: 42, unit: '%' },
    ]);

    await openTrend(page, 'Hematocrit');
    await expect(trendTitle(page, 'Hematocrit', '%')).toBeVisible();
    await expectTrendValues(page, [
      { value: '45', unit: '%' },
      { value: '42', unit: '%' },
    ]);
  });
});

test.describe('Unit Conversion - Duplicate Detection', () => {
  // Analysis runs PDF text extraction and the (mocked) AI round trip
  test.slow();

  test('should detect equivalent values in different units', async ({ page }) => {
    // Scenario: Detect equivalent values in different units
    // (creatinine 67 µmol/L and 0.76 mg/dL)
    await openApp(page);
    await analyzeReport(page, [
      { name: 'Creatinine', value: 67, unit: 'µmol/L', confidence: 0.95 },
      { name: 'Creatinine', value: 0.76, unit: 'mg/dL', confidence: 0.95 },
    ]);

    // Only one value is kept — the one in the standard unit
    const rows = reviewRows(page);
    await expect(rows).toHaveCount(1);
    await expect(rows.getByRole('cell', { name: 'Creatinine', exact: true })).toBeVisible();
    await expect(rows.getByRole('cell', { name: '0.76', exact: true })).toBeVisible();
    await expect(rows.getByRole('cell', { name: 'mg/dL', exact: true })).toBeVisible();

    await expect(duplicateWarning(page)).toHaveCount(0);
    await expect(page.getByText(/\d+ conflicts/)).toHaveCount(0);
  });

  test('should detect equivalent urine creatinine values', async ({ page }) => {
    // Scenario: Detect equivalent urine creatinine values (3780 µmol/L and 0.42 g/L)
    await openApp(page);
    await analyzeReport(page, [
      { name: 'U-Creatinina', value: 3780, unit: 'µmol/L', confidence: 0.95 },
      { name: 'U-Creatinina', value: 0.42, unit: 'g/L', confidence: 0.95 },
    ]);

    await expect(reviewRows(page)).toHaveCount(1);
    await expect(duplicateWarning(page)).toHaveCount(0);
  });

  test('should detect equivalent protein/creatinine ratio values', async ({ page }) => {
    // Scenario: Detect equivalent protein/creatinine ratio values
    // (15 mg/mmolcreat. and 132 mg/gcreat.)
    await openApp(page);
    await analyzeReport(page, [
      { name: 'U-Proteine/Creatinina', value: 15, unit: 'mg/mmolcreat.', confidence: 0.95 },
      { name: 'U-Proteine/Creatinina', value: 132, unit: 'mg/gcreat.', confidence: 0.95 },
    ]);

    await expect(reviewRows(page)).toHaveCount(1);
    await expect(duplicateWarning(page)).toHaveCount(0);
  });

  test('should merge the values an Italian report gives in two units', async ({ page }) => {
    // Scenario: Merge the values an Italian report gives in two units
    await openApp(page);
    await analyzeReport(page, [
      { name: 'Urea', value: 3.06, unit: 'mmol/L', confidence: 0.95 },
      { name: 'Urea', value: 18, unit: 'mg/dL', confidence: 0.95 },
      { name: 'Acido urico', value: 247, unit: 'µmol/L', confidence: 0.95 },
      { name: 'Acido urico', value: 4.15, unit: 'mg/dL', confidence: 0.95 },
      { name: 'Ferro', value: 38.4, unit: 'µmol/L', confidence: 0.95 },
      { name: 'Ferro', value: 214, unit: 'µg/dL', confidence: 0.95 },
      { name: 'Vitamina D (25-OH)', value: 81.5, unit: 'nmol/L', confidence: 0.95 },
      { name: 'Vitamina D (25-OH)', value: 32.6, unit: 'ng/mL', confidence: 0.95 },
      { name: 'Reticolociti', value: 16.7, unit: '‰', confidence: 0.95 },
      { name: 'Reticolociti', value: 1.67, unit: '%', confidence: 0.95 },
      { name: 'Urea/L (urine)', value: 117, unit: 'mmol/L', confidence: 0.95 },
      { name: 'Urea/L (urine)', value: 7, unit: 'g/L', confidence: 0.95 },
    ]);

    // One value of each, in the standard unit; urea is not blood urea nitrogen
    const rows = reviewRows(page);
    await expect(rows).toHaveCount(6);
    for (const value of ['18', '4.15', '214', '32.6', '1.67', '7']) {
      await expect(rows.getByRole('cell', { name: value, exact: true })).toBeVisible();
    }
    await expect(page.getByText(/Blood Urea Nitrogen/)).toHaveCount(0);
    await expect(duplicateWarning(page)).toHaveCount(0);
  });

  test('should keep a share and an absolute count of the same cells apart', async ({ page }) => {
    // Scenario: Keep a share and an absolute count of the same cells apart
    await openApp(page);
    await analyzeReport(page, [
      { name: 'Eritroblasti', value: 0, unit: '/100 WBC', confidence: 0.95 },
      { name: 'Eritroblasti', value: 0, unit: '10^9/L', confidence: 0.95 },
      { name: 'Reticolociti', value: 81.3, unit: '10^9/L', confidence: 0.95 },
      { name: 'Reticolociti', value: 1.67, unit: '%', confidence: 0.95 },
    ]);

    await expect(reviewRows(page)).toHaveCount(4);
    await expect(duplicateWarning(page)).toHaveCount(0);
  });

  test('should keep separate urine samples and 24-hour amounts apart', async ({ page }) => {
    // Scenario: Keep separate urine samples and 24-hour amounts apart
    await openApp(page);
    await analyzeReport(page, [
      { name: 'Creatinina (urine, 24h)', value: 13746, unit: 'µmol/24h', confidence: 0.95 },
      { name: 'Creatinina (urine, 24h)', value: 1.55, unit: 'g/24h', confidence: 0.95 },
      { name: 'Creatinina (urine, spot)', value: 4367, unit: 'µmol/L', confidence: 0.95 },
      { name: 'Creatinina (urine, spot)', value: 0.49, unit: 'g/L', confidence: 0.95 },
    ]);

    await expect(reviewRows(page)).toHaveCount(2);
    await expect(duplicateWarning(page)).toHaveCount(0);
  });

  test("should keep an English report's white cell counts and percentages apart", async ({
    page,
  }) => {
    // Scenario: Keep an English report's white cell counts and percentages apart
    await openApp(page);
    const cells = ['Neutrophils', 'Lymphocytes', 'Monocytes', 'Eosinophils', 'Basophils'];
    await analyzeReport(
      page,
      cells.flatMap((name) => [
        { name, value: 10, unit: '%', confidence: 0.95 },
        { name, value: 0.5, unit: '10^9/L', confidence: 0.95 },
      ])
    );

    await expect(reviewRows(page)).toHaveCount(10);
    await expect(duplicateWarning(page)).toHaveCount(0);
  });

  test('should tell a 24-hour collection named once from its concentration', async ({ page }) => {
    // Scenario: Tell a 24-hour collection named once from its concentration
    await openApp(page);
    const name = 'Creatinina (urine, 24h)';
    await analyzeReport(page, [
      { name, value: 4582, unit: 'µmol/L', confidence: 0.95 },
      { name, value: 0.51, unit: 'g/L', confidence: 0.95 },
      { name, value: 13746, unit: 'µmol/24h', confidence: 0.95 },
      { name, value: 1.55, unit: 'g/24h', confidence: 0.95 },
    ]);

    const rows = reviewRows(page);
    await expect(rows).toHaveCount(2);
    const row = (value: string) =>
      rows.filter({ has: page.getByRole('cell', { name: value, exact: true }) });
    await expect(row('4582').getByRole('cell', { name: 'Urine', exact: true })).toBeVisible();
    await expect(row('1.55').getByRole('cell', { name: '24h Urine', exact: true })).toBeVisible();
    await expect(duplicateWarning(page)).toHaveCount(0);
  });

  test("should tell a 24-hour collection's concentration from its 24-hour amount", async ({
    page,
  }) => {
    // Scenario: Tell a 24-hour collection's concentration from its 24-hour amount
    await openApp(page);
    await analyzeReport(page, [
      { name: 'Creatinina/L (urine 24h)', value: 4582, unit: 'µmol/L', confidence: 0.95 },
      { name: 'Creatinina/L (urine 24h)', value: 0.51, unit: 'g/L', confidence: 0.95 },
      { name: 'Creatinina 24h (urine)', value: 13746, unit: 'µmol/24h', confidence: 0.95 },
      { name: 'Creatinina 24h (urine)', value: 1.55, unit: 'g/24h', confidence: 0.95 },
    ]);

    // Each filed under its own test: the specimen comes from the dictionary entry
    const rows = reviewRows(page);
    await expect(rows).toHaveCount(2);
    const row = (value: string) =>
      rows.filter({ has: page.getByRole('cell', { name: value, exact: true }) });
    await expect(row('4582').getByRole('cell', { name: 'Urine', exact: true })).toBeVisible();
    await expect(row('1.55').getByRole('cell', { name: '24h Urine', exact: true })).toBeVisible();
    await expect(duplicateWarning(page)).toHaveCount(0);
  });

  test('should explain values whose units cannot be compared', async ({ page }) => {
    // Scenario: Explain values whose units cannot be compared
    await openApp(page);
    await analyzeReport(page, [
      { name: 'Zorblatin', value: 5, unit: 'mg/L', confidence: 0.95 },
      { name: 'Zorblatin', value: 3, unit: 'µmol/L', confidence: 0.95 },
    ]);

    await expect(duplicateWarning(page)).toContainText(
      'which cannot be converted to each other. Keep the value you want and delete the other.'
    );
    await expect(reviewRows(page)).toHaveCount(2);
  });

  test('should flag genuinely different duplicate values as conflict', async ({ page }) => {
    // Scenario: Flag genuinely different duplicate values as conflict
    // (creatinine 67 µmol/L ≈ 0.76 mg/dL vs 1.5 mg/dL)
    await openApp(page);
    await analyzeReport(page, [
      { name: 'Creatinine', value: 67, unit: 'µmol/L', confidence: 0.95 },
      { name: 'Creatinine', value: 1.5, unit: 'mg/dL', confidence: 0.95 },
    ]);

    const warning = duplicateWarning(page);
    await expect(warning).toBeVisible();
    await expect(warning).toContainText('Creatinine');
    await expect(page.getByText('2 conflicts', { exact: true })).toBeVisible();

    // Both values are kept so the user can choose which one to keep
    const rows = reviewRows(page);
    await expect(rows).toHaveCount(2);
    await rows.filter({ has: page.getByRole('cell', { name: '1.5', exact: true }) })
      .getByRole('button', { name: 'Remove biomarker' })
      .click();
    await expect(rows).toHaveCount(1);
    await expect(rows.getByRole('cell', { name: '67', exact: true })).toBeVisible();
  });
});

test.describe('Unit Conversion - Error Handling', () => {
  test('should show error for unsupported unit conversion', async ({ page }) => {
    // Scenario: Unsupported unit conversion returns error ("stones")
    await openApp(page);
    await seedMeasurements(page, [
      { day: DAY_1, biomarker: GLUCOSE, value: 100, unit: 'mg/dL' },
      { day: DAY_2, biomarker: GLUCOSE, value: 110, unit: 'mg/dL' },
    ]);

    await openTrend(page, 'Glucose');
    await preferredUnitControl(page).fill('stones');
    await expect(
      page.getByRole('main').getByText('Unit not supported for Glucose', { exact: true })
    ).toBeVisible();

    // Values stay in the current unit, and so does the control
    await expectTrendValues(page, [
      { value: '100', unit: 'mg/dL' },
      { value: '110', unit: 'mg/dL' },
    ]);
    await page.keyboard.press('Escape');
    await preferredUnitControl(page).blur();
    await expect(preferredUnitControl(page)).toHaveValue('mg/dL');
  });

  test('should handle missing conversion factor gracefully', async ({ page }) => {
    // A value whose unit cannot be converted to the chart's unit (field
    // counts vs. counts per µL) is neither relabelled nor plotted on the
    // wrong scale: it is left off the chart, and the chart says so
    await openApp(page);
    await seedMeasurements(page, [
      { day: DAY_1, biomarker: URINE_EPITHELIAL_CELLS, value: 2, unit: '/HPF' },
      { day: DAY_2, biomarker: URINE_EPITHELIAL_CELLS, value: 15, unit: '/µL' },
    ]);

    await openTrend(page, 'Urine Epithelial Cells');
    // One value left: shown on its own, without a chart
    const main = page.getByRole('main');
    await expect(main.getByText('Showing 1 data point')).toBeVisible();
    await expect(main.getByText('/HPF', { exact: true })).toBeVisible();
    await expect(
      page
        .getByRole('main')
        .getByText('1 value recorded in /µL is not shown: it cannot be converted to /HPF.')
    ).toBeVisible();
  });
});

test.describe('Unit Conversion - Accessibility', () => {
  test('biomarker dictionary should show units accessibly', async ({ page }) => {
    await openApp(page);
    await navigateToDictionary(page);

    // Reach and open a biomarker using only the keyboard
    const search = page.getByRole('textbox', { name: 'Search biomarkers' });
    await search.focus();
    await page.keyboard.type('Glucose');
    const glucose = page.getByRole('button', { name: 'View details for Glucose', exact: true });
    await expect(glucose).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(glucose).toBeFocused();
    await page.keyboard.press('Enter');

    const detail = biomarkerDetail(page, 'Glucose');
    await expect(detail).toBeVisible();
    await expect(detail.getByText('mg/dL', { exact: true })).toBeVisible();
    await expect(detail.getByText('mmol/L', { exact: true })).toBeVisible();
  });

  test('unit preference controls should be keyboard accessible', async ({ page }) => {
    await openApp(page);
    await seedMeasurements(page, [
      { day: DAY_1, biomarker: GLUCOSE, value: 100, unit: 'mg/dL' },
      { day: DAY_2, biomarker: GLUCOSE, value: 120, unit: 'mg/dL' },
    ]);
    await openTrend(page, 'Glucose');

    const control = preferredUnitControl(page);
    await control.focus();
    await expect(control).toBeFocused();
    await page.keyboard.type('mmol');
    // Mantine resets the highlighted option in a 0 ms timer after the
    // dropdown opens; let it run so ArrowDown is not undone
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await expect(control).toHaveValue('mmol/L');
    await expectTrendValues(page, [
      { value: '5.55', unit: 'mmol/L' },
      { value: '6.66', unit: 'mmol/L' },
    ]);
  });
});
