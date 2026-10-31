import { describe, it, expect } from 'vitest';
import {
  applyBiomarkerName,
  applyBiomarkerUnit,
  chooseTest,
  searchTests,
  suggestBiomarkerNames,
  unitOptionsFor,
} from './biomarkerSuggestions';
import {
  BIOMARKER_DEFINITIONS,
  findBiomarker,
  getBiomarkerByKey,
  type BiomarkerDefinition,
} from '@data/biomarkers/dictionary';
import type { MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';
import { proposedTest } from '@services/analysis/nameMatching';

const base: MatchedBiomarker = {
  name: 'Glucose',
  value: 95,
  unit: 'mg/dL',
  confidence: 0.9,
  isExactMatch: true,
  normalizedUnit: 'mg/dL',
  dictionaryMatch: findBiomarker('Glucose'),
};

describe('suggestBiomarkerNames', () => {
  it('suggests names that contain the text', () => {
    expect(suggestBiomarkerNames('cholest')).toContain('Total Cholesterol');
  });

  it('lists name matches before alias matches', () => {
    const names = suggestBiomarkerNames('hemo');
    const byAlias = names.findIndex((n) => !n.toLowerCase().includes('hemo'));
    const lastByName = names.map((n) => n.toLowerCase().includes('hemo')).lastIndexOf(true);
    expect(byAlias === -1 || byAlias > lastByName).toBe(true);
  });

  it('finds a biomarker by its alias, e.g. Italian names', () => {
    expect(suggestBiomarkerNames('Globuli Bianchi')).toContain('White Blood Cell Count');
  });

  it('suggests nothing for empty text and limits the list', () => {
    expect(suggestBiomarkerNames('  ')).toEqual([]);
    expect(suggestBiomarkerNames('e', 5)).toHaveLength(5);
  });
});

describe('searchTests', () => {
  it('lists the test a name or alias is exactly first', () => {
    for (const search of ['Urea', 'Bilirubin', 'Protein', 'Na', 'Albumin', 'Iron']) {
      expect(searchTests(search)[0]?.key).toBe(findBiomarker(search)?.key);
    }
  });

  it('lists names that start with the text before names that contain it', () => {
    const names = searchTests('urine').map((d) => d.name.toLowerCase());
    const firstContaining = names.findIndex((n) => !n.startsWith('urine'));
    expect(names.slice(firstContaining).some((n) => n.startsWith('urine'))).toBe(false);
  });

  it('lists every test for no text', () => {
    expect(searchTests(' ').length).toBe(BIOMARKER_DEFINITIONS.length);
  });
});

describe('unitOptionsFor', () => {
  it('lists the dictionary units of a known biomarker', () => {
    const def = findBiomarker('Glucose')!;
    expect(unitOptionsFor('Glucose')).toEqual([
      ...new Set([def.canonicalUnit, ...def.alternativeUnits].filter(Boolean)),
    ]);
    expect(unitOptionsFor('Not a biomarker')).toEqual([]);
  });
});

describe('applyBiomarkerName', () => {
  it('matches a dictionary name and fills an empty unit', () => {
    const empty: MatchedBiomarker = { ...base, name: '', unit: '', dictionaryMatch: undefined };
    const next = applyBiomarkerName(empty, 'Hematocrit');
    expect(next.dictionaryMatch?.name).toBe('Hematocrit');
    expect(next.isExactMatch).toBe(true);
    expect(next.unit).toBe(findBiomarker('Hematocrit')!.canonicalUnit);
    expect(next.unit).not.toBe('');
  });

  it('keeps a unit the user already typed', () => {
    expect(applyBiomarkerName({ ...base, unit: 'mmol/L' }, 'Glucose').unit).toBe('mmol/L');
  });

  it('never changes a unit the value has', () => {
    // Typing passes through prefixes that match other biomarkers ("Hb" on the
    // way to "HbA1c"): changing the unit on the way would save a wrong value
    const ifcc: MatchedBiomarker = { ...base, name: '', value: 42, unit: 'mmol/mol' };
    const typed = ['H', 'Hb', 'HbA', 'HbA1c'].reduce((b, name) => applyBiomarkerName(b, name), ifcc);
    expect(typed.unit).toBe('mmol/mol');
  });

  it('keeps the unit when the name is changed to free text', () => {
    expect(applyBiomarkerName(base, 'My own test').unit).toBe('mg/dL');
  });

  it('clears the match when the name no longer matches the dictionary', () => {
    const next = applyBiomarkerName(base, 'Glucose fasting');
    expect(next.name).toBe('Glucose fasting');
    expect(next.dictionaryMatch).toBeUndefined();
    expect(next.isExactMatch).toBe(false);
  });

  it('labels the value by its new name, not the one it was analyzed under', () => {
    const byName: MatchedBiomarker = { ...base, identifiedBy: 'name', identificationFlags: ['name-only'] };
    expect(applyBiomarkerName(byName, 'Glucose fasting')).toMatchObject({
      identifiedBy: undefined,
      identificationFlags: ['not-identified'],
    });

    const unknown: MatchedBiomarker = { ...base, name: 'Glicemia x', unit: '%', dictionaryMatch: undefined,
      suggestedMatch: findBiomarker('Glucose'), identificationFlags: ['not-identified'] };
    const named = applyBiomarkerName(unknown, 'Hematocrit');
    expect(named).toMatchObject({ identifiedBy: 'name', identificationFlags: [] });
    expect(named.suggestedMatch).toBeUndefined();
  });

  it('gives a row added in review no labels', () => {
    const manual: MatchedBiomarker = { ...base, dictionaryMatch: undefined };
    expect(applyBiomarkerName(manual, 'Hematocrit').identificationFlags).toBeUndefined();
  });
});

describe('chooseTest', () => {
  const value: MatchedBiomarker = { ...base, name: 'Creatinina', unit: 'g/24h', dictionaryMatch: undefined,
    suggestedMatch: getBiomarkerByKey('urine-creatinine'), identificationFlags: ['unit-mismatch'] };

  it('saves the value as the chosen test, picked by the user', () => {
    const chosen = chooseTest(value, getBiomarkerByKey('24-hour-urine-creatinine')!);
    expect(chosen).toMatchObject({ identifiedBy: 'user', identificationFlags: [], savedAsUnknown: false });
    expect(chosen.dictionaryMatch?.key).toBe('24-hour-urine-creatinine');
    expect(chosen.suggestedMatch).toBeUndefined();
  });

  it('saves it as not in the dictionary', () => {
    const chosen = chooseTest(value, null);
    expect(chosen.dictionaryMatch).toBeUndefined();
    expect(chosen).toMatchObject({ savedAsUnknown: true, identificationFlags: ['not-identified'] });
  });
});

describe('applyBiomarkerName with a test the AI or the user chose', () => {
  it('keeps the test', () => {
    for (const identifiedBy of ['ai', 'user'] as const) {
      const value = { ...base, unit: 'g/L', biomarkerKey: 'urine-urea', identifiedBy,
        dictionaryMatch: getBiomarkerByKey('urine-urea'), identificationFlags: [] };
      // 'Hematocrit' would match another test by name
      expect(applyBiomarkerName(value, 'Hematocrit').dictionaryMatch?.key).toBe('urine-urea');
    }
  });

  it("keeps the AI's proposal when its unit does not fit, until a unit or test is chosen", () => {
    const proposal: MatchedBiomarker = { ...base, name: 'Glicemia', unit: 'mmol/24h', dictionaryMatch: undefined,
      suggestedMatch: findBiomarker('Glucose'), biomarkerKey: 'glucose', identifiedBy: 'ai',
      identificationFlags: ['unit-mismatch'] };
    const next = applyBiomarkerName(proposal, 'Glicemia x');
    expect(proposedTest(next)?.key).toBe('glucose');
    expect(next.identificationFlags).toEqual(['unit-mismatch']);
  });

  it('keeps a value saved as not in the dictionary there, labelled so', () => {
    const unknown: MatchedBiomarker = { ...base, name: 'Zorblatina', unit: '%', dictionaryMatch: undefined,
      savedAsUnknown: true, identificationFlags: ['not-identified'] };
    const next = applyBiomarkerName(unknown, 'Hematocrit');
    expect(next).toMatchObject({ savedAsUnknown: true, identificationFlags: ['not-identified'] });
    expect(next.dictionaryMatch).toBeUndefined();
  });

  it('keeps a screening value without a unit under its own name, labelled so', () => {
    const screening: MatchedBiomarker = { ...base, name: 'Proteine (urine) ', unit: '', dictionaryMatch: undefined,
      identificationFlags: ['no-unit'] };
    const next = applyBiomarkerName(screening, 'Proteine (urine)');
    expect(next).toMatchObject({ unit: '', identificationFlags: ['no-unit'] });
    expect(next.dictionaryMatch).toBeUndefined();
  });

  it("says whether the new name suggests a test other than the AI's", () => {
    const urea: MatchedBiomarker = { ...base, name: 'BUN', unit: 'mg/dL', biomarkerKey: 'urea', identifiedBy: 'ai',
      dictionaryMatch: getBiomarkerByKey('urea'), identificationFlags: ['name-disagrees'],
      nameSuggests: getBiomarkerByKey('blood-urea-nitrogen') };
    const agreed = applyBiomarkerName(urea, 'Urea');
    expect(agreed.identificationFlags).toEqual([]);
    expect(agreed.nameSuggests).toBeUndefined();
    expect(applyBiomarkerName(agreed, 'BUN')).toMatchObject({ identificationFlags: ['name-disagrees'] });
  });

  it('reads a typed name with its unit: a count in % is its percentage', () => {
    const value: MatchedBiomarker = { ...base, name: 'x', unit: '%', dictionaryMatch: undefined,
      identificationFlags: ['not-identified'] };
    expect(applyBiomarkerName(value, 'Neutrophils').dictionaryMatch?.key).toBe('neutrophils-percentage');
  });

  it("proposes a typed test the unit does not fit, so review asks for a fitting unit", () => {
    const value: MatchedBiomarker = { ...base, name: 'x', unit: 'mmol/24h', dictionaryMatch: undefined,
      identificationFlags: ['not-identified'] };
    const next = applyBiomarkerName(value, 'Glucose');
    expect(next.dictionaryMatch).toBeUndefined();
    expect(proposedTest(next)?.key).toBe('glucose');
    expect(next.identificationFlags).toEqual(['unit-mismatch']);
    // A later keystroke reads the name again
    expect(applyBiomarkerName(next, 'Glucose fasting').identificationFlags).toEqual(['not-identified']);
  });

  it('reads a renamed value again when its unit changes: the count in % is its percentage', () => {
    const value: MatchedBiomarker = { ...base, name: 'x', unit: '10^9/L', dictionaryMatch: undefined,
      identificationFlags: ['not-identified'] };
    const typed = applyBiomarkerName(value, 'Neutrophils');
    expect(typed.dictionaryMatch?.key).toBe('neutrophils');
    expect(applyBiomarkerUnit(typed, '%').dictionaryMatch?.key).toBe('neutrophils-percentage');
  });

  it('keeps the test of a value not renamed when its unit changes', () => {
    // A learned alias or the matching model chose it, which the name alone may not give
    const value: MatchedBiomarker = { ...base, name: 'Zorb', identifiedBy: 'model',
      analyzed: { name: 'Zorb', unit: 'mg/dL', modelMatch: findBiomarker('Glucose') },
      identificationFlags: ['similar-name'] };
    expect(applyBiomarkerUnit(value, 'mmol/L').dictionaryMatch?.key).toBe('glucose');
  });

  it('never takes a variation of a name as the test: HDL is not total cholesterol', () => {
    const analyzed: MatchedBiomarker = { ...base, name: 'x', dictionaryMatch: undefined,
      identificationFlags: ['not-identified'] };
    const renamed = applyBiomarkerName(analyzed, 'Cholesterol (HDL)');
    expect(renamed.dictionaryMatch).toBeUndefined();
    expect(renamed.identificationFlags).toEqual(['not-identified']);
    const added: MatchedBiomarker = { ...base, name: '', unit: 'mg/dL', dictionaryMatch: undefined };
    expect(applyBiomarkerName(added, 'Cholesterol (HDL)').dictionaryMatch).toBeUndefined();
  });

  it("gives a row added in review the unit of the name finally typed, not of a name on the way", () => {
    const added: MatchedBiomarker = { ...base, name: '', unit: '', dictionaryMatch: undefined };
    const typed = ['U', 'Ur', 'Ure', 'Urea', 'Urea ', 'Urea 2', 'Urea 24', 'Urea 24h'].reduce(
      (b, name) => applyBiomarkerName(b, name),
      added
    );
    expect(typed.dictionaryMatch?.key).toBe('24-hour-urine-urea');
    expect(typed.unit).toBe(getBiomarkerByKey('24-hour-urine-urea')!.canonicalUnit);
    // A unit the user chose is kept
    const chosen = applyBiomarkerUnit(applyBiomarkerName(added, 'Urea'), 'mmol/L');
    expect(applyBiomarkerName(chosen, 'Urea 24h').unit).toBe('mmol/L');
  });

  it('identifies a screening value once it has a unit, in either order', () => {
    const screening: MatchedBiomarker = { ...base, name: 'Proteine (urine)', unit: '', dictionaryMatch: undefined,
      identificationFlags: ['no-unit'] };
    const unitFirst = applyBiomarkerName(applyBiomarkerUnit(screening, 'mg/dL'), 'Urine Protein');
    const nameFirst = applyBiomarkerUnit(applyBiomarkerName(screening, 'Urine Protein'), 'mg/dL');
    for (const value of [unitFirst, nameFirst]) {
      expect(value.dictionaryMatch?.key).toBe('urine-protein');
      expect(value.identificationFlags).toEqual([]);
    }
  });

  it("keeps saying a learned name suggests another test than the AI's when the name is edited", () => {
    const learned = (name: string) => (name === 'Zorb' ? getBiomarkerByKey('urine-urea') : undefined);
    const value: MatchedBiomarker = { ...base, name: 'Zorb', unit: 'g/L', biomarkerKey: 'urine-protein',
      identifiedBy: 'ai', dictionaryMatch: getBiomarkerByKey('urine-protein'), identificationFlags: ['name-disagrees'],
      nameSuggests: getBiomarkerByKey('urine-urea') };
    const edited = applyBiomarkerName(applyBiomarkerName(value, 'Zorbx', learned), 'Zorb', learned);
    expect(edited.identificationFlags).toEqual(['name-disagrees']);
    expect(edited.nameSuggests?.key).toBe('urine-urea');
  });

  it('lets the unit of a row added in review be emptied and chosen again', () => {
    const added: MatchedBiomarker = { ...base, name: '', unit: '', dictionaryMatch: undefined };
    const glucose = applyBiomarkerName(added, 'Glucose');
    expect(glucose.unit).toBe('mg/dL');
    const emptied = applyBiomarkerUnit(glucose, '');
    expect(emptied.unit).toBe('');
    expect(applyBiomarkerUnit(emptied, 'mmol/L').unit).toBe('mmol/L');
    // A unit chosen before the name is kept when it is emptied again later
    const chosenFirst = applyBiomarkerName(applyBiomarkerUnit(added, 'mmol/L'), 'Glucose');
    expect(applyBiomarkerUnit(chosenFirst, '').unit).toBe('');
  });

  it('keeps the test of an identified value whose unit is emptied, so review asks for one', () => {
    const keyed: MatchedBiomarker = { ...base, name: 'Zuccheri', biomarkerKey: 'glucose', identifiedBy: 'ai',
      analyzed: { name: 'Zuccheri', unit: 'mg/dL' }, identificationFlags: [] };
    const emptied = applyBiomarkerUnit(keyed, '');
    expect(emptied.dictionaryMatch?.key).toBe('glucose');
    expect(emptied.identificationFlags).toEqual([]);
  });

  it("proposes the matching model's test when a new unit does not fit it", () => {
    const value: MatchedBiomarker = { ...base, name: 'Zorb urinaria', unit: 'g/L', identifiedBy: 'model',
      dictionaryMatch: getBiomarkerByKey('urine-urea'),
      analyzed: { name: 'Zorb urinaria', unit: 'g/L', modelMatch: getBiomarkerByKey('urine-urea') },
      identificationFlags: ['similar-name'] };
    expect(applyBiomarkerUnit(value, 'mmol/L').dictionaryMatch?.key).toBe('urine-urea');
    const unfit = applyBiomarkerUnit(value, '10^9/L');
    expect(unfit.dictionaryMatch).toBeUndefined();
    expect(proposedTest(unfit)?.key).toBe('urine-urea');
  });

  it("reads a typed name with the user's learned names", () => {
    const learned = (name: string) => (name === 'Zorblatina (urine)' ? getBiomarkerByKey('urine-urea') : undefined);
    const misread: MatchedBiomarker = { ...base, name: 'Zorblatlna (urine)', unit: 'g/L', dictionaryMatch: undefined,
      identificationFlags: ['not-identified'] };
    const fixed = applyBiomarkerName(misread, 'Zorblatina (urine)', learned);
    expect(fixed.dictionaryMatch?.key).toBe('urine-urea');
    expect(fixed.identificationFlags).toEqual([]);
  });

  it("reads a learned name's test again when the unit changes, not the previous test", () => {
    const learned = (name: string) => (name === 'Zorb' ? getBiomarkerByKey('urine-urea') : undefined);
    const value: MatchedBiomarker = { ...base, name: 'Zorb', unit: 'g/L', identifiedBy: 'name',
      dictionaryMatch: getBiomarkerByKey('urine-urea'), identificationFlags: ['name-only'] };
    expect(applyBiomarkerUnit(value, 'g/24h', learned).dictionaryMatch?.key).toBe('24-hour-urine-urea');
  });

  it('still re-matches a value matched by name', () => {
    const value = { ...base, identifiedBy: 'name' as const };
    expect(applyBiomarkerName(value, 'Hematocrit').dictionaryMatch?.name).toBe('Hematocrit');
  });
});

describe('applyBiomarkerUnit', () => {
  const proposal: MatchedBiomarker = {
    ...base,
    name: 'Glicemia',
    unit: 'mmol/24h',
    dictionaryMatch: undefined,
    suggestedMatch: findBiomarker('Glucose'),
    biomarkerKey: 'glucose',
    identifiedBy: 'ai',
    identificationFlags: ['unit-mismatch'],
  };

  it("makes the AI's proposed test the value's test once its unit fits", () => {
    const next = applyBiomarkerUnit(proposal, 'mg/dL');
    expect(next).toMatchObject({ unit: 'mg/dL', identifiedBy: 'ai', identificationFlags: [] });
    expect(next.dictionaryMatch?.key).toBe('glucose');
    expect(proposedTest(next)).toBeUndefined();
  });

  it("reads the AI's key in the new unit, with the name's labels for that unit", () => {
    // Keyed as the percentage in 10^9/L: proposed, and the name suggests the count
    const count = applyBiomarkerUnit(
      { ...base, name: 'Neutrophils', unit: '%', biomarkerKey: 'neutrophils-percentage', identifiedBy: 'ai',
        dictionaryMatch: getBiomarkerByKey('neutrophils-percentage'), identificationFlags: [] },
      '10^9/L'
    );
    expect(count).toMatchObject({ identificationFlags: ['unit-mismatch', 'name-disagrees'] });
    expect(count.nameSuggests?.key).toBe('neutrophils');
    const share = applyBiomarkerUnit(count, '%');
    expect(share.dictionaryMatch?.key).toBe('neutrophils-percentage');
    expect(share.identificationFlags).toEqual([]);
    expect(share.nameSuggests).toBeUndefined();
  });

  it('identifies a value nothing identified once its unit fits the test its name is', () => {
    const value: MatchedBiomarker = { ...base, unit: 'mmol/24h', dictionaryMatch: undefined,
      suggestedMatch: findBiomarker('Glucose'), identificationFlags: ['not-identified'] };
    const next = applyBiomarkerUnit(value, 'mmol/L');
    expect(next.dictionaryMatch?.key).toBe('glucose');
    expect(next.identificationFlags).toEqual(['name-only']);
  });

  it('only changes the unit otherwise', () => {
    const next = applyBiomarkerUnit(proposal, 'U/L');
    expect(next.unit).toBe('U/L');
    expect(proposedTest(next)?.key).toBe('glucose');
  });
});

describe('editing in review one keystroke at a time', () => {
  /** Backspace the unit to nothing, then type `unit` letter by letter */
  const retypeUnit = (value: MatchedBiomarker, unit: string, learned?: (name: string) => BiomarkerDefinition | undefined) => {
    const erasing = [...value.unit].map((_, i) => value.unit.slice(0, value.unit.length - i - 1));
    const typing = [...unit].map((_, i) => unit.slice(0, i + 1));
    return [...erasing, ...typing].reduce((b, u) => applyBiomarkerUnit(b, u, learned), value);
  };

  it("keeps the matching model's test through a unit retyped to one that fits", () => {
    const value: MatchedBiomarker = { ...base, name: 'Zorb urinaria', unit: 'g/L', identifiedBy: 'model',
      dictionaryMatch: getBiomarkerByKey('urine-urea'),
      analyzed: { name: 'Zorb urinaria', unit: 'g/L', modelMatch: getBiomarkerByKey('urine-urea') },
      identificationFlags: ['similar-name'] };
    const retyped = retypeUnit(value, 'mmol/L');
    expect(retyped.dictionaryMatch?.key).toBe('urine-urea');
    expect(retyped.identificationFlags).toEqual(['similar-name']);
  });

  it('keeps a test matched by name through a unit backspaced away, and asks for a unit', () => {
    const value: MatchedBiomarker = { ...base, identifiedBy: 'name', analyzed: { name: 'Glucose', unit: 'mg/dL' },
      identificationFlags: ['name-only'] };
    const emptied = retypeUnit(value, '');
    expect(emptied.dictionaryMatch?.key).toBe('glucose');
    expect(emptied.identificationFlags).not.toContain('no-unit');
  });

  it("keeps the AI's test when the name is edited after the unit was emptied", () => {
    const value: MatchedBiomarker = { ...base, name: 'Glicemia', biomarkerKey: 'glucose', identifiedBy: 'ai',
      analyzed: { name: 'Glicemia', unit: 'mg/dL' }, identificationFlags: [] };
    const renamed = applyBiomarkerName(applyBiomarkerUnit(value, ''), 'Glicemiax');
    expect(renamed.dictionaryMatch?.key).toBe('glucose');
    expect(renamed.identificationFlags).not.toContain('no-unit');
  });

  it('gives a screening value its "No unit in report" back when a typed unit is deleted', () => {
    const screening: MatchedBiomarker = { ...base, name: 'Proteine (urine)', unit: '', biomarkerKey: 'urine-protein',
      dictionaryMatch: undefined, analyzed: { name: 'Proteine (urine)', unit: '' }, identificationFlags: ['no-unit'] };
    const back = applyBiomarkerUnit(applyBiomarkerUnit(screening, 'm'), '');
    expect(back.identificationFlags).toEqual(['no-unit']);
  });

  it('saves a urinalysis value under its test once a stray unit is cleared', () => {
    const ph: MatchedBiomarker = { ...base, name: 'pH (urine)', value: 6, unit: 'pH', biomarkerKey: 'urine-ph',
      identifiedBy: 'ai', dictionaryMatch: undefined, suggestedMatch: getBiomarkerByKey('urine-ph'),
      analyzed: { name: 'pH (urine)', unit: 'pH' }, identificationFlags: ['unit-mismatch'] };
    const cleared = retypeUnit(ph, '');
    expect(cleared.dictionaryMatch?.key).toBe('urine-ph');
  });

  it('keeps a percentage a percentage when its unit is emptied', () => {
    const share: MatchedBiomarker = { ...base, name: 'Neutrofili', value: 42, unit: '%', biomarkerKey: 'neutrophils',
      identifiedBy: 'ai', analyzed: { name: 'Neutrofili', unit: '%' }, identificationFlags: [] };
    expect(applyBiomarkerUnit(share, '').dictionaryMatch?.key).toBe('neutrophils-percentage');
  });

  it("keeps a learned name's test when the unit is emptied", () => {
    const learned = (name: string) => (name === 'Zorblatina (urine)' ? getBiomarkerByKey('urine-urea') : undefined);
    const value: MatchedBiomarker = { ...base, name: 'Zorblatina (urine)', unit: 'g/L', identifiedBy: 'name',
      dictionaryMatch: getBiomarkerByKey('urine-urea'), analyzed: { name: 'Zorblatina (urine)', unit: 'g/L' },
      identificationFlags: ['name-only'] };
    expect(retypeUnit(value, '', learned).dictionaryMatch?.key).toBe('urine-urea');
  });

  it("gives the matching model's test back when a name typo is undone", () => {
    const value: MatchedBiomarker = { ...base, name: 'Zorb', identifiedBy: 'model',
      analyzed: { name: 'Zorb', unit: 'mg/dL', modelMatch: findBiomarker('Glucose') }, identificationFlags: ['similar-name'] };
    const undone = applyBiomarkerName(applyBiomarkerName(value, 'Zorbx'), 'Zorb');
    expect(undone.dictionaryMatch?.key).toBe('glucose');
    expect(undone.identificationFlags).toEqual(['similar-name']);
  });

  it("prefers a learned name to the matching model's test, as the analyzer does, once the unit fits it", () => {
    const learned = (name: string) => (name === 'Zorb' ? getBiomarkerByKey('urine-urea') : undefined);
    const value: MatchedBiomarker = { ...base, name: 'Zorb', unit: '10^9/L', identifiedBy: 'model',
      dictionaryMatch: getBiomarkerByKey('white-blood-cell-count'),
      analyzed: { name: 'Zorb', unit: '10^9/L', modelMatch: getBiomarkerByKey('white-blood-cell-count') },
      identificationFlags: ['similar-name'] };
    expect(retypeUnit(value, 'g/L', learned).dictionaryMatch?.key).toBe('urine-urea');
  });
  it('treats a name edited only in case or spacing as the printed name', () => {
    const value: MatchedBiomarker = { ...base, name: 'Zorb', identifiedBy: 'model',
      analyzed: { name: 'Zorb', unit: 'mg/dL', modelMatch: findBiomarker('Glucose') }, identificationFlags: ['similar-name'] };
    for (const name of ['ZORB', 'Zorb ', 'zorb']) {
      expect(applyBiomarkerName(value, name).dictionaryMatch?.key, name).toBe('glucose');
    }
  });
  it('reads a name edited only in inner spacing or accent encoding as the printed name', () => {
    const printed = 'Velocità  di filtrazione'.normalize('NFD');
    const value: MatchedBiomarker = { ...base, name: printed, identifiedBy: 'model',
      analyzed: { name: printed, unit: 'mg/dL', modelMatch: findBiomarker('Glucose') }, identificationFlags: ['similar-name'] };
    for (const name of ['Velocità di filtrazione'.normalize('NFC'), 'velocità   di filtrazione'.normalize('NFD')]) {
      expect(applyBiomarkerName(value, name).dictionaryMatch?.key, name).toBe('glucose');
    }
    const byName: MatchedBiomarker = { ...base, name: 'Globuli rossi', unit: '10^6/µL', identifiedBy: 'name',
      analyzed: { name: 'Globuli rossi', unit: '10^6/µL' }, identificationFlags: [] };
    const decomposed = 'Créatinine'.normalize('NFD');
    const printedNfd: MatchedBiomarker = { ...base, name: decomposed, unit: 'mg/dL', identifiedBy: 'name',
      analyzed: { name: decomposed, unit: 'mg/dL' }, identificationFlags: [] };
    expect(applyBiomarkerName(printedNfd, 'Créatinine'.normalize('NFC')).dictionaryMatch?.key).toBe('creatinine');
    const edited = applyBiomarkerName(byName, 'Globuli  rossi');
    expect(edited.dictionaryMatch?.key).toBe('red-blood-cell-count');
    expect(edited.name).toBe('Globuli  rossi');
  });
});

describe('a row added in review', () => {
  it("reads the user's learned names", () => {
    const learned = (name: string) => (name === 'Zorblatina (urine)' ? getBiomarkerByKey('urine-urea') : undefined);
    const added: MatchedBiomarker = { ...base, name: '', unit: '', dictionaryMatch: undefined };
    const typed = applyBiomarkerName(added, 'Zorblatina (urine)', learned);
    expect(typed.dictionaryMatch?.key).toBe('urine-urea');
    expect(typed.unit).toBe(getBiomarkerByKey('urine-urea')!.canonicalUnit);
  });

});

