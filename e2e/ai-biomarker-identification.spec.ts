/**
 * E2E: AI biomarker identification (features/ai-biomarker-identification.feature)
 */
import { test, expect } from './fixtures';
import { setupOrUnlock } from './steps/app.steps';
import { analyzeReport } from './steps/unitConversion.steps';
import {
  changeTest,
  expectNotLearned,
  removeLearnedName,
  rowFor,
  saveReviewed,
  savedAsCell,
} from './steps/identification.steps';

test.describe('AI biomarker identification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
  });

  test('uses the test the AI identified', async ({ page }) => {
    // Scenario: The AI identifies the test of each value
    await analyzeReport(page, [
      {
        name: 'Creatinina/L (urine 24h)',
        value: 4582,
        unit: 'µmol/L',
        confidence: 0.95,
        biomarkerKey: 'urine-creatinine',
      },
    ]);
    await expect(savedAsCell(rowFor(page, '4582'))).toHaveText(/Urine Creatinine/);
    await expect(
      rowFor(page, '4582').getByText(/Unit doesn't fit|Name suggests|Matched by|Not identified/)
    ).toHaveCount(0);
  });

  test("flags a unit that does not fit the AI's test and blocks Continue", async ({ page }) => {
    // Scenario: The unit does not fit the test the AI chose
    await analyzeReport(page, [
      {
        name: 'Creatinina',
        value: 1.55,
        unit: 'g/24h',
        confidence: 0.95,
        biomarkerKey: 'urine-creatinine',
      },
    ]);
    await expect(rowFor(page, '1.55').getByText("Unit doesn't fit")).toBeVisible();
    await page.getByRole('button', { name: 'Continue to Confirm' }).click();
    await expect(
      page.getByText(/Choose a fitting unit, another test, or "Not in dictionary"/)
    ).toBeVisible();
  });

  test('says when the name suggests another test', async ({ page }) => {
    // Scenario: The printed name suggests a different test
    await analyzeReport(page, [
      {
        name: 'Creatinina 24h',
        value: 4582,
        unit: 'µmol/L',
        confidence: 0.95,
        biomarkerKey: 'urine-creatinine',
      },
    ]);
    await expect(
      rowFor(page, '4582').getByText('Name suggests 24-Hour Urine Creatinine')
    ).toBeVisible();
  });

  test('notes and labels values when the model gives no tests', async ({ page }) => {
    // Scenario: The model identifies no tests
    await analyzeReport(page, [
      { name: 'Glucose', value: 95, unit: 'mg/dL', confidence: 0.95 },
      { name: 'Zorblatin', value: 1, unit: 'U/L', confidence: 0.95 },
    ]);
    await expect(page.getByText(/This model did not identify the tests/)).toBeVisible();
    await expect(rowFor(page, '95').getByText('Matched by name only')).toBeVisible();
    await expect(rowFor(page, '1').getByText('Not identified')).toBeVisible();
  });

  test('changes the test a value is saved as', async ({ page }) => {
    // Scenario: Change the test a value is saved as
    await analyzeReport(page, [
      {
        name: 'Creatinina',
        value: 1.55,
        unit: 'g/24h',
        confidence: 0.95,
        biomarkerKey: 'urine-creatinine',
      },
    ]);
    await changeTest(page, rowFor(page, '1.55'), '24-Hour Urine Creatinine');
    await expect(savedAsCell(rowFor(page, '1.55'))).toHaveText(/24-Hour Urine Creatinine/);
    await expect(rowFor(page, '1.55').getByText("Unit doesn't fit")).toHaveCount(0);
  });

  test('keeps the test when the printed name is edited', async ({ page }) => {
    // Scenario: Editing the printed name keeps the test
    await analyzeReport(page, [
      {
        name: 'Urea/L (urine)',
        value: 7,
        unit: 'g/L',
        confidence: 0.95,
        biomarkerKey: 'urine-urea',
      },
    ]);
    const row = rowFor(page, '7');
    await row.getByRole('button', { name: 'Edit biomarker' }).click();
    await page.getByPlaceholder('Biomarker name').fill('Urea urinaria');
    await row.getByRole('button', { name: 'Save changes' }).click();
    await expect(savedAsCell(rowFor(page, '7'))).toHaveText(/Urine Urea/);
  });

  test('learns a name saved under a test', async ({ page }) => {
    // Scenario: A confirmed name is learned
    await analyzeReport(page, [
      {
        name: 'Zorblatina (urine)',
        value: 7,
        unit: 'g/L',
        confidence: 0.95,
        biomarkerKey: 'urine-urea',
      },
    ]);
    await saveReviewed(page);
    await analyzeReport(page, [
      { name: 'Zorblatina (urine)', value: 6, unit: 'g/L', confidence: 0.95 },
    ]);
    await expect(savedAsCell(rowFor(page, '6'))).toHaveText(/Urine Urea/);
    await expect(rowFor(page, '6').getByText('Matched by name only')).toBeVisible();
  });

  test('forgets a learned name removed in Settings', async ({ page }) => {
    // Scenario: Remove a learned name
    await analyzeReport(page, [
      {
        name: 'Zorblatina (urine)',
        value: 7,
        unit: 'g/L',
        confidence: 0.95,
        biomarkerKey: 'urine-urea',
      },
    ]);
    await saveReviewed(page);
    await removeLearnedName(page, 'zorblatina (urine)');
    await analyzeReport(page, [
      { name: 'Zorblatina (urine)', value: 6, unit: 'g/L', confidence: 0.95 },
    ]);
    await expect(savedAsCell(rowFor(page, '6'))).toHaveText(/Not in dictionary/);
  });

  test('forgets a learned name saved as not in the dictionary', async ({ page }) => {
    // Scenario: Saving as "Not in dictionary" forgets a learned name
    await analyzeReport(page, [
      {
        name: 'Zorblatina (urine)',
        value: 7,
        unit: 'g/L',
        confidence: 0.95,
        biomarkerKey: 'urine-urea',
      },
    ]);
    await saveReviewed(page);
    await analyzeReport(page, [
      { name: 'Zorblatina (urine)', value: 6, unit: 'g/L', confidence: 0.95 },
    ]);
    await changeTest(page, rowFor(page, '6'), 'Not in dictionary');
    await saveReviewed(page);
    await expectNotLearned(page, 'zorblatina (urine)');
  });

  test('says when the matching model cannot load', async ({ page }) => {
    // Scenario: The matching model cannot load (the fixture blocks the model host)
    await analyzeReport(page, [
      { name: 'Zorblatina sierica', value: 3, unit: 'mg/dL', confidence: 0.95 },
    ]);
    await expect(rowFor(page, '3').getByText('Not identified')).toBeVisible();
    await expect(page.getByText(/The matching model could not load/)).toBeVisible();
  });
});
