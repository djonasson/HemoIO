/**
 * E2E: identifying the test of each value (features/ai-biomarker-identification.feature)
 *
 * The app matches against the real LOINC catalog; only the AI is mocked.
 * Report text is made up.
 */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openFromMenu, setupOrUnlock } from './steps/app.steps';
import { analyzeReport } from './steps/unitConversion.steps';
import { continueToConfirm, main } from './steps/importWizard.steps';
import { expandLabResult, goToTimeline } from './steps/timeline.steps';
import {
  changeTest,
  editingRow,
  editRow,
  expectNoCheckLabel,
  expectNotLearned,
  learnedNames,
  NOT_A_LOINC_TEST,
  openLearnedNames,
  removeLearnedName,
  rowFor,
  saveReviewed,
  savedAsCell,
  testList,
  testOption,
} from './steps/identification.steps';
import type { ExtractedBiomarkerFixture } from './steps/ai.steps';

const ALT = 'Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma';
const SERUM_GLUCOSE = 'Glucose [Mass/volume] in Serum or Plasma';
const BLOOD_GLUCOSE = 'Glucose [Mass/volume] in Blood';
const HEMOGLOBIN = 'Hemoglobin [Mass/volume] in Blood';

/** Printed under a blood heading: glucose in blood and in serum or plasma both fit */
const GLUCOSIO: ExtractedBiomarkerFixture = {
  name: 'Glucosio',
  value: 95,
  unit: 'mg/dL',
  confidence: 0.95,
  specimenHint: 'blood',
};
const S_ALT: ExtractedBiomarkerFixture = { name: 'S-ALT', value: 30, unit: 'U/L', confidence: 0.95 };

const CHOOSE_TEST_PROBLEM = /Glucosio in "lab-report\.pdf" needs a test: choose one or "Not a LOINC test"/;

