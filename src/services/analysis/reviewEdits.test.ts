import { describe, it, expect } from 'vitest';
import { fixtureCatalog } from '@/test/loincFixture';
import { identifyValues } from './identification';
import {
  applyBiomarkerName,
  applyBiomarkerUnit,
  chooseTest,
  chooseTestForWording,
  searchTests,
  unitOptionsFor,
} from './reviewEdits';
import type { MatchedBiomarker } from './LabReportAnalyzer';

const catalog = fixtureCatalog();

/** A value as the analyzer gives it, the AI choosing `aiCode` when asked */
async function analyzed(name: string, unit: string, aiCode?: string, specimenHint?: string): Promise<MatchedBiomarker> {
  const value = { name, value: 5, unit, confidence: 0.9, ...(specimenHint && { specimenHint }) };
  const { values } = await identifyValues(catalog, [value], {
    choose: async (requests) => requests.map(({ id }) => ({ id, code: aiCode ?? null, confident: true })),
  });
  return values[0];
}

/** A row added in review, as it starts */
const ADDED: MatchedBiomarker = {
  name: '',
  value: NaN,
  unit: '',
  confidence: 1,
  candidates: [],
};

describe('searchTests', () => {
  it('finds tests in the catalog by name, and a code typed first', () => {
    expect(searchTests(catalog, 'Glucose').map((t) => t.code)).toContain('2345-7');
    expect(searchTests(catalog, ' 718-7 ')[0].code).toBe('718-7');
    expect(searchTests(catalog, '  ')).toEqual([]);
  });
});

describe('unitOptionsFor', () => {
  it("offers the test's own units, and none without a test", () => {
    expect(unitOptionsFor(catalog, '2345-7')).toContain('mg/dL');
    expect(unitOptionsFor(catalog, undefined)).toEqual([]);
  });
});

describe('applyBiomarkerName', () => {
  it('reads a renamed value again, as the analyzer reads a printed name', async () => {
    const value = await analyzed('Zorb', 'mg/dL');
    expect(value.identificationFlags).toEqual(['not-identified']);
    const renamed = applyBiomarkerName(value, 'P-Glucosio', catalog);
    expect(renamed).toMatchObject({ name: 'P-Glucosio', loincCode: '2345-7', identifiedBy: 'local' });
  });

  it("has the AI's test again when the printed name is typed back", async () => {
    // "Blood" leaves the sample open: the AI chooses
    const value = await analyzed('Glucosio', 'mmol/L', '15074-8', 'blood');
    const typo = applyBiomarkerName(value, 'Glucosi', catalog);
    expect(typo.loincCode).toBeUndefined();
    expect(applyBiomarkerName(typo, 'glucosio ', catalog)).toMatchObject({ loincCode: '15074-8', identifiedBy: 'ai' });
  });

  it('keeps a test the user chose, and "Not a LOINC test"', async () => {
    const chosen = chooseTest(await analyzed('Glucosio', 'mmol/L'), '15074-8');
    expect(applyBiomarkerName(chosen, 'Zorb', catalog).loincCode).toBe('15074-8');
    const unknown = chooseTest(await analyzed('P-Glucosio', 'mg/dL'), null);
    expect(applyBiomarkerName(unknown, 'Glucosio', catalog)).toMatchObject({ savedAsUnknown: true, loincCode: undefined });
  });

  it('reads the learned tests', async () => {
    const value = await analyzed('Zorb', 'mg/dL');
    expect(applyBiomarkerName(value, 'Zorblatina', catalog, { 'zorblatina|mg/dL': '2339-0' })).toMatchObject({
      loincCode: '2339-0',
      identifiedBy: 'learned',
    });
  });

  it('reads a row added in review by its name once it has a unit', () => {
    const named = applyBiomarkerName(ADDED, 'P-Glucosio', catalog);
    expect(named.loincCode).toBeUndefined();
    expect(applyBiomarkerUnit(named, 'mg/dL', catalog)).toMatchObject({ loincCode: '2345-7', identifiedBy: 'local' });
  });
});

