import { describe, it, expect, vi } from 'vitest';
import { fixtureCatalog } from '@/test/loincFixture';
import { loadCatalog } from '@data/loinc/catalog';
import { learnFromSaved } from '@data/loinc/learnedTests';
import { identifyLocally, identifyValues, needsChoice, toLearn, unknownKeyOf } from './identification';
import { applyBiomarkerName, chooseTest } from './reviewEdits';
import type { MatchedBiomarker } from './LabReportAnalyzer';
import type { ExtractedBiomarker, TestChoiceRequest } from '../ai';

const catalog = fixtureCatalog();

function extracted(name: string, value: number, unit: string, specimenHint?: string): ExtractedBiomarker {
  return { name, value, unit, confidence: 0.95, ...(specimenHint && { specimenHint }) };
}

describe('identifyLocally', () => {
  it('takes the one test that clearly fits, with no question', () => {
    expect(identifyLocally(catalog, { name: 'P-Glucosio', unit: 'mg/dL' })).toMatchObject({
      loincCode: '2345-7',
      identifiedBy: 'local',
      identificationFlags: [],
    });
  });

  it('leaves a value several tests fit undecided, with the tests to choose from', () => {
    // "Blood" is said loosely of serum tests too
    const identification = identifyLocally(catalog, { name: 'Glucosio', unit: 'mmol/L', specimenHint: 'blood' });
    expect(identification.loincCode).toBeUndefined();
    expect(identification.identificationFlags).toEqual(['ambiguous']);
    expect(identification.candidates.map((c) => c.code)).toEqual(['15074-8', '14749-6']);
    expect(needsChoice(identification)).toBe(true);
  });

  it("says when no name fits, with the unit's common tests to choose from", () => {
    const identification = identifyLocally(catalog, { name: 'Zorblatina', unit: 'mg/dL' });
    expect(identification.identificationFlags).toEqual(['not-identified']);
    expect(identification.candidates.map((c) => c.code)).toContain('2345-7');
    expect(needsChoice(identification)).toBe(true);
  });

  it('uses the test learned for the wording and unit', () => {
    const learned = { 'zorblatina|mg/dL': '2345-7' };
    expect(identifyLocally(catalog, { name: ' Zorblatina ', unit: 'mg/dL' }, learned)).toMatchObject({
      loincCode: '2345-7',
      identifiedBy: 'learned',
      identificationFlags: [],
    });
  });

  it('keeps a learned "Not a LOINC test" over a test that fits', () => {
    const learned = { 'p-glucosio|mg/dL': 'unknown:pglucosio' };
    const identification = identifyLocally(catalog, { name: 'P-Glucosio', unit: 'mg/dL' }, learned);
    expect(identification).toMatchObject({
      savedAsUnknown: true,
      identifiedBy: 'learned',
      identificationFlags: [],
    });
    expect(identification.loincCode).toBeUndefined();
    expect(needsChoice(identification)).toBe(false);
  });

  it('takes the common unitless test a value with no unit names, and never a Mass/volume test', async () => {
    const generated = await loadCatalog();
    expect(identifyLocally(generated, { name: 'pH', unit: '', specimenHint: 'urine' })).toMatchObject({
      loincCode: '2756-5',
      identifiedBy: 'local',
      identificationFlags: [],
    });
    expect(identifyLocally(generated, { name: 'Nitriti', unit: '', specimenHint: 'urine' }).loincCode).toBe('5802-4');
    // Reading the 13 MB catalog and building its search index take seconds on a busy machine
  }, 60_000);

  it('leaves a value with no unit that no unitless test fits to the AI or the user, among tests of any property', () => {
    const identification = identifyLocally(catalog, { name: 'P-Glucosio', unit: '' });
    expect(identification.identificationFlags).toEqual(['ambiguous', 'no-unit']);
    expect(identification.loincCode).toBeUndefined();
    expect(identification.savedAsUnknown).toBeFalsy();
    // Mass and molar codes both: the unit tells nothing apart
    expect(identification.candidates.map((c) => c.code)).toEqual(expect.arrayContaining(['2345-7', '14749-6']));
    expect(needsChoice(identification)).toBe(true);
  });

  it('asks the user about a value with no unit no test fits', () => {
    const identification = identifyLocally(catalog, { name: 'Zorblatina', unit: '' });
    expect(identification).toMatchObject({ candidates: [], identificationFlags: ['not-identified', 'no-unit'] });
    expect(identification.savedAsUnknown).toBeFalsy();
  });

  it('uses a test learned for a wording with no unit', () => {
    expect(identifyLocally(catalog, { name: 'Glucosio', unit: '' }, { 'glucosio|': '2350-7' })).toMatchObject({
      loincCode: '2350-7',
      identifiedBy: 'learned',
    });
  });

  it('reads the sample the AI names: a 24-hour urine value is another test than a serum one', () => {
    expect(identifyLocally(catalog, { name: 'Glucosio', unit: 'mg/L', specimenHint: '24h urine' }).loincCode).toBe(
      '21305-8'
    );
    expect(identifyLocally(catalog, { name: 'Glucosio', unit: 'mg/dL', specimenHint: 'serum' }).loincCode).toBe(
      '2345-7'
    );
  });
});

