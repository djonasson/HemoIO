/**
 * E2E: AI biomarker identification (features/ai-biomarker-identification.feature)
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { setupOrUnlock } from './steps/app.steps';
import { analyzeReport } from './steps/unitConversion.steps';
import { main } from './steps/importWizard.steps';
import { expandLabResult, goToTimeline } from './steps/timeline.steps';
import {
  changeTest,
  editingRow,
  editRow,
  expectNoCheckLabel,
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
    await expectNoCheckLabel(rowFor(page, '4582'));
  });

  test("flags a unit that does not fit the AI's test and blocks Continue", async ({ page }) => {
    // Scenario: The unit does not fit the test the AI chose
    await analyzeReport(page, [
      { name: 'Glicemia', value: 5, unit: 'mmol/24h', confidence: 0.95, biomarkerKey: 'glucose' },
    ]);
    await expect(rowFor(page, '5').getByText("Unit doesn't fit")).toBeVisible();
    await page.getByRole('button', { name: 'Continue to Confirm' }).click();
    await expect(
      page.getByText(/Choose a fitting unit, another test, or "Not in dictionary"/)
    ).toBeVisible();
  });

  test('keeps the proposed test when the name of a value whose unit does not fit is edited', async ({
    page,
  }) => {
    // Scenario: Editing the name of a value whose unit does not fit keeps the proposed test
    await analyzeReport(page, [
      { name: 'Glicemia', value: 5, unit: 'mmol/24h', confidence: 0.95, biomarkerKey: 'glucose' },
    ]);
    await editRow(page, rowFor(page, '5'), { name: 'Glicemia x' });
    await expect(savedAsCell(rowFor(page, '5'))).toHaveText(/Proposed: Glucose/);
    await expect(rowFor(page, '5').getByText("Unit doesn't fit")).toBeVisible();
    await page.getByRole('button', { name: 'Continue to Confirm' }).click();
    await expect(
      page.getByText(/Choose a fitting unit, another test, or "Not in dictionary"/)
    ).toBeVisible();
  });

  test('keeps a value saved as not in the dictionary there when it is renamed', async ({ page }) => {
    // Scenario: A value saved as "Not in dictionary" stays there when renamed
    await analyzeReport(page, [{ name: 'Zorblatina', value: 7, unit: '%', confidence: 0.95 }]);
    await changeTest(page, rowFor(page, '7'), 'Not in dictionary');
    await editRow(page, rowFor(page, '7'), { name: 'Hematocrit' });
    await expect(savedAsCell(rowFor(page, '7'))).toHaveText(/^Not in dictionary/);
  });

  test('says when the name suggests another test', async ({ page }) => {
    // Scenario: The printed name suggests a different test
    await analyzeReport(page, [
      { name: 'BUN', value: 18, unit: 'mg/dL', confidence: 0.95, biomarkerKey: 'urea' },
    ]);
    await expect(savedAsCell(rowFor(page, '18'))).toHaveText(/^Urea/);
    await expect(rowFor(page, '18').getByText('Name suggests Blood Urea Nitrogen')).toBeVisible();
  });

  test('questions a name that is exactly another test, whatever its unit', async ({ page }) => {
    // Scenario: A name that is exactly another test is questioned, whatever its unit
    await analyzeReport(page, [
      { name: 'Emoglobina', value: 43.5, unit: '%', confidence: 0.95, biomarkerKey: 'hematocrit' },
    ]);
    await expect(savedAsCell(rowFor(page, '43.5'))).toHaveText(/^Hematocrit/);
    await expect(rowFor(page, '43.5').getByText('Name suggests Hemoglobin')).toBeVisible();
  });

  test("does not question a name the unit makes the AI's test", async ({ page }) => {
    // Scenario: A name the unit makes the AI's test is not questioned
    await analyzeReport(page, [
      {
        name: 'Eritroblasti',
        value: 0,
        unit: '/100 WBC',
        confidence: 0.95,
        biomarkerKey: 'nucleated-red-blood-cells-percentage',
      },
    ]);
    await expect(savedAsCell(rowFor(page, '0'))).toHaveText(/Nucleated Red Blood Cells Percentage/);
    await expectNoCheckLabel(rowFor(page, '0'));
  });

  test("suggests the analyte's urine test for a bare name keyed as another urine test", async ({ page }) => {
    // Scenario: A plain name the AI files under another urine test suggests that name's urine test
    await analyzeReport(page, [
      { name: 'Creatinina', value: 1.4, unit: 'g/24h', confidence: 0.95, biomarkerKey: '24-hour-urine-urea' },
    ]);
    await expect(rowFor(page, '1.4').getByText('Name suggests 24-Hour Urine Creatinine')).toBeVisible();
  });

  test('does not question a urine dipstick value by the blood count of its name', async ({ page }) => {
    // Scenario: A urine dipstick value is not questioned by the blood count of its name
    await analyzeReport(page, [
      { name: 'Eritrociti', value: 25, unit: 'Ery/µL', confidence: 0.95, biomarkerKey: 'urine-blood' },
    ]);
    await expect(savedAsCell(rowFor(page, '25'))).toHaveText(/^Urine Blood/);
    await expectNoCheckLabel(rowFor(page, '25'));
  });

  test('questions a test of another specimen than the printed name says', async ({ page }) => {
    // Scenario: A name that says its specimen questions a test of another specimen
    await analyzeReport(page, [
      { name: 'Proteine (urine)', value: 7.1, unit: 'g/dL', confidence: 0.95, biomarkerKey: 'total-protein' },
    ]);
    await expect(rowFor(page, '7.1').getByText('Name suggests Urine Protein')).toBeVisible();
  });

  test("questions a dipstick pad's name filed as a cell count", async ({ page }) => {
    // Scenario: A dipstick pad's name is questioned when the AI files it as a cell count
    await analyzeReport(page, [
      { name: 'Esterasi leucocitaria', value: 500, unit: '/µL', confidence: 0.95, biomarkerKey: 'urine-wbc' },
    ]);
    await expect(rowFor(page, '500').getByText('Name suggests Urine Leukocyte Esterase')).toBeVisible();
  });

  test('questions a serum name filed as a urine test', async ({ page }) => {
    // Scenario: A serum name is questioned when the AI files it as a urine test
    await analyzeReport(page, [
      { name: 'Urea plasmatica', value: 0.35, unit: 'g/L', confidence: 0.95, biomarkerKey: 'urine-urea' },
    ]);
    await expect(rowFor(page, '0.35').getByText('Name suggests Urea')).toBeVisible();
  });

  test("questions a percentage's name filed as the count", async ({ page }) => {
    // Scenario: A percentage's name is questioned when the AI files it as the count
    await analyzeReport(page, [
      { name: 'Neutrofili (%)', value: 58, unit: '10^9/L', confidence: 0.95, biomarkerKey: 'neutrophils' },
    ]);
    await expect(rowFor(page, '58').getByText('Name suggests Neutrophils Percentage')).toBeVisible();
  });

  test('questions a blood name filed as the urine test', async ({ page }) => {
    // Scenario: A blood name is questioned when the AI files it as the urine test
    await analyzeReport(page, [
      { name: 'Glicemia', value: 95, unit: 'mg/dL', confidence: 0.95, biomarkerKey: 'urine-glucose' },
    ]);
    await expect(rowFor(page, '95').getByText('Name suggests Glucose')).toBeVisible();
  });

  test('questions a fasting name filed as the urine test', async ({ page }) => {
    // Scenario: A fasting name is questioned when the AI files it as the urine test
    await analyzeReport(page, [
      { name: 'Glucosio (a digiuno)', value: 92, unit: 'mg/dL', confidence: 0.95, biomarkerKey: 'urine-glucose' },
    ]);
    await expect(rowFor(page, '92').getByText('Name suggests Glucose')).toBeVisible();
  });

  test('questions a semen name filed as the urine test', async ({ page }) => {
    // Scenario: A semen name is questioned when the AI files it as the urine test
    await analyzeReport(page, [
      { name: 'pH seminale', value: 7.8, unit: '', confidence: 0.95, biomarkerKey: 'urine-ph' },
    ]);
    await expect(rowFor(page, '7.8').getByText('Name suggests Semen pH')).toBeVisible();
  });

  test("suggests the name's test that the unit fits when the AI's urine test measures the same", async ({ page }) => {
    // Scenario: A unit that fits the name's test is suggested when the AI's test measures the same in urine
    await analyzeReport(page, [
      { name: 'Leucociti', value: 6.5, unit: '10^9/L', confidence: 0.95, biomarkerKey: 'urine-wbc' },
    ]);
    const row = rowFor(page, '6.5');
    await expect(row.getByText("Unit doesn't fit")).toBeVisible();
    await expect(row.getByText('Name suggests White Blood Cell Count')).toBeVisible();
  });

  test('lets a value with no test have no unit', async ({ page }) => {
    // Scenario: A value with no test may have no unit
    await analyzeReport(page, [
      { name: 'Zorblatin ratio', value: 1.02, unit: '', confidence: 0.95 },
    ]);
    await page.getByRole('button', { name: 'Continue to Confirm' }).click();
    await expect(page.getByText('Values to Import')).toBeVisible();
  });

  test('saves a screening result without a unit under its own name', async ({ page }) => {
    // Scenario: A screening result without a unit is saved under its own name
    await analyzeReport(page, [
      {
        name: 'Proteine (urine)',
        value: 15,
        unit: '',
        confidence: 0.95,
        biomarkerKey: 'urine-protein',
      },
    ]);
    await expect(savedAsCell(rowFor(page, '15'))).toHaveText(/Not in dictionary/);
    await expect(rowFor(page, '15').getByText('No unit in report')).toBeVisible();
    await page.getByRole('button', { name: 'Continue to Confirm' }).click();
    await expect(page.getByText('Values to Import')).toBeVisible();
  });

  test('fits review on a phone screen and shows the test in full', async ({ page }) => {
    // Scenario: Review fits a phone screen
    await analyzeReport(page, [
      {
        name: 'Creatinina',
        value: 1.55,
        unit: 'g/24h',
        confidence: 0.95,
        biomarkerKey: '24-hour-urine-creatinine',
      },
    ]);
    await page.setViewportSize({ width: 390, height: 844 });
    const savedAs = savedAsCell(rowFor(page, '1.55'));
    await expect(savedAs).toHaveText('24-Hour Urine Creatinine');
    expect(await savedAs.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    // Once the navigation has slid away for the narrow screen
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  });

  test('does not file a name qualified as another test under its base test', async ({ page }) => {
    // Scenario: A name qualified as another test is not its base test
    await analyzeReport(page, [{ name: 'Cholesterol (HDL)', value: 52, unit: 'mg/dL', confidence: 0.95 }]);
    // E2E pages never download the matching model, which might identify HDL
    await expect(savedAsCell(rowFor(page, '52'))).toHaveText(/^Not in dictionary/);
  });

  test('ignores a qualifier that restates the test', async ({ page }) => {
    // Scenario: A qualifier that restates the test is ignored
    await analyzeReport(page, [{ name: 'Emoglobina (HGB)', value: 14.5, unit: 'g/dL', confidence: 0.95 }]);
    await expect(savedAsCell(rowFor(page, '14.5'))).toHaveText(/^Hemoglobin/);
  });

  test('questions an AI test in another specimen that measures something else', async ({ page }) => {
    // Scenario: An AI test in another specimen that measures something else is questioned
    await analyzeReport(page, [
      { name: 'Sodio', value: 150, unit: 'mmol/24h', confidence: 0.95, biomarkerKey: '24-hour-urine-urea' },
    ]);
    await expect(rowFor(page, '150').getByText('Name suggests Sodium')).toBeVisible();
  });

  test("files a count's name in % as its percentage", async ({ page }) => {
    // Scenario: A count's name in % is its percentage
    await analyzeReport(page, [{ name: 'Neutrofili', value: 62, unit: '%', confidence: 0.95 }]);
    await expect(savedAsCell(rowFor(page, '62'))).toHaveText(/^Neutrophils Percentage/);
  });

  test('does not question a urine test printed by the bare analyte', async ({ page }) => {
    // Scenario: A urine test printed by the bare analyte is not questioned
    await analyzeReport(page, [
      { name: 'Creatinina', value: 1.2, unit: 'g/24h', confidence: 0.95, biomarkerKey: '24-hour-urine-creatinine' },
    ]);
    await expect(savedAsCell(rowFor(page, '1.2'))).toHaveText(/^24-Hour Urine Creatinine/);
    await expectNoCheckLabel(rowFor(page, '1.2'));
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
        value: 4582,
        unit: 'µmol/L',
        confidence: 0.95,
        biomarkerKey: 'urine-creatinine',
      },
    ]);
    await expect(savedAsCell(rowFor(page, '4582'))).toHaveText(/^Urine Creatinine/);
    await changeTest(page, rowFor(page, '4582'), '24-Hour Urine Creatinine');
    await expect(savedAsCell(rowFor(page, '4582'))).toHaveText(/24-Hour Urine Creatinine/);
  });

  test('changes the test from the keyboard', async ({ page }) => {
    // Scenario: Change the test from the keyboard
    await analyzeReport(page, [
      {
        name: 'Creatinina',
        value: 4582,
        unit: 'µmol/L',
        confidence: 0.95,
        biomarkerKey: 'urine-creatinine',
      },
    ]);
    await rowFor(page, '4582').getByRole('button', { name: /^Change test for / }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: /Saved as/ });
    await expect(dialog.getByRole('textbox', { name: 'Search tests' })).toBeFocused();
    await page.keyboard.type('24-Hour Urine Creatinine');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(savedAsCell(rowFor(page, '4582'))).toHaveText(/24-Hour Urine Creatinine/);
  });

  test('chooses the test a name is exactly with Enter', async ({ page }) => {
    // Scenario: Enter chooses the test a name is exactly
    await analyzeReport(page, [
      { name: 'Azotemia', value: 40, unit: 'mg/dL', confidence: 0.95, biomarkerKey: 'urine-creatinine' },
    ]);
    await rowFor(page, '40').getByRole('button', { name: /^Change test for / }).click();
    const dialog = page.getByRole('dialog', { name: /Saved as/ });
    await dialog.getByRole('textbox', { name: 'Search tests' }).fill('Urea');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(savedAsCell(rowFor(page, '40'))).toHaveText(/^Urea/);
  });

  test("files a 24-hour amount the AI gave the concentration's test under the 24-hour test", async ({
    page,
  }) => {
    // Scenario: The AI's test is reported alike with another the unit fits
    await analyzeReport(page, [
      {
        name: 'Creatinina',
        value: 120,
        unit: 'mg/dL',
        confidence: 0.95,
        biomarkerKey: 'urine-creatinine',
      },
      {
        name: 'Creatinina',
        value: 1.55,
        unit: 'g/24h',
        confidence: 0.95,
        biomarkerKey: 'urine-creatinine',
      },
    ]);
    await expect(savedAsCell(rowFor(page, '1.55'))).toHaveText(/24-Hour Urine Creatinine/);
    await expect(savedAsCell(rowFor(page, '120'))).toHaveText(/^Urine Creatinine/);
    await expect(page.getByText('Duplicate Biomarkers Detected')).toHaveCount(0);
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
    await editRow(page, rowFor(page, '7'), { name: 'Urea urinaria' });
    await expect(savedAsCell(rowFor(page, '7'))).toHaveText(/Urine Urea/);
  });

  test('updates the labels of a value renamed to a dictionary test', async ({ page }) => {
    // Scenario: Renaming a value the AI did not identify updates its labels
    await analyzeReport(page, [{ name: 'Zorblatina', value: 7, unit: '%', confidence: 0.95 }]);
    await expect(rowFor(page, '7').getByText('Not identified')).toBeVisible();
    await editRow(page, rowFor(page, '7'), { name: 'Hematocrit' });
    await expect(savedAsCell(rowFor(page, '7'))).toHaveText(/^Hematocrit/);
    await expectNoCheckLabel(rowFor(page, '7'));
  });

  /** Given I picked `test` for `name` in review and saved it */
  async function learnName(page: Page, name: string, test: string): Promise<void> {
    await analyzeReport(page, [{ name, value: 7, unit: 'g/L', confidence: 0.95 }]);
    await changeTest(page, rowFor(page, '7'), test);
    await saveReviewed(page);
  }
  test('proposes a renamed test the unit does not fit', async ({ page }) => {
    // Scenario: A renamed test the unit does not fit is proposed
    await analyzeReport(page, [{ name: 'Zorblatina', value: 5, unit: 'mmol/24h', confidence: 0.95 }]);
    await editRow(page, rowFor(page, '5'), { name: 'Glucose' });
    await expect(savedAsCell(rowFor(page, '5'))).toHaveText(/Proposed: Glucose/);
    await expect(rowFor(page, '5').getByText("Unit doesn't fit")).toBeVisible();
  });

  test('reads a renamed value again when its unit changes', async ({ page }) => {
    // Scenario: A renamed value is read again when its unit changes
    await analyzeReport(page, [{ name: 'Zorblatina', value: 42, unit: '10^9/L', confidence: 0.95 }]);
    await editRow(page, rowFor(page, '42'), { name: 'Neutrophils' });
    await expect(savedAsCell(rowFor(page, '42'))).toHaveText(/^Neutrophils/);
    await editRow(page, rowFor(page, '42'), { unit: '%' });
    await expect(savedAsCell(rowFor(page, '42'))).toHaveText(/^Neutrophils Percentage/);
  });

  test('reads a name typed in review as a printed name is', async ({ page }) => {
    // Scenario: A name typed in review is read as a printed name is
    await analyzeReport(page, [{ name: 'Zorblatina', value: 52, unit: 'g/dL', confidence: 0.95 }]);
    await editRow(page, rowFor(page, '52'), { name: 'Cholesterol (HDL)' });
    await expect(savedAsCell(rowFor(page, '52'))).toHaveText(/^Not in dictionary/);
    await expect(rowFor(page, '52').getByText('Not identified')).toBeVisible();
    await editRow(page, rowFor(page, '52'), { name: 'Hemo-globin' });
    await expect(savedAsCell(rowFor(page, '52'))).toHaveText(/^Hemoglobin/);
  });

  test('reads a name typed in review with the learned names', async ({ page }) => {
    // Scenario: A name typed in review is read with my learned names
    await learnName(page, 'Zorblatina (urine)', 'Urine Urea');
    await analyzeReport(page, [{ name: 'Zorblatlna (urine)', value: 6, unit: 'g/L', confidence: 0.95 }]);
    await expect(rowFor(page, '6').getByText('Not identified')).toBeVisible();
    await editRow(page, rowFor(page, '6'), { name: 'Zorblatina (urine)' });
    await expect(savedAsCell(rowFor(page, '6'))).toHaveText(/^Urine Urea/);
  });

  test('keeps the test of a value whose unit is emptied, and asks for the unit', async ({ page }) => {
    // Scenario: An emptied unit is one still to choose
    await analyzeReport(page, [
      { name: 'Glicemia', value: 95, unit: 'mg/dL', confidence: 0.95, biomarkerKey: 'glucose' },
    ]);
    await rowFor(page, '95').getByRole('button', { name: 'Edit biomarker' }).click();
    // Backspaced one letter at a time, through units of no test
    const unit = editingRow(page).getByPlaceholder('Unit', { exact: true });
    await unit.click();
    await unit.press('End');
    for (let i = 0; i < 'mg/dL'.length; i++) await unit.press('Backspace');
    await expect(unit).toHaveValue('');
    await editingRow(page).getByRole('button', { name: 'Save changes' }).click();
    await expect(savedAsCell(rowFor(page, '95'))).toHaveText(/^Glucose/);
    await page.getByRole('button', { name: 'Continue to Confirm' }).click();
    await expect(page.getByText(/Glicemia in ".*" is missing: unit/)).toBeVisible();
  });

  test('reads learned names in a row added in review', async ({ page }) => {
    // Scenario: A row added in review reads my learned names
    await learnName(page, 'Zorblatina (urine)', 'Urine Urea');
    await analyzeReport(page, [{ name: 'Glucose', value: 95, unit: 'mg/dL', confidence: 0.95 }]);
    await main(page).getByRole('button', { name: 'Add Biomarker' }).click();
    const editing = editingRow(page);
    await editing.getByPlaceholder('Biomarker name').fill('Zorblatina (urine)');
    await page.keyboard.press('Escape');
    await editing.getByPlaceholder('Value', { exact: true }).fill('6');
    await editing.getByRole('button', { name: 'Save changes' }).click();
    await expect(savedAsCell(rowFor(page, '6'))).toHaveText(/^Urine Urea/);
  });


  test('reads a name edited only in spacing as printed', async ({ page }) => {
    // Scenario: A name edited only in case or spacing is read as printed
    await analyzeReport(page, [{ name: 'Globuli rossi', value: 4.8, unit: '10^6/µL', confidence: 0.95 }]);
    await expect(savedAsCell(rowFor(page, '4.8'))).toHaveText(/^Red Blood Cell Count/);
    await editRow(page, rowFor(page, '4.8'), { name: 'Globuli  rossi' });
    await expect(savedAsCell(rowFor(page, '4.8'))).toHaveText(/^Red Blood Cell Count/);
  });

  test('checks the new name of a value the AI identified', async ({ page }) => {
    // Scenario: Renaming a value the AI identified checks the new name
    await analyzeReport(page, [
      { name: 'BUN', value: 18, unit: 'mg/dL', confidence: 0.95, biomarkerKey: 'urea' },
    ]);
    await expect(rowFor(page, '18').getByText('Name suggests Blood Urea Nitrogen')).toBeVisible();
    await editRow(page, rowFor(page, '18'), { name: 'Urea' });
    await expect(savedAsCell(rowFor(page, '18'))).toHaveText(/^Urea/);
    await expectNoCheckLabel(rowFor(page, '18'));
  });

  test('identifies a screening value once it has a unit', async ({ page }) => {
    // Scenario: A screening value without a unit is identified once it has one
    await analyzeReport(page, [
      { name: 'Proteine (urine)', value: 15, unit: '', confidence: 0.95, biomarkerKey: 'urine-protein' },
    ]);
    await expect(rowFor(page, '15').getByText('No unit in report')).toBeVisible();
    await editRow(page, rowFor(page, '15'), { name: 'Urine Protein' });
    await expect(savedAsCell(rowFor(page, '15'))).toHaveText(/^Not in dictionary/);
    await editRow(page, rowFor(page, '15'), { unit: 'mg/dL' });
    await expect(savedAsCell(rowFor(page, '15'))).toHaveText(/^Urine Protein/);
  });

  test('gives a row added in review the unit of the name finally typed', async ({ page }) => {
    // Scenario: A row added in review gets the unit of the name finally typed
    await analyzeReport(page, [{ name: 'Glucose', value: 95, unit: 'mg/dL', confidence: 0.95 }]);
    await main(page).getByRole('button', { name: 'Add Biomarker' }).click();
    const editing = editingRow(page);
    await editing.getByPlaceholder('Biomarker name').pressSequentially('Urea 24h');
    await page.keyboard.press('Escape');
    await editing.getByPlaceholder('Value', { exact: true }).fill('25');
    await expect(editing.getByPlaceholder('Unit', { exact: true })).toHaveValue('g/24h');
    await editing.getByRole('button', { name: 'Save changes' }).click();
    await expect(savedAsCell(rowFor(page, '25'))).toHaveText(/^24-Hour Urine Urea/);
  });

  test("says which learned test fits when the AI's test does not fit the unit", async ({ page }) => {
    // Scenario: A learned name whose unit fits, when the AI's test does not fit the unit
    await learnName(page, 'Zorblatina (urine)', 'Urine Urea');
    await analyzeReport(page, [
      { name: 'Zorblatina (urine)', value: 6, unit: 'mmol/L', confidence: 0.95, biomarkerKey: 'urine-protein' },
    ]);
    await expect(savedAsCell(rowFor(page, '6'))).toHaveText(/Proposed: Urine Protein/);
    await expect(rowFor(page, '6').getByText("Unit doesn't fit")).toBeVisible();
    await expect(rowFor(page, '6').getByText('Name suggests Urine Urea')).toBeVisible();
  });

  test("reads a learned name with the value's unit", async ({ page }) => {
    // Scenario: A learned name is read with the value's unit
    await learnName(page, 'Zorblatina (urine)', 'Urine Creatinine');
    await analyzeReport(page, [{ name: 'Zorblatina (urine)', value: 1.2, unit: 'g/24h', confidence: 0.95 }]);
    await expect(savedAsCell(rowFor(page, '1.2'))).toHaveText(/^24-Hour Urine Creatinine/);
    await expect(rowFor(page, '1.2').getByText('Matched by name only')).toBeVisible();
  });


  test('does not learn a test the AI chose', async ({ page }) => {
    // Scenario: A test the AI chose is not learned
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
    await expectNotLearned(page, 'zorblatina (urine)');
  });

  test('learns a name saved under a test', async ({ page }) => {
    // Scenario: A confirmed name is learned
    await learnName(page, 'Zorblatina (urine)', 'Urine Urea');
    await analyzeReport(page, [
      { name: 'Zorblatina (urine)', value: 6, unit: 'g/L', confidence: 0.95 },
    ]);
    await expect(savedAsCell(rowFor(page, '6'))).toHaveText(/Urine Urea/);
    await expect(rowFor(page, '6').getByText('Matched by name only')).toBeVisible();
  });

  test("says when the AI's test differs from a learned name", async ({ page }) => {
    // Scenario: The AI's test differs from a learned name
    await learnName(page, 'Zorblatina (urine)', 'Urine Urea');
    await analyzeReport(page, [
      {
        name: 'Zorblatina (urine)',
        value: 6,
        unit: 'g/L',
        confidence: 0.95,
        biomarkerKey: 'urine-protein',
      },
    ]);
    await expect(savedAsCell(rowFor(page, '6'))).toHaveText(/^Urine Protein/);
    await expect(rowFor(page, '6').getByText('Name suggests Urine Urea')).toBeVisible();
  });

  test('forgets a learned name removed in Settings', async ({ page }) => {
    // Scenario: Remove a learned name
    await learnName(page, 'Zorblatina (urine)', 'Urine Urea');
    await removeLearnedName(page, 'zorblatina (urine)');
    await analyzeReport(page, [
      { name: 'Zorblatina (urine)', value: 6, unit: 'g/L', confidence: 0.95 },
    ]);
    await expect(savedAsCell(rowFor(page, '6'))).toHaveText(/Not in dictionary/);
  });

  test('forgets a learned name saved as not in the dictionary', async ({ page }) => {
    // Two full analyses, each loading the matching model in the page: on a
    // busy machine Firefox needs more than the default test timeout
    test.slow();
    // Scenario: Saving as "Not in dictionary" forgets a learned name
    await learnName(page, 'Zorblatina (urine)', 'Urine Urea');
    await analyzeReport(page, [
      { name: 'Zorblatina (urine)', value: 6, unit: 'g/L', confidence: 0.95 },
    ]);
    await changeTest(page, rowFor(page, '6'), 'Not in dictionary');
    await saveReviewed(page);
    await expectNotLearned(page, 'zorblatina (urine)');
  });

  test('keeps a value saved as not in the dictionary apart from the test its name is', async ({ page }) => {
    // Scenario: A value saved as "Not in dictionary" stays apart from the test its name is
    await analyzeReport(page, [{ name: 'Hemoglobin', value: 14.5, unit: 'g/dL', confidence: 0.95 }]);
    await changeTest(page, rowFor(page, '14.5'), 'Not in dictionary');
    await saveReviewed(page);
    await goToTimeline(page);
    const card = await expandLabResult(page, '2024-03-10');
    const row = card.getByRole('table', { name: 'Test values' }).getByRole('row').filter({ hasText: '14.5' });
    await expect(row).toContainText('Hemoglobin');
    await expect(row).not.toContainText('Whole Blood');
  });

  test('says when the matching model cannot load', async ({ page }) => {
    // Scenario: The matching model cannot load (the fixture blocks the model host)
    await analyzeReport(page, [
      { name: 'Zorblatina sierica', value: 3, unit: 'mg/dL', confidence: 0.95 },
    ]);
    await expect(rowFor(page, '3').getByText('Not identified')).toBeVisible();
    await expect(page.getByText(/The matching model could not load.*choose their tests in Saved as.*reload the app before your next import/)).toBeVisible();
  });
});
