import { describe, it, expect } from 'vitest';
import { findBiomarker } from '@data/biomarkers/dictionary';
import type { MatchedBiomarker } from './LabReportAnalyzer';
import { hasNameAndValue, misfitTest, planSave, targetTest } from './reviewedSave';

const NRBC = findBiomarker('Nucleated Red Blood Cells')!;
const NRBC_PERCENTAGE = findBiomarker('Nucleated Red Blood Cells Percentage')!;

function value(overrides: Partial<MatchedBiomarker>): MatchedBiomarker {
  return {
    name: 'Eritroblasti',
    value: 0,
    unit: '10^9/L',
    confidence: 0.95,
    isExactMatch: false,
    normalizedUnit: '10^9/L',
    ...overrides,
  };
}

/** Eritroblasti as a count, saved as Nucleated Red Blood Cells */
const COUNT = value({ dictionaryMatch: NRBC });

/** Eritroblasti in a unit no test is measured in, proposed as the percentage */
const MISFIT = value({
  unit: '/100 HPF',
  normalizedUnit: '/100 HPF',
  identificationFlags: ['unit-mismatch'],
  suggestedMatch: NRBC_PERCENTAGE,
});

function file(editedBiomarkers: MatchedBiomarker[], fileName = 'a.pdf') {
  return { fileName, editedBiomarkers };
}

describe('targetTest', () => {
  it('is the test chosen, or else the one proposed', () => {
    expect(targetTest(COUNT)).toBe(NRBC);
    expect(targetTest(MISFIT)).toBe(NRBC_PERCENTAGE);
  });

  it('is none for a value saved as not in the dictionary', () => {
    expect(targetTest({ ...COUNT, savedAsUnknown: true })).toBeUndefined();
  });
});

describe('hasNameAndValue', () => {
  it('needs both a name and a number', () => {
    expect(hasNameAndValue(COUNT)).toBe(true);
    expect(hasNameAndValue({ ...COUNT, name: '' })).toBe(false);
    expect(hasNameAndValue({ ...COUNT, value: undefined as unknown as number })).toBe(false);
  });
});

describe('misfitTest', () => {
  it('names the proposed test a value is not in a unit of', () => {
    expect(misfitTest(MISFIT)).toBe(NRBC_PERCENTAGE);
  });

  it('names no test for a value in a unit of its test, without a unit, or not in the dictionary', () => {
    expect(misfitTest(COUNT)).toBeUndefined();
    expect(misfitTest({ ...MISFIT, unit: ' ' })).toBeUndefined();
    expect(misfitTest({ ...MISFIT, savedAsUnknown: true })).toBeUndefined();
  });
});

describe('planSave', () => {
  it('saves the files that have values and leaves out the rest', () => {
    const withValues = file([COUNT]);
    const empty = file([], 'b.pdf');

    expect(planSave([withValues, empty])).toEqual({ toSave: [withValues], notSaved: [] });
  });

  it('leaves out a value in a unit that does not fit when its line has a value that is saved', () => {
    expect(planSave([file([MISFIT, COUNT])])).toEqual({
      toSave: [file([COUNT])],
      notSaved: [{ fileName: 'a.pdf', biomarker: MISFIT }],
    });
  });

  it('matches the line by its printed name, whatever its case, spacing or accent encoding', () => {
    const accented = { ...MISFIT, name: 'Eritroblastí' };
    const sameLine = { ...COUNT, name: ' eritroblastí '.normalize('NFC') };

    expect(planSave([file([accented, sameLine])]).notSaved).toHaveLength(1);
  });

  it('keeps a value that is the only one of its line, so it still asks for a fix', () => {
    expect(planSave([file([MISFIT])]).notSaved).toEqual([]);
    expect(planSave([file([MISFIT, { ...COUNT, name: 'Leucociti' }])]).notSaved).toEqual([]);
  });

  it('keeps it when no other value of its line is saved', () => {
    expect(planSave([file([MISFIT, { ...MISFIT }])]).notSaved).toEqual([]);
    expect(planSave([file([MISFIT, { ...COUNT, value: null as unknown as number }])]).notSaved).toEqual([]);
  });

  it('keeps each file as it is when nothing is left out', () => {
    const reviewed = file([COUNT]);

    expect(planSave([reviewed]).toSave[0]).toBe(reviewed);
  });
});
