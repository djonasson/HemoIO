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
      [
        { name: 'CREATINCHINASI - CK', value: 143, unit: 'U/L', confidence: 0.95 },
        'Creatine kinase [Enzymatic activity/volume] in Serum or Plasma',
      ],
      [{ name: 'GLICEMIA', value: 94, unit: 'mg/dL', confidence: 0.95 }, 'Glucose [Mass/volume] in Serum or Plasma'],
      [{ name: 'SIDEREMIA', value: 88, unit: 'ug/dL', confidence: 0.95 }, 'Iron [Mass/volume] in Serum or Plasma'],
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

  test('files an eGFR by a formula LOINC has no test for under the eGFR of no formula', async ({ page }) => {
    // Scenario Outline: An eGFR by a formula LOINC has no test for is filed under the eGFR of no formula
    const names = ['eGFR (formula EKFC)', 'eGFR (Schwartz)', 'eGFR (formula BIS)'];
    const ai = await analyzeReport(
      page,
      names.map((name, i) => ({ name, value: 81 + i, unit: 'mL/min/1.73m²', confidence: 0.95 }))
    );
    for (const i of names.keys()) {
      await expect(rowFor(page, String(81 + i)).getByText('LOINC 69405-9')).toBeVisible();
    }
    expect(ai.choiceRequests).toHaveLength(0);
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

  test('files a value said to be calculated under the calculated test, never a measured one', async ({ page }) => {
    // Scenario: A value said to be calculated is filed under the calculated test, never a measured one
    const ai = await analyzeReport(page, [{ name: 'Ematocrito (calcolato)', value: 41.7, unit: '%', confidence: 0.95 }]);
    await expect(savedAsCell(rowFor(page, '41.7'))).toHaveText('Hematocrit [Volume Fraction] of Blood by calculation');
    expect(ai.choiceRequests).toHaveLength(0);
  });

  test('never files a fibrinogen said to be derived under the Clauss fibrinogen', async ({ page }) => {
    // Scenario: A fibrinogen said to be derived is never filed under the Clauss fibrinogen
    const ai = await analyzeReport(page, [{ name: 'Fibrinogeno (derivato)', value: 310, unit: 'mg/dL', confidence: 0.95 }]);
    expect(ai.choiceRequests).toHaveLength(1);
    const names = ai.choiceRequests[0][0].candidates.map((c) => c.name);
    expect(names[0]).toBe('Fibrinogen [Mass/volume] in Platelet poor plasma by Coagulation.derived');
    expect(names).not.toContain('Fibrinogen [Mass/volume] in Platelet poor plasma by Coagulation assay');
  });

  test('asks about a value whose part after a dash names what the catalog cannot read', async ({ page }) => {
    // Scenario Outline: A part after a dash naming what the catalog cannot read is asked about
    const examples: [string, string, string][] = [
      ['Glucosio - liquido cefalorachidiano', 'mg/dL', 'Glucose [Mass/volume] in Serum or Plasma'],
      ['Proteine - liquor', 'mg/dL', 'Protein [Mass/volume] in Serum or Plasma'],
      ['Potassio - sudore', 'mmol/L', 'Potassium [Moles/volume] in Serum or Plasma'],
      ['Glucosio - 2 ore', 'mg/dL', 'Glucose [Mass/volume] in Serum or Plasma'],
      ['Cortisolo - ore 8', 'ug/dL', 'Cortisol [Mass/volume] in Serum or Plasma'],
    ];
    const ai = await analyzeReport(
      page,
      examples.map(([name, unit], i) => ({ name, value: 51 + i, unit, confidence: 0.95 }))
    );
    expect(ai.choiceRequests).toHaveLength(1);
    const asked = ai.choiceRequests[0];
    expect(asked.map((value) => value.name).sort()).toEqual(examples.map(([name]) => name).sort());
    for (const [name, , testName] of examples) {
      expect(asked.find((value) => value.name === name)?.candidates.map((c) => c.name)).toContain(testName);
    }
  });

  test('files a value whose part after a dash says only how the test is used', async ({ page }) => {
    // Scenario: A part after a dash saying only how the test is used says nothing of which test it is
    const ai = await analyzeReport(page, [
      {
        name: 'Rapporto albumina/creatinina - screening',
        value: 12,
        unit: 'mg/g',
        confidence: 0.95,
        specimenHint: 'urine',
      },
    ]);
    await expect(savedAsCell(rowFor(page, '12'))).toHaveText('Albumin/Creatinine [Mass Ratio] in Urine');
    expect(ai.choiceRequests).toHaveLength(0);
  });

  test('reads an aPTT printed as a ratio as the aPTT over a normal one, never the lupus ratio', async ({ page }) => {
    // Scenario Outline: An aPTT printed as a ratio is the aPTT over a normal one, never the lupus ratio
    const names = ['aPTT', 'aPTT ratio', 'Rapporto aPTT'];
    const ai = await analyzeReport(
      page,
      names.map((name, i) => ({ name, value: [1.01, 1.02, 1.03][i], unit: 'ratio', confidence: 0.95 }))
    );
    expect(ai.choiceRequests).toHaveLength(1);
    expect(ai.choiceRequests[0].map((value) => value.name).sort()).toEqual([...names].sort());
    for (const { candidates } of ai.choiceRequests[0]) {
      expect(candidates.map((c) => c.code)).toContain('63561-5');
      expect(candidates[0].code).not.toBe('75884-7');
    }
  });

  test('files a value whose part after a dash is another name of the same test', async ({ page }) => {
    // Scenario Outline: A part after a dash that is another name of the same test says nothing of which test it is
    const examples: [ExtractedBiomarkerFixture, string][] = [
      [
        { name: 'ALT - GPT', value: 31, unit: 'U/L', confidence: 0.95 },
        'Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma',
      ],
      [
        { name: 'AST - GOT', value: 27, unit: 'U/L', confidence: 0.95 },
        'Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma',
      ],
      [{ name: 'Ferro - sideremia', value: 92, unit: 'ug/dL', confidence: 0.95 }, 'Iron [Mass/volume] in Serum or Plasma'],
      [{ name: 'Glucosio - glicemia', value: 97, unit: 'mg/dL', confidence: 0.95 }, 'Glucose [Mass/volume] in Serum or Plasma'],
    ];
    const ai = await analyzeReport(page, examples.map(([value]) => value));
    for (const [value, testName] of examples) {
      await expect(savedAsCell(rowFor(page, String(value.value)))).toHaveText(testName);
    }
    expect(ai.choiceRequests).toHaveLength(0);
  });

  test('files a value of the blood count as one of blood', async ({ page }) => {
    // Scenario: A value of the blood count is one of blood
    const ai = await analyzeReport(page, [{ name: 'Emocromo - Emoglobina', value: 14.2, unit: 'g/dL', confidence: 0.95 }]);
    await expect(savedAsCell(rowFor(page, '14.2'))).toHaveText('Hemoglobin [Mass/volume] in Blood');
    expect(ai.choiceRequests).toHaveLength(0);
  });

  test('never moves another test to blood under a blood count heading', async ({ page }) => {
    // Scenario Outline: A blood count heading never moves another test to blood
    await analyzeReport(page, [
      { name: 'Emocromo - Vitamina B12', value: 412, unit: 'pg/mL', confidence: 0.95 },
      { name: 'Emocromo - Colinesterasi', value: 7300, unit: 'U/L', confidence: 0.95 },
      { name: 'Emocromo - Glucosio', value: 93, unit: 'mg/dL', confidence: 0.95 },
    ]);
    for (const value of ['412', '7300', '93']) {
      await expect(savedAsCell(rowFor(page, value))).toBeVisible();
      await expect(savedAsCell(rowFor(page, value))).not.toHaveText(/\bin (?:Blood|Red Blood Cells|Erythrocytes)\b/);
    }
  });

  test('asks about a sample named beside a name known only for another sample', async ({ page }) => {
    // Scenario Outline: A sample named beside a name known only for another sample is asked
    await analyzeReport(page, [
      { name: 'Glicemia urine', value: 15, unit: 'mg/dL', confidence: 0.95 },
      { name: 'Sideremia urine', value: 21, unit: 'ug/dL', confidence: 0.95 },
      { name: 'GPT urine', value: 9, unit: 'U/L', confidence: 0.95 },
    ]);
    for (const value of ['15', '21', '9']) {
      await expect(savedAsCell(rowFor(page, value))).toBeVisible();
      await expect(savedAsCell(rowFor(page, value))).not.toHaveText(/Serum/);
    }
  });

  test('asks about "Protrombina" printed as a ratio with the prothrombin time over a normal one first', async ({ page }) => {
    // Scenario Outline: "Protrombina" printed as a ratio is the prothrombin time over a normal one, never filed as prothrombin activity
    const names = ['Protrombina', 'Protrombina ratio', 'Ratio protrombina', 'Protrombina - rapporto'];
    const ai = await analyzeReport(
      page,
      names.map((name, i) => ({ name, value: [1.04, 1.05, 1.06, 1.07][i], unit: 'ratio', confidence: 0.95 }))
    );
    expect(ai.choiceRequests).toHaveLength(1);
    expect(ai.choiceRequests[0].map((value) => value.name).sort()).toEqual([...names].sort());
    for (const { candidates } of ai.choiceRequests[0]) {
      expect(candidates[0].name).toBe('Prothrombin time (PT) actual/Normal');
    }
  });

  test('asks about a clotting factor or protein printed as a ratio', async ({ page }) => {
    // Scenario Outline: A clotting factor or protein printed as a ratio is asked about
    const names = ['Fattore VIII', 'Proteina S'];
    const ai = await analyzeReport(
      page,
      names.map((name, i) => ({ name, value: [0.95, 0.85][i], unit: 'ratio', confidence: 0.95 }))
    );
    expect(ai.choiceRequests).toHaveLength(1);
    expect(ai.choiceRequests[0].map((value) => value.name).sort()).toEqual([...names].sort());
  });

  test('files a ratio of times printed in ratio under that time ratio', async ({ page }) => {
    // Scenario: A ratio of times printed in ratio is filed under that time ratio
    const ai = await analyzeReport(page, [
      { name: 'Proteina C attivata resistenza', value: 2.4, unit: 'ratio', confidence: 0.95 },
    ]);
    await expect(savedAsCell(rowFor(page, '2.4'))).toHaveText(
      'Activated protein C resistance [Time Ratio] in Platelet poor plasma by Coagulation assay'
    );
    // Scenario: A plain ratio fits every ratio of like quantities
    await expect(rowFor(page, '2.4').getByText("Unit doesn't fit the test")).toHaveCount(0);
    expect(ai.choiceRequests).toHaveLength(0);
  });

  test('keeps the presence test first for a slash joining two names of one test', async ({ page }) => {
    // Scenario: A slash joining two names of one test does not put ratios first
    const ai = await analyzeReport(page, [
      { name: 'Proteine/Albumina', value: 0, unit: '', confidence: 0.95, specimenHint: 'urine', qualitativeValue: 'Assenti' },
      { name: 'Borrelia IgG/IgM', value: 0, unit: '', confidence: 0.95, qualitativeValue: 'Negativo' },
    ]);
    const asked = Object.fromEntries(ai.choiceRequests.flat().map((value) => [value.name, value.candidates.map((c) => c.code)]));
    expect(asked['Proteine/Albumina']).toBeUndefined();
    await expect(savedAsCell(rowFor(page, 'Assenti (0)'))).toHaveText('Albumin [Presence] in Urine');
    expect(asked['Borrelia IgG/IgM']).toContain('46248-1');
  });

  test('reads "Colesterolo HDL" with no unit as HDL before the cholesterol/HDL ratio', async ({ page }) => {
    // Scenario: A ratio's name by its parts needs the slash
    const ai = await analyzeReport(page, [{ name: 'Colesterolo HDL', value: 55, unit: '', confidence: 0.95 }]);
    const codes = ai.choiceRequests.flat()[0].candidates.map((c) => c.code);
    const ratio = codes.indexOf('9830-1');
    expect(codes.indexOf('2085-9')).toBeLessThan(ratio === -1 ? codes.length : ratio);
  });

  test('asks about a ratio printed with no unit, the ratio its name says first', async ({ page }) => {
    // Scenario: A ratio printed with no unit is asked about, the ratio its name says first
    const ai = await analyzeReport(page, [{ name: 'Rapporto colesterolo/HDL', value: 3.6, unit: '', confidence: 0.95 }]);
    expect(ai.choiceRequests).toHaveLength(1);
    expect(ai.choiceRequests[0][0].candidates[0].name).toBe(
      'Cholesterol.total/Cholesterol in HDL [Mass Ratio] in Serum or Plasma'
    );
  });

  test('saves a ratio printed with no unit once its ratio is chosen, asking no unit', async ({ page }) => {
    // Scenario: A ratio printed with no unit is saved with none
    await analyzeReport(page, [{ name: 'Rapporto colesterolo/HDL', value: 3.6, unit: '', confidence: 0.95 }], 1, {
      testChoice: { choices: { 'Rapporto colesterolo/HDL': { code: '9830-1', confident: true } } },
    });
    await expect(savedAsCell(rowFor(page, '3.6'))).toHaveText(
      'Cholesterol.total/Cholesterol in HDL [Mass Ratio] in Serum or Plasma'
    );
    await continueToConfirm(page);
  });

  test('files a ratio printed by its parts under that ratio', async ({ page }) => {
    // Scenario Outline: A ratio printed by its parts is filed under that ratio
    const ai = await analyzeReport(page, [
      { name: 'Rapporto colesterolo/HDL', value: 3.6, unit: 'ratio', confidence: 0.95 },
      { name: 'Rapporto A/G', value: 1.4, unit: 'ratio', confidence: 0.95 },
    ]);
    await expect(savedAsCell(rowFor(page, '3.6'))).toHaveText(
      'Cholesterol.total/Cholesterol in HDL [Mass Ratio] in Serum or Plasma'
    );
    await expect(savedAsCell(rowFor(page, '1.4'))).toHaveText('Albumin/Globulin [Mass Ratio] in Serum or Plasma');
    expect(ai.choiceRequests).toHaveLength(0);
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
    await expect(testOption(list, SERUM_GLUCOSE)).toHaveAccessibleName(`Glucose · Mass/volume, ${SERUM_GLUCOSE} · 2345-7`);
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
    await expect(list.getByText('Printed: Glucosio · 95 mg/dL')).toBeVisible();
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
    await expect(blood).toHaveAccessibleDescription(/Sample: Whole Blood.*fits mg\/dL/);
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

    await changeTest(page, rows.first(), SERUM_GLUCOSE, { search: false });
    await expect(savedAsCell(rows.nth(1))).toHaveText(SERUM_GLUCOSE);
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

  test('offers only tests whose results are words for a result printed in words', async ({ page }) => {
    // Scenario: A result printed in words is only a test whose results are words
    const ai = await analyzeReport(page, [
      { name: 'Batteri (urine)', value: 0, unit: '', confidence: 0.95, specimenHint: 'urine', qualitativeValue: 'Assenti' },
    ]);
    expect(ai.choiceRequests).toHaveLength(1);
    const codes = ai.choiceRequests[0][0].candidates.map((c) => c.code);
    expect(codes).toEqual(expect.arrayContaining(['50221-1', '25145-4']));
    expect(codes).not.toContain('630-4');
    expect(codes).not.toContain('51480-2');
  });

  test("files a result in words in the urine sediment as the microscope's", async ({ page }) => {
    // Scenario: A result in words in the urine sediment is the microscope's
    const ai = await analyzeReport(page, [
      { name: 'Batteri', value: 0, unit: '', confidence: 0.95, specimenHint: 'urine sediment', qualitativeValue: 'Assenti' },
    ]);
    await expect(savedAsCell(rowFor(page, 'Assenti (0)'))).toHaveText('Bacteria [Presence] in Urine sediment by Light microscopy');
    expect(ai.choiceRequests).toHaveLength(0);
  });

  test('saves a value with no test to choose from as "Not a LOINC test" without asking', async ({ page }) => {
    // Scenario: A value with no test to choose from is saved as "Not a LOINC test" without asking
    const ai = await analyzeReport(page, [{ name: 'Conduttività', value: 12.5, unit: 'mS/cm', confidence: 0.95 }]);
    const row = rowFor(page, '12.5');
    await expect(savedAsCell(row)).toHaveText(NOT_A_LOINC_TEST);
    await expect(row.getByText('Not identified')).toBeVisible();
    expect(ai.choiceRequests).toHaveLength(0);
    await expect(page.getByText(/could not be identified/)).toHaveCount(0);
    await expect(row.getByRole('button', { name: 'Change test for Conduttività' })).toBeVisible();
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
