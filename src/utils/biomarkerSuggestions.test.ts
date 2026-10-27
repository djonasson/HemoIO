import { describe, it, expect } from 'vitest';
import {
  applyBiomarkerName,
  applyBiomarkerUnit,
  chooseTest,
  proposedTest,
  suggestBiomarkerNames,
  unitFitsBiomarker,
  unitOptionsFor,
} from './biomarkerSuggestions';
import { findBiomarker, getBiomarkerByKey } from '@data/biomarkers/dictionary';
import type { MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';

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

  it('never changes a unit the value has, and marks the value as renamed', () => {
    // Typing passes through prefixes that match other biomarkers ("Hb" on the
    // way to "HbA1c"): changing the unit on the way would save a wrong value
    const ifcc: MatchedBiomarker = { ...base, name: '', value: 42, unit: 'mmol/mol' };
    const typed = ['H', 'Hb', 'HbA', 'HbA1c'].reduce(applyBiomarkerName, ifcc);
    expect(typed.unit).toBe('mmol/mol');
    expect(typed.renamedInReview).toBe(true);
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
});

describe('unitFitsBiomarker', () => {
  it('accepts the units the dictionary lists and units that convert', () => {
    expect(unitFitsBiomarker(findBiomarker('Hemoglobin A1c')!, 'mmol/mol')).toBe(true);
    expect(unitFitsBiomarker(findBiomarker('Glucose')!, 'MMOL/L')).toBe(true);
  });

  it('accepts Greek mu and "u" for micro', () => {
    expect(unitFitsBiomarker(findBiomarker('Creatinine')!, '\u03bcmol/L')).toBe(true);
    expect(unitFitsBiomarker(findBiomarker('Creatinine')!, 'umol/L')).toBe(true);
  });

  it('rejects a unit the biomarker cannot be measured in', () => {
    expect(unitFitsBiomarker(findBiomarker('Hemoglobin A1c')!, 'g/dL')).toBe(false);
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
      const value = { ...base, identifiedBy, dictionaryMatch: getBiomarkerByKey('urine-urea') };
      // 'Hematocrit' would match another test by name
      expect(applyBiomarkerName(value, 'Hematocrit').dictionaryMatch?.key).toBe('urine-urea');
    }
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
    identificationFlags: ['unit-mismatch'],
  };

  it("makes the AI's proposed test the value's test once its unit fits", () => {
    const next = applyBiomarkerUnit(proposal, 'mg/dL');
    expect(next).toMatchObject({ unit: 'mg/dL', identifiedBy: 'ai', identificationFlags: [] });
    expect(next.dictionaryMatch?.key).toBe('glucose');
    expect(proposedTest(next)).toBeUndefined();
  });

  it('only changes the unit otherwise', () => {
    expect(applyBiomarkerUnit(proposal, 'U/L')).toEqual({ ...proposal, unit: 'U/L' });
    expect(proposedTest(proposal)?.key).toBe('glucose');
  });
});
