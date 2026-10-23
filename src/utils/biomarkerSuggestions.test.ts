import { describe, it, expect } from 'vitest';
import { applyBiomarkerName, suggestBiomarkerNames, unitOptionsFor } from './biomarkerSuggestions';
import { findBiomarker } from '@data/biomarkers/dictionary';
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

  it('replaces a unit the new biomarker cannot have', () => {
    const next = applyBiomarkerName(base, 'Hemoglobin');
    expect(unitOptionsFor('Hemoglobin')).not.toContain('mg/dL');
    expect(next.unit).toBe(findBiomarker('Hemoglobin')!.canonicalUnit);
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