describe('identifyValues', () => {
  it('asks the AI once, about the values it must decide only, and takes its confident choices', async () => {
    const choose = vi.fn(async (requests: TestChoiceRequest[]) =>
      requests.map((request) => ({ id: request.id, code: '15074-8', confident: true }))
    );
    const { values, choiceFailed } = await identifyValues(
      catalog,
      [extracted('P-Glucosio', 90, 'mg/dL'), extracted('Glucosio', 5, 'mmol/L', 'blood'), extracted('Zorb', 1, '')],
      { choose }
    );

    expect(choose).toHaveBeenCalledTimes(1);
    const [requests] = choose.mock.calls[0];
    expect(requests).toEqual([
      {
        id: '1',
        name: 'Glucosio',
        unit: 'mmol/L',
        specimenHint: 'blood',
        candidates: [
          { code: '15074-8', name: 'Glucose [Moles/volume] in Blood' },
          { code: '14749-6', name: 'Glucose [Moles/volume] in Serum or Plasma' },
        ],
      },
    ]);
    expect(choiceFailed).toBe(false);
    expect(values.map((v) => [v.loincCode, v.identifiedBy])).toEqual([
      ['2345-7', 'local'],
      ['15074-8', 'ai'],
      [undefined, undefined],
    ]);
    expect(values[1].identificationFlags).toEqual([]);
    expect(values[1].analyzed).toMatchObject({ name: 'Glucosio', unit: 'mmol/L' });
  });

  it('does not ask the AI when every value is matched or has no candidate', async () => {
    const choose = vi.fn();
    await identifyValues(catalog, [extracted('P-Glucosio', 90, 'mg/dL'), extracted('Zorb', 1, '')], { choose });
    expect(choose).not.toHaveBeenCalled();
  });

  it('leaves a choice the AI is unsure of to the user, its pick first among the candidates', async () => {
    const { values } = await identifyValues(catalog, [extracted('Glucosio', 5, 'mmol/L', 'blood')], {
      choose: async ([request]) => [{ id: request.id, code: '15074-8', confident: false }],
    });
    expect(values[0].loincCode).toBeUndefined();
    expect(values[0].identificationFlags).toEqual(['ambiguous']);
    expect(values[0].candidates.map((c) => c.code)).toEqual(['15074-8', '14749-6']);
    // Marked, so the test list can say it was the AI's guess
    expect(values[0].aiPick).toBe('15074-8');
    expect(values[0].analyzed?.identification.aiPick).toBe('15074-8');
  });

  it('leaves the candidates for the user with no AI to ask', async () => {
    const { values, choiceFailed } = await identifyValues(catalog, [extracted('Glucosio', 5, 'mmol/L', 'blood')], {});
    expect(choiceFailed).toBe(false);
    expect(values[0]).toMatchObject({ identificationFlags: ['ambiguous'] });
    expect(values[0].candidates).toHaveLength(2);
  });

  it('leaves the candidates for the user when the AI cannot be asked', async () => {
    const { values, choiceFailed } = await identifyValues(catalog, [extracted('Glucosio', 5, 'mmol/L', 'blood')], {
      choose: () => Promise.reject(new Error('unreachable')),
    });
    expect(choiceFailed).toBe(true);
    expect(values[0]).toMatchObject({ identificationFlags: ['ambiguous'] });
  });
});

