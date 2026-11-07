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
import { biomarkerSelect, goToTrends } from './steps/trends.steps';
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

  test("files a value in a day's unit under the 24-hour urine test", async ({ page }) => {
    // Scenario: A value in a day's unit is filed under the 24-hour urine test
    const ai = await analyzeReport(page, [{ name: 'Proteinuria', value: 150, unit: 'mg/24h', confidence: 0.95 }]);
    await expect(savedAsCell(rowFor(page, '150'))).toHaveText('Protein [Mass/time] in 24 hour Urine');
    expect(ai.choiceRequests).toHaveLength(0);
  });

  test('asks about a name shared only with a rarely used test, offering the common tests it may be', async ({
    page,
  }) => {
    // Scenario: A name shared only with a rarely used test is asked about, with the common tests it may be
    const ai = await analyzeReport(page, [{ name: 'Fosforo', value: 3.5, unit: 'mg/dL', confidence: 0.95 }]);
    expect(ai.choiceRequests).toHaveLength(1);
    expect(ai.choiceRequests[0][0].candidates.map((c) => c.code)).toEqual(
      expect.arrayContaining(['2567-6', '2777-1'])
    );
    await rowFor(page, '3.5').getByRole('button', { name: /^Change test for / }).click();
    await expect(testOption(testList(page), 'Phosphate [Mass/volume] in Serum or Plasma')).toBeVisible();
  });

  test('asks about a value said of blood whose blood and serum tests trend apart', async ({ page }) => {
    // Scenario: A value the lab says is blood is asked about when the blood and serum tests trend apart
    const ai = await analyzeReport(page, [{ name: 'Etanolo ematico', value: 0.4, unit: 'g/L', confidence: 0.95 }]);
    expect(ai.choiceRequests).toHaveLength(1);
    expect(ai.choiceRequests[0][0].candidates.map((c) => c.code)).toEqual(
      expect.arrayContaining(['5640-8', '5643-2'])
    );
    await rowFor(page, '0.4').getByRole('button', { name: /^Change test for / }).click();
    await expect(testOption(testList(page), 'Ethanol [Mass/volume] in Blood')).toBeVisible();
  });

  test('finds a test named by a word many tests share', async ({ page }) => {
    // Scenario: A test named by a word many tests share is still found
    const ai = await analyzeReport(page, [{ name: 'IgG', value: 1100, unit: 'mg/dL', confidence: 0.95 }]);
    await expect(savedAsCell(rowFor(page, '1100'))).toHaveText('IgG [Mass/volume] in Serum or Plasma');
    expect(ai.choiceRequests).toHaveLength(0);
  });

  test("matches usual lab names LOINC's names lack by HemoIO's own names", async ({ page }) => {
    // Scenario Outline: A usual lab name that LOINC's names lack is matched by HemoIO's own names
    const examples: [ExtractedBiomarkerFixture, string][] = [
      [{ name: 'Ematocrito', value: 42.1, unit: '%', confidence: 0.95 }, 'Hematocrit [Volume Fraction] of Blood by Automated count'],
      [{ name: 'MPV', value: 10.3, unit: 'fL', confidence: 0.95 }, 'Platelet [Entitic mean volume] in Blood by Automated count'],
      [{ name: 'RDW', value: 13.2, unit: '%', confidence: 0.95 }, 'Erythrocyte [DistWidth] in Blood by Automated count'],
      [
        { name: 'Eritroblasti', value: 0.1, unit: '%', confidence: 0.95 },
        'Nucleated erythrocytes/Leukocytes [Ratio] in Blood by Automated count',
      ],
      [
        { name: 'Er-EMOGLOBINA GLICATA', value: 38, unit: 'mmol/mol', confidence: 0.95 },
        'Hemoglobin A1c/Hemoglobin.total in Blood',
      ],
    ];
    const ai = await analyzeReport(page, examples.map(([value]) => value));
    for (const [value, testName] of examples) {
      await expect(savedAsCell(rowFor(page, String(value.value)))).toHaveText(testName);
    }
    expect(ai.choiceRequests).toHaveLength(0);
  });

  test('files one measurement made by several methods under the general test', async ({ page }) => {
    // Scenario: One measurement made by several methods is filed under the general test without asking
    const ai = await analyzeReport(page, [
      { name: 'Eritrociti', value: 12, unit: '/µL', confidence: 0.95, specimenHint: 'urine' },
    ]);
    await expect(savedAsCell(rowFor(page, '12'))).toHaveText('Erythrocytes [#/volume] in Urine');
    expect(ai.choiceRequests).toHaveLength(0);
  });

  test('never takes squamous cells for non-squamous ones', async ({ page }) => {
    // Scenario: Squamous cells are never taken for non-squamous ones
    await analyzeReport(page, [
      { name: 'Cellule Ep. Squamose', value: 7, unit: '/µL', confidence: 0.95, specimenHint: 'urine' },
    ]);
    await expect(savedAsCell(rowFor(page, '7'))).toHaveText(
      'Epithelial cells.squamous [#/volume] in Urine by Automated count'
    );
  });

  test('files a D-dimer printed in FEU under an FEU test', async ({ page }) => {
    // Scenario: A D-dimer printed in fibrinogen equivalent units is filed under an FEU test
    const ai = await analyzeReport(page, [{ name: 'D Dimero', value: 410, unit: 'µg/L FEU', confidence: 0.95 }]);
    await expect(savedAsCell(rowFor(page, '410'))).toHaveText('Fibrin D-dimer FEU [Mass/volume] in Platelet poor plasma');
    expect(ai.choiceRequests).toHaveLength(0);
  });

  test('asks about a D-dimer that names neither FEU nor DDU', async ({ page }) => {
    // Scenario: A D-dimer that names neither FEU nor DDU is asked about
    const ai = await analyzeReport(page, [{ name: 'D Dimero', value: 420, unit: 'ng/mL', confidence: 0.95 }]);
    expect(ai.choiceRequests).toHaveLength(1);
    expect(ai.choiceRequests[0][0].candidates.map((c) => c.code)).toEqual(
      expect.arrayContaining(['48065-7', '48066-5'])
    );
  });

  test("reads a D-dimer's units however the report sets them off", async ({ page }) => {
    // Scenario: A D-dimer's units are read however the report sets them off
    const ai = await analyzeReport(page, [{ name: 'D Dimero', value: 430, unit: 'ng/mL (FEU)', confidence: 0.95 }]);
    await expect(savedAsCell(rowFor(page, '430'))).toHaveText('Fibrin D-dimer FEU [Mass/volume] in Platelet poor plasma');
    expect(ai.choiceRequests).toHaveLength(0);
  });

  test('asks about an eGFR by a formula LOINC has no test for, filtration rates first', async ({ page }) => {
    // Scenario Outline: An eGFR by a formula LOINC has no test for is asked about, filtration rates first
    const names = ['eGFR (formula EKFC)', 'eGFR (Schwartz)', 'eGFR (formula BIS)'];
    const ai = await analyzeReport(
      page,
      names.map((name, i) => ({ name, value: 81 + i, unit: 'mL/min/1.73m²', confidence: 0.95 }))
    );
    expect(ai.choiceRequests).toHaveLength(1);
    expect(ai.choiceRequests[0].map((asked) => asked.name).sort()).toEqual([...names].sort());
    for (const { candidates } of ai.choiceRequests[0]) {
      expect(candidates[0].code).toBe('98979-8');
      expect(candidates.slice(0, 4).every((c) => c.name.startsWith('Glomerular filtration rate'))).toBe(true);
    }
  });

  test('files an eGFR under the formula its bracket names', async ({ page }) => {
    // Scenario Outline: An eGFR is filed under the formula its bracket names
    const examples: [string, string][] = [
      ['eGFR (CKD-EPI)', '98979-8'],
      ['eGFR (CKD-EPI 2009)', '62238-1'],
      ['eGFR (formula MDRD)', '77147-7'],
      ['eGFR (cistatina C)', '50210-4'],
    ];
    const ai = await analyzeReport(
      page,
      examples.map(([name], i) => ({ name, value: 71 + i, unit: 'mL/min/1.73m²', confidence: 0.95 }))
    );
    for (const [i, [, code]] of examples.entries()) {
      await expect(rowFor(page, String(71 + i)).getByText(`LOINC ${code}`)).toBeVisible();
    }
    expect(ai.choiceRequests).toHaveLength(0);
  });

  test('picks the test of a method named in brackets, a brand beside it saying nothing', async ({ page }) => {
    // Scenario: A method named in brackets picks its test, a brand beside it says nothing
    const ai = await analyzeReport(page, [
      { name: 'HbA1c (HPLC Tosoh)', value: 39, unit: 'mmol/mol', confidence: 0.95 },
      { name: 'Albumina (BCG Roche)', value: 4.4, unit: 'g/dL', confidence: 0.95 },
    ]);
    await expect(savedAsCell(rowFor(page, '39'))).toHaveText('Hemoglobin A1c/Hemoglobin.total in Blood by HPLC');
    await expect(savedAsCell(rowFor(page, '4.4'))).toHaveText(
      'Albumin [Mass/volume] in Serum or Plasma by Bromocresol green (BCG) dye binding method'
    );
    expect(ai.choiceRequests).toHaveLength(0);
  });

  test('never files a value said to be calculated under a measured test', async ({ page }) => {
    // Scenario: A value said to be calculated is never filed under a measured test
    const ai = await analyzeReport(page, [{ name: 'Ematocrito (calcolato)', value: 41.7, unit: '%', confidence: 0.95 }]);
    expect(ai.choiceRequests).toHaveLength(1);
    expect(ai.choiceRequests[0][0].candidates.map((c) => c.name)).toContain(
      'Hematocrit [Volume Fraction] of Blood by calculation'
    );
  });

  test('files a count per microscope field under a test counted per field', async ({ page }) => {
    // Scenario: A count per microscope field is filed under a test counted per field
    await analyzeReport(page, [
      { name: 'Batteri', value: 3, unit: 'per campo', confidence: 0.95, specimenHint: 'urine' },
    ]);
    await expect(savedAsCell(rowFor(page, '3'))).toHaveText(
      'Bacteria [#/area] in Urine sediment by Microscopy high power field'
    );
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

  test('sets the tests to choose from side by side, and chooses one by a click on its row', async ({ page }) => {
    // Scenario: The tests to choose from are set side by side
    await analyzeReport(page, [GLUCOSIO], 1, {
      testChoice: { choices: { Glucosio: { code: '2339-0', confident: false } } },
    });
    const row = rowFor(page, '95');
    await row.getByRole('button', { name: /^Change test for / }).click();
    const list = testList(page);
    const table = list.getByRole('table', { name: 'Tests' });
    await expect(table.getByRole('columnheader')).toHaveText(['Test', 'Sample', 'Method', 'Units', 'Code']);

    const serum = table.getByRole('row').filter({ has: testOption(page, SERUM_GLUCOSE) });
    await expect(serum).toContainText('Glucose · Mass/volume');
    await expect(serum).toContainText('Serum/Plasma');
    await expect(serum).toContainText('fits mg/dL');
    await expect(serum).toContainText('2345-7');
    await expect(serum).toContainText(`LOINC: ${SERUM_GLUCOSE}`);
    await expect(serum).toContainText('Common');
    await expect(serum).toContainText('Blood sugar level');
    const blood = table.getByRole('row').filter({ has: testOption(page, BLOOD_GLUCOSE) });
    await expect(blood).toContainText("The AI's best guess");

    await blood.getByRole('cell', { name: 'Whole Blood' }).click();
    await expect(list).toBeHidden();
    await expect(savedAsCell(row)).toHaveText(BLOOD_GLUCOSE);
  });

  test('fills a phone screen with the tests as cards', async ({ page }) => {
    // Scenario: The test list on a phone
    await page.setViewportSize({ width: 320, height: 640 });
    await analyzeReport(page, [GLUCOSIO]);
    await rowFor(page, '95').getByRole('button', { name: /^Change test for / }).click();
    const list = testList(page);
    const cards = list.getByRole('group', { name: 'Tests' });
    await expect(list.getByRole('table')).toHaveCount(0);
    const blood = testOption(cards, BLOOD_GLUCOSE);
    await expect(blood).toContainText('Sample: Whole Blood');
    await expect(blood).toContainText('Method: —');
    await expect(blood).toContainText('Code: 2339-0');
    // Full screen, and nothing sticks out sideways
    const box = await list.boundingBox();
    expect(box?.width).toBe(320);
    expect(await list.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
    await blood.click();
    await expect(list).toBeHidden();
    await expect(savedAsCell(rowFor(page, '95'))).toHaveText(BLOOD_GLUCOSE);
  });

  test('gives one choice to the same wording in every file of the import', async ({ page }) => {
    // Scenario: One choice covers the same wording in every file of the import
    await analyzeReport(page, [GLUCOSIO], 2);
    await page.getByRole('button', { name: /lab-report-2\.pdf/ }).click();
    const rows = rowFor(page, '95');
    await expect(rows).toHaveCount(2);
    await expect(savedAsCell(rows.nth(1))).toHaveText('No test chosen');

    await changeTest(page, rows.first(), BLOOD_GLUCOSE, { search: false });

    await expect(savedAsCell(rows.first())).toHaveText(BLOOD_GLUCOSE);
    await expect(savedAsCell(rows.nth(1))).toHaveText(BLOOD_GLUCOSE);
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

  test('does not give a value said to be of another sample the test learned for its wording', async ({ page }) => {
    // Two imports, the first saved
    test.slow();
    // Scenario: A value said to be of another sample is not given the test learned for its wording
    await learnGlucosio(page);
    await analyzeReport(page, [{ ...GLUCOSIO, specimenHint: 'urine' }]);
    await expect(savedAsCell(rowFor(page, '95'))).toHaveText('Glucose [Mass/volume] in Urine');
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

  test('saves a renamed "Not a LOINC test" and later reports of its wording as one series', async ({ page }) => {
    // Two imports, each analyzed
    test.slow();
    // Scenario: A renamed "Not a LOINC test" and later reports of its wording form one series
    const zorblatina = { name: 'Zorblatina', value: 3, unit: 'mg/dL', confidence: 0.95 };
    await analyzeReport(page, [zorblatina]);
    await editRow(page, rowFor(page, '3'), { name: 'Zorb' });
    await changeTest(page, rowFor(page, '3'), NOT_A_LOINC_TEST);
    await saveReviewed(page);

    await analyzeReport(page, [{ ...zorblatina, value: 4 }]);
    await expect(savedAsCell(rowFor(page, '4'))).toHaveText(NOT_A_LOINC_TEST);
    await saveReviewed(page);

    await goToTrends(page);
    await biomarkerSelect(page).click();
    await expect(page.getByRole('option', { name: /\(2 values\)$/ })).toHaveCount(1);
    // Not a series of its own for either wording
    await expect(page.getByRole('option', { name: /\(1 value\)$/ })).toHaveCount(0);
  });

  test('remembers a correction reached through a learned wording', async ({ page }) => {
    // Three imports, each analyzed
    test.slow();
    // Scenario: Correcting a test reached through a learned wording is remembered
    await learnGlucosio(page);
    const glicemia = { ...GLUCOSIO, name: 'Glicemia', value: 88 };
    await analyzeReport(page, [glicemia]);
    await changeTest(page, rowFor(page, '88'), SERUM_GLUCOSE, { search: false });
    await saveReviewed(page);

    await analyzeReport(page, [{ ...glicemia, value: 89 }]);
    await expect(savedAsCell(rowFor(page, '89'))).toHaveText(SERUM_GLUCOSE);
    await editRow(page, rowFor(page, '89'), { name: 'Glucosio' });
    await expect(savedAsCell(rowFor(page, '89'))).toHaveText(BLOOD_GLUCOSE);
    await saveReviewed(page);

    await analyzeReport(page, [{ ...glicemia, value: 90 }]);
    await expect(savedAsCell(rowFor(page, '90'))).toHaveText(BLOOD_GLUCOSE);
  });

  test('matches a value with no unit to the common test that has none, of the sample it names', async ({ page }) => {
    // Scenario: A value with no unit is matched to the common test that has none, of the sample it names
    const ai = await analyzeReport(page, [{ name: 'pH (urine)', value: 6, unit: '', confidence: 0.95 }]);
    await expect(savedAsCell(rowFor(page, '6'))).toHaveText('pH of Urine');
    expect(ai.choiceRequests).toHaveLength(0);
    await continueToConfirm(page);
  });

  test('asks about a value with no unit and no sample named', async ({ page }) => {
    // Scenario: A value with no unit and no sample named is asked about
    const ai = await analyzeReport(page, [{ name: 'Ferritina', value: 4, unit: '', confidence: 0.95 }]);
    expect(ai.choiceRequests).toHaveLength(1);
    const offered = ai.choiceRequests[0][0].candidates.map((c) => c.name);
    expect(offered[0]).toBe('Ferritin [Interpretation] in Blood');
    expect(offered).toContain('Ferritin [Mass/volume] in Serum or Plasma');
  });

  test('reads a dipstick result with no unit as present or absent', async ({ page }) => {
    // Scenario: A dipstick result with no unit is read as present or absent, never as an amount
    await analyzeReport(page, [{ name: 'Nitriti', value: 0, unit: '', confidence: 0.95, specimenHint: 'urine' }]);
    await expect(savedAsCell(rowFor(page, '0'))).toHaveText('Nitrite [Presence] in Urine by Test strip');
  });

  test('asks me the test of a value with no unit the AI is not sure of', async ({ page }) => {
    // Scenario: I choose the test of a value with no unit the AI is not sure of
    await analyzeReport(page, [{ name: 'Glucosio', value: 6, unit: '', confidence: 0.95 }]);
    const row = rowFor(page, '6');
    await expect(savedAsCell(row)).toHaveText('No test chosen');
    await expect(row.getByText('No unit in report')).toBeVisible();
    await main(page).getByRole('button', { name: 'Continue to Confirm' }).click();
    await expect(main(page).getByText(/Glucosio in ".*" needs a test/)).toBeVisible();
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