test.describe('Identifying the test of each value', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
  });

  /** I choose `testName` for "Glucosio" in mg/dL, the AI unsure of it, and save the import */
  async function learnGlucosio(page: Page, testName = BLOOD_GLUCOSE): Promise<void> {
    await analyzeReport(page, [GLUCOSIO]);
    await changeTest(page, rowFor(page, '95'), testName, { search: false });
    await saveReviewed(page);
  }

  test('matches a known test from a new lab with no question', async ({ page }) => {
    // Scenario: A known test from a lab never imported before is matched with no question
    const ai = await analyzeReport(page, [S_ALT]);
    const row = rowFor(page, '30');
    await expect(savedAsCell(row)).toHaveText(ALT);
    await expect(row.getByText('LOINC 1742-6')).toBeVisible();
    await expectNoCheckLabel(row);
    expect(ai.choiceRequests).toHaveLength(0);
  });

  test('lets the AI decide a value several tests fit', async ({ page }) => {
    // Scenario: A value several tests fit is decided by the AI
    await analyzeReport(page, [GLUCOSIO], 1, {
      testChoice: { choices: { Glucosio: { code: '2345-7', confident: true } } },
    });
    await expect(savedAsCell(rowFor(page, '95'))).toHaveText(SERUM_GLUCOSE);
    await expectNoCheckLabel(rowFor(page, '95'));
  });

  test('asks the AI once, only about the values it must decide', async ({ page }) => {
    // Scenario: The AI is asked once per report, only about the values it must decide
    const ai = await analyzeReport(page, [S_ALT, GLUCOSIO]);
    expect(ai.choiceRequests).toHaveLength(1);
    expect(ai.choiceRequests[0].map((value) => value.name)).toEqual(['Glucosio']);
    expect(ai.choiceRequests[0][0].candidates.map((c) => c.code)).toEqual(
      expect.arrayContaining(['2345-7', '2339-0'])
    );
  });

  test('offers the tests that fit when the AI is unsure', async ({ page }) => {
    // Scenario: A value the AI is unsure of shows the tests to choose from
    await analyzeReport(page, [GLUCOSIO]);
    const row = rowFor(page, '95');
    await expect(savedAsCell(row)).toHaveText('No test chosen');
    await expect(row.getByText('Choose a test')).toBeVisible();

    await row.getByRole('button', { name: /^Change test for / }).click();
    const list = testList(page);
    await expect(testOption(list, SERUM_GLUCOSE)).toHaveAccessibleName(`${SERUM_GLUCOSE} · 2345-7`);
    await testOption(list, BLOOD_GLUCOSE).click();
    await expect(list).toBeHidden();

    await expect(savedAsCell(row)).toHaveText(BLOOD_GLUCOSE);
    await expectNoCheckLabel(row);
  });

  test('blocks Continue until a value has a test', async ({ page }) => {
    // Scenario: A value with no test chosen blocks Continue
    await analyzeReport(page, [GLUCOSIO]);
    await page.getByRole('button', { name: 'Continue to Confirm' }).click();
    await expect(page.getByText(CHOOSE_TEST_PROBLEM)).toBeVisible();
  });

  test('searches the whole catalog for the test', async ({ page }) => {
    // Scenario: I can search the whole LOINC catalog for the test
    await analyzeReport(page, [GLUCOSIO]);
    await changeTest(page, rowFor(page, '95'), HEMOGLOBIN);
    await expect(savedAsCell(rowFor(page, '95'))).toHaveText(HEMOGLOBIN);
  });

  test('chooses the test from the keyboard', async ({ page }) => {
    // Scenario: Choose the test from the keyboard
    await analyzeReport(page, [GLUCOSIO]);
    await rowFor(page, '95').getByRole('button', { name: /^Change test for / }).focus();
    await page.keyboard.press('Enter');
    const list = testList(page);
    await expect(list.getByRole('textbox', { name: 'Search tests' })).toBeFocused();
    await page.keyboard.type(HEMOGLOBIN);
    await page.keyboard.press('Enter');
    await expect(list).toBeHidden();
    await expect(savedAsCell(rowFor(page, '95'))).toHaveText(HEMOGLOBIN);
  });

  test('remembers a test I chose once I save, and does not ask again', async ({ page }) => {
    // Two imports, each analyzed and saved
    test.slow();
    // Scenario: A test I chose is remembered once I save, and not asked again
    await learnGlucosio(page);
    const ai = await analyzeReport(page, [GLUCOSIO]);
    await expect(savedAsCell(rowFor(page, '95'))).toHaveText(BLOOD_GLUCOSE);
    expect(ai.choiceRequests).toHaveLength(0);

    await openLearnedNames(page);
    await expect(learnedNames(page)).toContainText(`glucosio (mg/dL) → ${BLOOD_GLUCOSE} · 2339-0`);
  });

  test("remembers the AI's choice once I save it", async ({ page }) => {
    // Scenario: The AI's choice is remembered once I save it
    await analyzeReport(page, [GLUCOSIO], 1, {
      testChoice: { choices: { Glucosio: { code: '2345-7', confident: true } } },
    });
    await saveReviewed(page);
    await openLearnedNames(page);
    await expect(learnedNames(page)).toContainText(`glucosio (mg/dL) → ${SERUM_GLUCOSE}`);
  });

  test('does not remember a choice when the import is not saved', async ({ page }) => {
    // Scenario: A choice is not remembered when the import is not saved
    await analyzeReport(page, [GLUCOSIO], 1, {
      testChoice: { choices: { Glucosio: { code: '2345-7', confident: true } } },
    });
    await openFromMenu(page, 'Timeline');
    await expectNotLearned(page, 'glucosio');
  });

  test('asks again for the same wording in another unit', async ({ page }) => {
    // Two imports, each analyzed
    test.slow();
    // Scenario: The same wording in another unit is a different question
    await learnGlucosio(page);
    await analyzeReport(page, [{ ...GLUCOSIO, value: 5.3, unit: 'mmol/L' }]);
    await expect(savedAsCell(rowFor(page, '5.3'))).not.toHaveText(BLOOD_GLUCOSE);
  });

  test('saves a value that is not a LOINC test under its printed name', async ({ page }) => {
    // Two imports, each analyzed
    test.slow();
    // Scenario: "Not a LOINC test" saves the value under its printed name
    const zorblatina = { name: 'Zorblatina', value: 3, unit: 'mg/dL', confidence: 0.95 };
    await analyzeReport(page, [zorblatina]);
    await expect(rowFor(page, '3').getByText('Not identified')).toBeVisible();
    await changeTest(page, rowFor(page, '3'), NOT_A_LOINC_TEST);
    await saveReviewed(page);

    await goToTimeline(page);
    const card = await expandLabResult(page, '2024-03-10');
    const value = card.getByRole('table', { name: 'Test values' }).getByRole('row').filter({ hasText: '3' });
    await expect(value).toContainText('Zorblatina');

    await analyzeReport(page, [zorblatina]);
    await expect(savedAsCell(rowFor(page, '3'))).toHaveText(NOT_A_LOINC_TEST);
    await expectNoCheckLabel(rowFor(page, '3'));
  });

  const URINE_PH: ExtractedBiomarkerFixture = { name: 'pH (urine)', value: 6, unit: '', confidence: 0.95 };

  test('never matches a value with no unit on its name alone', async ({ page }) => {
    // Scenario: A value with no unit is never matched on its name alone
    const ai = await analyzeReport(page, [URINE_PH], 1, {
      testChoice: { choices: { 'pH (urine)': { code: '2756-5', confident: true } } },
    });
    expect(ai.choiceRequests).toHaveLength(1);
    const [asked] = ai.choiceRequests[0];
    expect(asked).toMatchObject({ name: 'pH (urine)', unit: '' });
    expect(asked.candidates.map((c) => c.code)).toContain('2756-5');
    await expect(savedAsCell(rowFor(page, '6'))).toHaveText('pH of Urine');
    await continueToConfirm(page);
  });

  test('asks me the test of a value with no unit the AI is not sure of', async ({ page }) => {
    // Scenario: I choose the test of a value with no unit the AI is not sure of
    await analyzeReport(page, [URINE_PH]);
    const row = rowFor(page, '6');
    await expect(savedAsCell(row)).toHaveText('No test chosen');
    await expect(row.getByText('No unit in report')).toBeVisible();
    await main(page).getByRole('button', { name: 'Continue to Confirm' }).click();
    await expect(main(page).getByText(/pH \(urine\) in ".*" needs a test/)).toBeVisible();
    await changeTest(page, row, NOT_A_LOINC_TEST);
    await continueToConfirm(page);
  });

  test('points out a unit that does not fit the chosen test', async ({ page }) => {
    // Scenario: A unit that does not fit the chosen test is pointed out
    await analyzeReport(page, [S_ALT]);
    const row = rowFor(page, String(S_ALT.value));
    await expect(row.getByText("Unit doesn't fit the test")).toHaveCount(0);
    await changeTest(page, row, SERUM_GLUCOSE);
    await expect(row.getByText("Unit doesn't fit the test")).toBeVisible();
    await continueToConfirm(page);
  });

  test('reads an edited name again', async ({ page }) => {
    // Scenario: Editing the printed name reads it again
    await analyzeReport(page, [GLUCOSIO]);
    await editRow(page, rowFor(page, '95'), { name: 'ALT', unit: 'U/L' });
    await expect(savedAsCell(rowFor(page, '95'))).toHaveText(ALT);
  });

  test('keeps a test I chose when I rename the value', async ({ page }) => {
    // Scenario: A test I chose stays when I rename the value
    await analyzeReport(page, [GLUCOSIO]);
    await changeTest(page, rowFor(page, '95'), BLOOD_GLUCOSE, { search: false });
    await editRow(page, rowFor(page, '95'), { name: 'Glicemia' });
    await expect(savedAsCell(rowFor(page, '95'))).toHaveText(BLOOD_GLUCOSE);
  });

  test('forgets a learned name removed in Settings', async ({ page }) => {
    // Two imports, each analyzed
    test.slow();
    // Scenario: Remove a learned name
    await learnGlucosio(page);
    await removeLearnedName(page, 'glucosio (mg/dL)');
    const ai = await analyzeReport(page, [GLUCOSIO]);
    expect(ai.choiceRequests).toHaveLength(1);
    await expect(savedAsCell(rowFor(page, '95'))).toHaveText('No test chosen');
  });

  const TWINS: ExtractedBiomarkerFixture[] = [S_ALT, { name: 'S-ALT', value: 0.5, unit: '/100 HPF', confidence: 0.95 }];

  test('saves a test given twice once, leaving out the share the app cannot read', async ({ page }) => {
    // Scenario: A test given twice, once as a share the app cannot read, is saved once
    await analyzeReport(page, TWINS);
    await expect(savedAsCell(rowFor(page, '30'))).toHaveText(ALT);
    await expect(rowFor(page, '0.5').getByText('Not saved:')).toBeVisible();
    await expect(rowFor(page, '0.5')).toContainText('To keep this one, choose its test or "Not a LOINC test".');
    await expect(rowFor(page, '30').getByText('Not saved:')).toHaveCount(0);

    await continueToConfirm(page);

    const notSaved = main(page).getByRole('alert').filter({ hasText: '1 value not saved' });
    await expect(notSaved).toContainText('S-ALT: 0.5 /100 HPF');
    await expect(main(page).getByRole('cell', { name: '30 U/L' })).toBeVisible();
    await expect(main(page).getByRole('cell', { name: '0.5 /100 HPF' })).toHaveCount(0);
  });

  test('asks no fix of a value it leaves out', async ({ page }) => {
    // Scenario: A value set aside needs no fixing
    await analyzeReport(page, TWINS);
    await rowFor(page, '0.5').getByRole('button', { name: 'Edit biomarker' }).click();
    await editingRow(page).getByPlaceholder('Value', { exact: true }).clear();
    await editingRow(page).getByRole('button', { name: 'Save changes' }).click();

    await continueToConfirm(page);
    await expect(main(page).getByRole('cell', { name: '30 U/L' })).toBeVisible();
  });

  test('never leaves out a value whose test I chose', async ({ page }) => {
    // Scenario: A test I choose is never left out
    await analyzeReport(page, TWINS);
    await expect(rowFor(page, '0.5').getByText('Not saved:')).toBeVisible();
    await changeTest(page, rowFor(page, '0.5'), ALT, { search: false });
    await expect(rowFor(page, '0.5').getByText('Not saved:')).toHaveCount(0);
  });

  test('fits review on a phone screen and shows the test in full', async ({ page }) => {
    // Scenario: Review fits a phone screen
    await analyzeReport(page, [S_ALT]);
    await page.setViewportSize({ width: 390, height: 844 });
    const savedAs = savedAsCell(rowFor(page, '30'));
    await expect(savedAs).toHaveText(ALT);
    expect(await savedAs.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    // Once the navigation has slid away for the narrow screen
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  });

  test('leaves the choice to me when the AI cannot be asked', async ({ page }) => {
    // Scenario: The AI cannot be asked which test a value is
    await analyzeReport(page, [GLUCOSIO], 1, { testChoice: { fails: true } });
    await expect(savedAsCell(rowFor(page, '95'))).toHaveText('No test chosen');
    await rowFor(page, '95').getByRole('button', { name: /^Change test for / }).click();
    await expect(testOption(testList(page), SERUM_GLUCOSE)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(main(page).getByText(/The AI could not choose the tests/)).toBeVisible();
  });
});