describe('toLearn', () => {
  async function analyzed(name: string, unit: string, aiCode?: string, hint?: string): Promise<MatchedBiomarker> {
    const { values } = await identifyValues(catalog, [extracted(name, 5, unit, hint)], {
      choose: async (requests) => requests.map(({ id }) => ({ id, code: aiCode ?? null, confident: true })),
    });
    return values[0];
  }

  it("confirms the AI's choice once it is saved, under the printed wording and unit", async () => {
    expect(toLearn(await analyzed('Glucosio', 'mmol/L', '15074-8', 'blood'))).toEqual({
      key: 'glucosio|mmol/L',
      code: '15074-8',
      confirmed: true,
    });
  });

  it('confirms the test the user chose, and "Not a LOINC test" as the unknown key of the name', async () => {
    const value = await analyzed('Glucosio', 'mmol/L');
    expect(toLearn({ ...value, loincCode: '14749-6', identifiedBy: 'user' })).toMatchObject({
      code: '14749-6',
      confirmed: true,
    });
    expect(toLearn({ ...value, identifiedBy: 'user', savedAsUnknown: true })).toMatchObject({
      code: 'unknown:glucosio',
      confirmed: true,
    });
  });

  it("confirms a choice shared from the user's choice for the same wording", async () => {
    const value = await analyzed('Glucosio', 'mmol/L');
    expect(toLearn({ ...value, loincCode: '14749-6', identifiedBy: 'shared' })).toMatchObject({ confirmed: true });
  });

  it('confirms a local match only after the user edited the value, under its printed wording', async () => {
    const value = await analyzed('P-Glucosio', 'mg/dL');
    expect(toLearn(value).confirmed).toBe(false);
    const typo = await analyzed('P-Glucozio', 'mg/dL');
    expect(toLearn({ ...typo, name: 'P-Glucosio', loincCode: '2345-7', identifiedBy: 'local' })).toEqual({
      key: 'p-glucozio|mg/dL',
      code: '2345-7',
      confirmed: true,
    });
  });

  it('confirms an edit that reaches a test through a wording learned before: a correction sticks', async () => {
    // The printed wording was once learned as the wrong test
    const learned = { 'zorb fasting|mg/dL': '2339-0', 'zorb|mg/dL': '2345-7' };
    const { values } = await identifyValues(catalog, [extracted('Zorb fasting', 1, 'mg/dL')], { learned });
    const corrected = applyBiomarkerName(values[0], 'Zorb', catalog, learned);
    expect(corrected).toMatchObject({ loincCode: '2345-7', identifiedBy: 'learned' });
    const saved = toLearn(corrected);
    expect(saved).toEqual({ key: 'zorb fasting|mg/dL', code: '2345-7', confirmed: true });

    const next = await identifyValues(catalog, [extracted('Zorb fasting', 1, 'mg/dL')], {
      learned: learnFromSaved(learned, [saved]),
    });
    expect(next.values[0].loincCode).toBe('2345-7');
  });

  it('saves a renamed "Not a LOINC test" and later imports of its wording under one key', async () => {
    const { values } = await identifyValues(catalog, [extracted('Xyz test', 3, 'mg/dL')], {});
    const first = chooseTest(applyBiomarkerName(values[0], 'Xyz', catalog), null);
    const saved = toLearn(first);
    expect(saved).toEqual({ key: 'xyz test|mg/dL', code: 'unknown:xyz', confirmed: true });

    const later = await identifyValues(catalog, [extracted('Xyz test', 3, 'mg/dL')], {
      learned: learnFromSaved({}, [saved]),
    });
    expect(later.values[0]).toMatchObject({ savedAsUnknown: true, name: 'Xyz test' });
    expect(unknownKeyOf(later.values[0])).toBe(unknownKeyOf(first));
    // Chosen again by the user, it is saved under the name they give it
    expect(unknownKeyOf(chooseTest(later.values[0], null))).toBe('unknown:xyztest');
  });

  it('does not confirm what was learned, or a value still undecided', async () => {
    expect(toLearn(await analyzed('Glucosio', '')).confirmed).toBe(false);
    const learned = await identifyValues(catalog, [extracted('Zorb', 1, 'mg/dL')], { learned: { 'zorb|mg/dL': '2339-0' } });
    expect(toLearn(learned.values[0]).confirmed).toBe(false);
  });
});
