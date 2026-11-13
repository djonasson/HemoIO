import { describe, it, expect } from 'vitest';
import { fixtureCatalog } from '@/test/loincFixture';
import { identifyValues, toLearn } from './identification';
import {
  applyBiomarkerName,
  applyBiomarkerUnit,
  applyBiomarkerValue,
  chooseTest,
  chooseTestForWording,
  searchTests,
  unitOptionsFor,
} from './reviewEdits';
import type { MatchedBiomarker } from './LabReportAnalyzer';

const catalog = fixtureCatalog();

/** A result printed in words */
const ABSENT = { text: 'Assente', kind: 'boolean', value: 0 } as const;

/** A value as the analyzer gives it, the AI choosing `aiCode` when asked */
async function analyzed(name: string, unit: string, aiCode?: string, specimenHint?: string): Promise<MatchedBiomarker> {
  const value = { name, value: 5, unit, confidence: 0.9, ...(specimenHint && { specimenHint }) };
  // With no AI code, no AI to ask: the value stays the user's to decide
  const { values } = await identifyValues(catalog, [value], {
    choose: aiCode ? async (requests) => requests.map(({ id }) => ({ id, code: aiCode, confident: true })) : undefined,
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

  it('reads a renamed value printed in words as a test whose results are words, and a number typed over it as a number', async () => {
    const value = await analyzed('Zorb', 'mg/dL');
    // The fixture's glucose tests are all measured in a unit: none has results in words, so the name's own are offered
    const inWords = applyBiomarkerName({ ...value, value: 0, qualitative: ABSENT }, 'P-Glucosio', catalog);
    expect(inWords).toMatchObject({ loincCode: '2345-7', identifiedBy: 'local' });
    // Corrected to 95, the word no longer holds
    const typed = applyBiomarkerName({ ...value, value: 95, qualitative: ABSENT }, 'P-Glucosio', catalog);
    expect(typed).toMatchObject({ loincCode: '2345-7', identifiedBy: 'local' });
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

  it("lets a range in the value's unit follow a corrected unit, its numbers as printed", async () => {
    const value = await analyzed('Proteina C reattiva', 'mg/dL');
    const inValueUnit = applyBiomarkerUnit({ ...value, referenceRange: { low: 0, high: 5 } }, 'mg/L', catalog);
    expect(inValueUnit.referenceRange).toEqual({ low: 0, high: 5 });
    const oldUnit = applyBiomarkerUnit({ ...value, referenceRange: { low: 0, high: 5, unit: 'mg/dl' } }, 'mg/L', catalog);
    expect(oldUnit.referenceRange).toEqual({ low: 0, high: 5 });
    const ownUnit = applyBiomarkerUnit({ ...value, referenceRange: { low: 2.1, high: 2.6, unit: 'mmol/L' } }, 'mg/L', catalog);
    expect(ownUnit.referenceRange).toEqual({ low: 2.1, high: 2.6, unit: 'mmol/L' });
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

describe('applyBiomarkerValue', () => {
  it('reads a result in words typed over with a number again, and typed back, as printed', async () => {
    const value = await analyzed('P-Glucosio', 'mg/dL');
    // As if the analyzer had filed the word under a presence test
    const presence = { candidates: [], identifiedBy: 'local' as const, identificationFlags: [], loincCode: 'presence-test' };
    const word: MatchedBiomarker = {
      ...value,
      ...presence,
      value: 0,
      qualitative: ABSENT,
      analyzed: { name: 'P-Glucosio', unit: 'mg/dL', identification: presence },
    };
    const typed = applyBiomarkerValue(word, 95, catalog);
    expect(typed).toMatchObject({ value: 95, loincCode: '2345-7' });
    expect(applyBiomarkerValue(typed, 0, catalog).loincCode).toBe('presence-test');
    // A number edited to another number keeps its test
    expect(applyBiomarkerValue(typed, 96, catalog).loincCode).toBe('2345-7');
  });

  it('never gives a number typed over a word the test learned for the word', async () => {
    // The fixture has no test of word results: a test learned for the word stands in
    const learned = { 'glucosio|#words': '14749-6' };
    const { values } = await identifyValues(
      catalog,
      [{ name: 'Glucosio', value: 0, unit: 'mg/dL', confidence: 0.9, qualitative: ABSENT }],
      { learned }
    );
    expect(values[0]).toMatchObject({ loincCode: '14749-6', identifiedBy: 'learned' });
    const typed = applyBiomarkerValue(values[0], 95, catalog, learned);
    expect(typed.identifiedBy).not.toBe('learned');
    expect(typed.loincCode).not.toBe('14749-6');
  });

  it('keeps the test learned for a result in words when its test asks for a unit and one is given', async () => {
    const learned = { 'glucosio|#words': '15074-8' };
    const { values } = await identifyValues(catalog, [{ name: 'Glucosio', value: 0, unit: '', confidence: 0.9, qualitative: ABSENT }], {
      learned,
    });
    const withUnit = applyBiomarkerUnit(values[0], 'mmol/L', catalog, learned);
    expect(withUnit).toMatchObject({ loincCode: '15074-8', identifiedBy: 'learned' });
    // Saved, it is learned the same again
    expect(toLearn(withUnit)).toMatchObject({ key: 'glucosio|#words', code: '15074-8' });
  });

  it('keeps the test learned for a number printed with no unit when the unit review asks for is given', async () => {
    const learned = { 'glucosio|': '15074-8' };
    const { values } = await identifyValues(catalog, [{ name: 'Glucosio', value: 5, unit: '', confidence: 0.9 }], { learned });
    expect(values[0]).toMatchObject({ loincCode: '15074-8', identifiedBy: 'learned' });
    const withUnit = applyBiomarkerUnit(values[0], 'mmol/L', catalog, learned);
    expect(withUnit).toMatchObject({ loincCode: '15074-8', identifiedBy: 'learned' });
    expect(toLearn(withUnit)).toMatchObject({ key: 'glucosio|', code: '15074-8' });
  });

  it("gives back the AI's test, not one passed through, when a value printed with no unit comes back to its wording", async () => {
    // An earlier report taught the wording in mmol/L another test
    const learned = { 'glucosio|mmol/L': '14749-6', 'glucosio hdl|': '2085-9' };
    const value = await analyzed('Glucosio', '', '2345-7');
    expect(value).toMatchObject({ loincCode: '2345-7', identifiedBy: 'ai' });
    // mmol/L fits the AI's test too, which HemoIO converts: it holds
    const mistaken = applyBiomarkerUnit(value, 'mmol/L', catalog, learned);
    expect(mistaken.loincCode).toBe('2345-7');
    const cleared = applyBiomarkerUnit(mistaken, '', catalog, learned);
    expect(applyBiomarkerUnit(cleared, 'mg/dL', catalog, learned)).toMatchObject({ loincCode: '2345-7', identifiedBy: 'ai' });
    const renamed = applyBiomarkerName(value, 'Glucosio HDL', catalog, learned);
    const back = applyBiomarkerName(renamed, 'Glucosio', catalog, learned);
    expect(applyBiomarkerUnit(back, 'mg/dL', catalog, learned)).toMatchObject({ loincCode: '2345-7', identifiedBy: 'ai' });
  });

  it('keeps the learned test of a value printed with no unit through a unit typed key by key and a name corrected', async () => {
    const learned = { 'glucosio|': '15074-8' };
    const { values } = await identifyValues(catalog, [{ name: 'Glucosioo', value: 5, unit: '', confidence: 0.9 }], {
      learned: { ...learned, 'glucosioo|': '15074-8' },
    });
    let value = values[0];
    for (const unit of ['m', 'mm', 'mmo', 'mmol', 'mmol/', 'mmol/L']) value = applyBiomarkerUnit(value, unit, catalog, learned);
    expect(value).toMatchObject({ loincCode: '15074-8' });
  });

  it('learns the test a result in words is read as once given a unit, the AI picking none', async () => {
    const { values } = await identifyValues(catalog, [{ name: 'Glucosio', value: 0, unit: '', confidence: 0.9, qualitative: ABSENT }], {});
    const withUnit = applyBiomarkerUnit(values[0], 'mmol/L', catalog);
    expect(toLearn(withUnit)).toEqual({ key: 'glucosio|#words', code: '14749-6', confirmed: true });
  });

  it('reads a result in words given a unit again in it, when no test was learned for it', async () => {
    const { values } = await identifyValues(catalog, [{ name: 'Glucosio', value: 0, unit: '', confidence: 0.9, qualitative: ABSENT }], {});
    expect(values[0].loincCode).toBeUndefined();
    expect(applyBiomarkerUnit(values[0], 'mmol/L', catalog)).toMatchObject({ loincCode: '14749-6', identifiedBy: 'local' });
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

  it('never gives a choice for a number to the same wording printed in words, nor the other way', () => {
    const word = { ...undecided('Batteri (urine)', ''), value: 0, qualitative: ABSENT };
    const results = files([undecided('Batteri (urine)', '')], [word]);
    const chosen = chooseTestForWording(results, { resultIndex: 0, biomarkerIndex: 0 }, '51480-2');
    expect(chosen[1].editedBiomarkers[0].loincCode).toBeUndefined();
  });

  it('keeps a choice shared to a result in words when a unit is given for its test', async () => {
    const word = async (): Promise<MatchedBiomarker> => {
      const { values } = await identifyValues(catalog, [{ name: 'Glucosio', value: 0, unit: '', confidence: 0.9, qualitative: ABSENT }], {
        choose: async (requests) => requests.map(({ id }) => ({ id, code: '2345-7', confident: true })),
      });
      return values[0];
    };
    const results = files([await word()], [await word()]);
    const chosen = chooseTestForWording(results, { resultIndex: 0, biomarkerIndex: 0 }, '15074-8');
    const shared = chosen[1].editedBiomarkers[0];
    expect(shared).toMatchObject({ loincCode: '15074-8', identifiedBy: 'shared' });
    expect(applyBiomarkerUnit(shared, 'mmol/L', catalog)).toMatchObject({ loincCode: '15074-8', identifiedBy: 'shared' });
  });

  it('keeps a choice shared to a number printed with no unit through its unit, and lets a correction reach it', async () => {
    const unitless = async (): Promise<MatchedBiomarker> => analyzed('Glucosio', '', '2345-7');
    const results = files([await unitless()], [await unitless()]);
    let chosen = chooseTestForWording(results, { resultIndex: 0, biomarkerIndex: 0 }, '2339-0');
    // Each given its unit, key by key
    const typed = (value: MatchedBiomarker): MatchedBiomarker =>
      ['m', 'mg', 'mg/', 'mg/d', 'mg/dL'].reduce((one, unit) => applyBiomarkerUnit(one, unit, catalog), value);
    chosen = chosen.map((file) => ({ ...file, editedBiomarkers: file.editedBiomarkers.map(typed) }));
    expect(chosen[1].editedBiomarkers[0]).toMatchObject({ loincCode: '2339-0', identifiedBy: 'shared' });
    const corrected = chooseTestForWording(chosen, { resultIndex: 0, biomarkerIndex: 0 }, '2345-7');
    expect(corrected[1].editedBiomarkers[0]).toMatchObject({ loincCode: '2345-7', identifiedBy: 'shared' });
  });

  it('keeps a shared choice when the unit is cleared and the printed one chosen again', async () => {
    const analyzedIn = async (): Promise<MatchedBiomarker> => analyzed('Glucosio', 'mg/dL', '2345-7');
    const results = files([await analyzedIn()], [await analyzedIn()]);
    const shared = chooseTestForWording(results, { resultIndex: 0, biomarkerIndex: 0 }, '2339-0')[1].editedBiomarkers[0];
    const cleared = applyBiomarkerUnit(shared, '', catalog);
    expect(applyBiomarkerUnit(cleared, 'mg/dL', catalog)).toMatchObject({ loincCode: '2339-0', identifiedBy: 'shared' });
  });

  it('gives the choice to the same wording in every file', () => {
    const results = files([undecided('Ematocrito', '%')], [undecided('Ematocrito', '%'), undecided('MPV', 'fL')]);

    const chosen = chooseTestForWording(results, { resultIndex: 0, biomarkerIndex: 0 }, '4544-3');

    expect(chosen.map((file) => file.editedBiomarkers.map((value) => value.loincCode))).toEqual([
      ['4544-3'],
      ['4544-3', undefined],
    ]);
    expect(chosen[0].editedBiomarkers[0].identifiedBy).toBe('user');
    // Shared, not the user's own: a correction reaches it, and a rename reads it again
    expect(chosen[1].editedBiomarkers[0].identifiedBy).toBe('shared');
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

  it('gives a corrected choice to the values the first choice reached', () => {
    const results = files([undecided('Glucosio', 'mg/dL')], [undecided('Glucosio', 'mg/dL')]);
    const misclicked = chooseTestForWording(results, { resultIndex: 0, biomarkerIndex: 0 }, '2350-7');

    const corrected = chooseTestForWording(misclicked, { resultIndex: 0, biomarkerIndex: 0 }, '2339-0');

    expect(corrected.map((file) => file.editedBiomarkers[0].loincCode)).toEqual(['2339-0', '2339-0']);
  });

  it('reads a shared value again when it is renamed, as one the user never chose', () => {
    const results = files([undecided('Glucosio', 'mg/dL')], [undecided('Glucosio', 'mg/dL')]);
    const [, other] = chooseTestForWording(results, { resultIndex: 0, biomarkerIndex: 0 }, '2339-0');

    const renamed = applyBiomarkerName(other.editedBiomarkers[0], 'Emoglobina', catalog);

    expect(renamed.loincCode).not.toBe('2339-0');
  });

  it('never gives a choice for a row added in review to other new rows', () => {
    const results = files([{ ...ADDED }, { ...ADDED }], [{ ...ADDED }]);

    const chosen = chooseTestForWording(results, { resultIndex: 0, biomarkerIndex: 0 }, '2345-7');

    expect(chosen[0].editedBiomarkers.map((value) => value.loincCode)).toEqual(['2345-7', undefined]);
    expect(chosen[1]).toBe(results[1]);
  });

  it('changes again a value the user already chose, when it is the one chosen', () => {
    const results = files([chooseTest(undecided('Ematocrito', '%'), '20570-8')]);

    const chosen = chooseTestForWording(results, { resultIndex: 0, biomarkerIndex: 0 }, '4544-3');

    expect(chosen[0].editedBiomarkers[0].loincCode).toBe('4544-3');
  });
});
