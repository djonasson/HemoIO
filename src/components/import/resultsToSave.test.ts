import { describe, it, expect } from 'vitest';
import { findBiomarker } from '@data/biomarkers/dictionary';
import type { MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';
import { isSetAside, misfitTest, resultsToSave, setAsideValues } from './resultsToSave';

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

describe('misfitTest', () => {
  it('names the proposed test a value is not in a unit of', () => {
    expect(misfitTest(MISFIT)).toBe(NRBC_PERCENTAGE);
  });

  it('names no test for a value in a unit of its test, or saved as not in the dictionary', () => {
    expect(misfitTest(COUNT)).toBeUndefined();
    expect(misfitTest({ ...MISFIT, savedAsUnknown: true })).toBeUndefined();
  });
});

describe('isSetAside', () => {
  it('leaves out a value in a unit that does not fit when its line has a value that is saved', () => {
    expect(isSetAside(MISFIT, [MISFIT, COUNT])).toBe(true);
  });

  it('matches the line by its printed name, whatever its case and spacing', () => {
    expect(isSetAside(MISFIT, [MISFIT, { ...COUNT, name: ' eritroblasti ' }])).toBe(true);
  });

  it('keeps a value that is the only one of its line, so it still asks for a fix', () => {
    expect(isSetAside(MISFIT, [MISFIT])).toBe(false);
    expect(isSetAside(MISFIT, [MISFIT, { ...COUNT, name: 'Leucociti' }])).toBe(false);
  });

  it('keeps it when the other value of its line is not saved either', () => {
    expect(isSetAside(MISFIT, [MISFIT, { ...MISFIT }])).toBe(false);
  });

  it('keeps a value whose unit fits', () => {
    expect(isSetAside(COUNT, [MISFIT, COUNT])).toBe(false);
  });
});

describe('resultsToSave', () => {
  it('keeps the files that have values and leaves out the rest', () => {
    const withValues = { fileName: 'a.pdf', editedBiomarkers: [COUNT] };
    const empty = { fileName: 'b.pdf', editedBiomarkers: [] };
    expect(resultsToSave([withValues, empty])).toEqual([withValues]);
  });

  it('saves a file without the values it leaves out', () => {
    const file = { fileName: 'a.pdf', editedBiomarkers: [MISFIT, COUNT] };
    expect(resultsToSave([file])).toEqual([{ fileName: 'a.pdf', editedBiomarkers: [COUNT] }]);
  });
});

describe('setAsideValues', () => {
  it('lists the values left out with their files', () => {
    const file = { fileName: 'a.pdf', editedBiomarkers: [MISFIT, COUNT] };
    expect(setAsideValues([file])).toEqual([{ fileName: 'a.pdf', biomarker: MISFIT }]);
  });
});