describe('applyBiomarkerUnit', () => {
  it('reads a value again in the new unit', async () => {
    const value = await analyzed('P-Glucosio', 'mg/dL');
    expect(applyBiomarkerUnit(value, 'mmol/L', catalog)).toMatchObject({ unit: 'mmol/L', loincCode: '14749-6' });
  });

  it("keeps the report's test while the unit is emptied: it is one still to choose", async () => {
    const value = await analyzed('P-Glucosio', 'mg/dL');
    const emptied = applyBiomarkerUnit(value, '', catalog);
    expect(emptied).toMatchObject({ unit: '', loincCode: '2345-7' });
    expect(emptied.savedAsUnknown).toBeFalsy();
  });

  it('identifies a value the report gave no unit once it has one', async () => {
    const screening = await analyzed('P-Glucosio', '');
    expect(screening).toMatchObject({ identificationFlags: ['ambiguous', 'no-unit'] });
    expect(screening.loincCode).toBeUndefined();
    const withUnit = applyBiomarkerUnit(screening, 'mg/dL', catalog);
    expect(withUnit).toMatchObject({ loincCode: '2345-7', identificationFlags: [] });
    expect(withUnit.savedAsUnknown).toBeUndefined();
  });
});

describe('chooseTest', () => {
  it("saves a value as the user's test, or as not a LOINC test", async () => {
    const value = await analyzed('Glucosio', 'mmol/L');
    expect(chooseTest(value, '14749-6')).toMatchObject({
      loincCode: '14749-6',
      identifiedBy: 'user',
      identificationFlags: [],
      savedAsUnknown: false,
    });
    const unknown = chooseTest(value, null);
    expect(unknown).toMatchObject({ identifiedBy: 'user', identificationFlags: [], savedAsUnknown: true });
    expect(unknown.loincCode).toBeUndefined();
    // The tests to choose from stay, to change the choice again
    expect(unknown.candidates).toEqual(value.candidates);
  });
});

describe('chooseTestForWording', () => {
  /** An undecided value as review shows it */
  const undecided = (name: string, unit: string, specimenHint?: string): MatchedBiomarker => ({
    name,
    value: 40,
    unit,
    confidence: 0.9,
    candidates: [],
    identificationFlags: ['not-identified'],
    ...(specimenHint && { specimenHint }),
  });
  const files = (...values: MatchedBiomarker[][]) => values.map((editedBiomarkers, i) => ({ fileName: `${i}.pdf`, editedBiomarkers }));

  it('gives the choice to the same wording in every file', () => {
    const results = files([undecided('Ematocrito', '%')], [undecided('Ematocrito', '%'), undecided('MPV', 'fL')]);

    const chosen = chooseTestForWording(results, { resultIndex: 0, biomarkerIndex: 0 }, '4544-3');

    expect(chosen.map((file) => file.editedBiomarkers.map((value) => value.loincCode))).toEqual([
      ['4544-3'],
      ['4544-3', undefined],
    ]);
    expect(chosen[1].editedBiomarkers[0].identifiedBy).toBe('user');
    expect(chosen[1].editedBiomarkers[1]).toBe(results[1].editedBiomarkers[1]);
  });

  it('gives "Not a LOINC test" to the same wording too', () => {
    const results = files([undecided('Conduttività', 'mS/cm')], [undecided('Conduttività', 'mS/cm')]);

    const chosen = chooseTestForWording(results, { resultIndex: 1, biomarkerIndex: 0 }, null);

    expect(chosen.every((file) => file.editedBiomarkers[0].savedAsUnknown)).toBe(true);
  });

  it('never changes a test the user chose themselves, another unit or another sample', () => {
    const ownChoice = chooseTest(undecided('Ematocrito', '%'), '20570-8');
    const results = files(
      [undecided('Ematocrito', '%')],
      [ownChoice, undecided('Ematocrito', 'L/L'), undecided('Ematocrito', '%', 'urine')]
    );

    const chosen = chooseTestForWording(results, { resultIndex: 0, biomarkerIndex: 0 }, '4544-3');

    expect(chosen[1].editedBiomarkers).toEqual(results[1].editedBiomarkers);
    expect(chosen[1]).toBe(results[1]);
  });

  it('changes again a value the user already chose, when it is the one chosen', () => {
    const results = files([chooseTest(undecided('Ematocrito', '%'), '20570-8')]);

    const chosen = chooseTestForWording(results, { resultIndex: 0, biomarkerIndex: 0 }, '4544-3');

    expect(chosen[0].editedBiomarkers[0].loincCode).toBe('4544-3');
  });
});
