import { describe, it, expect } from 'vitest';
import { BIOMARKER_DEFINITIONS, findBiomarker } from '@data/biomarkers/dictionary';
import { unitFitsBiomarker } from '@services/units/unitFit';
import { chooseTest } from '@/utils/biomarkerSuggestions';
import { misfitTest, missingFields, planSave, targetTest } from './reviewedSave';
import type { MatchedBiomarker } from './LabReportAnalyzer';

const NRBC = findBiomarker('Nucleated Red Blood Cells')!;
const NRBC_PERCENTAGE = findBiomarker('Nucleated Red Blood Cells Percentage')!;
const SODIUM = findBiomarker('Sodium')!;

/** A unit no test in the dictionary is measured in */
const NO_TEST_UNIT = '/100 HPF';

/** A value as the analysis gives it: the AI's test, the printed name and unit */
function analyzed(overrides: Partial<MatchedBiomarker>): MatchedBiomarker {
  const value: MatchedBiomarker = {
    name: 'Eritroblasti',
    value: 0.2,
    unit: '%',
    confidence: 0.95,
    isExactMatch: false,
    normalizedUnit: '%',
    identifiedBy: 'ai',
    identificationFlags: [],
    dictionaryMatch: NRBC_PERCENTAGE,
    ...overrides,
  };
  return { ...value, analyzed: { name: value.name, unit: value.unit } };
}

/** The AI's test proposed for a value whose unit does not fit it */
function proposal(test: typeof NRBC, overrides: Partial<MatchedBiomarker>): MatchedBiomarker {
  return analyzed({
    dictionaryMatch: undefined,
    identificationFlags: ['unit-mismatch'],
    suggestedMatch: test,
    ...overrides,
  });
}

/** Eritroblasti as a share, saved as the percentage */
const SHARE = analyzed({});

/** Eritroblasti in a unit no test is measured in, proposed as the percentage */
const TWIN = proposal(NRBC_PERCENTAGE, { value: 0.5, unit: NO_TEST_UNIT, normalizedUnit: NO_TEST_UNIT });

function file(editedBiomarkers: MatchedBiomarker[], fileName = 'a.pdf') {
  return { fileName, editedBiomarkers };
}

function leftOut(values: MatchedBiomarker[]): MatchedBiomarker[] {
  return planSave([file(values)]).notSaved.map(({ biomarker }) => biomarker);
}

it(`${NO_TEST_UNIT} is a unit no test in the dictionary is measured in`, () => {
  expect(BIOMARKER_DEFINITIONS.some((test) => unitFitsBiomarker(test, NO_TEST_UNIT))).toBe(false);
});

describe('targetTest', () => {
  it('is the test chosen, or else the one proposed', () => {
    expect(targetTest(SHARE)).toBe(NRBC_PERCENTAGE);
    expect(targetTest(TWIN)).toBe(NRBC_PERCENTAGE);
  });

  it('is none for a value saved as not in the dictionary', () => {
    expect(targetTest({ ...SHARE, savedAsUnknown: true })).toBeUndefined();
  });
});

describe('missingFields', () => {
  it('asks for nothing of a complete value', () => {
    expect(missingFields(SHARE)).toEqual([]);
  });

  it('asks for a name, a number and a unit its test has', () => {
    expect(missingFields({ ...SHARE, name: '', value: undefined as unknown as number, unit: ' ' })).toEqual(
      ['name', 'value', 'unit']
    );
  });

  it('takes a number that is not a number as missing', () => {
    expect(missingFields({ ...SHARE, value: NaN })).toEqual(['value']);
  });

  it('asks no unit of an analyzed value with no test', () => {
    expect(
      missingFields({ ...SHARE, unit: '', dictionaryMatch: undefined, identificationFlags: ['not-identified'] })
    ).toEqual([]);
  });
});

describe('misfitTest', () => {
  it('names the proposed test a value is not in a unit of', () => {
    expect(misfitTest(TWIN)).toBe(NRBC_PERCENTAGE);
  });

  it('names no test for a value in a unit of its test, without a unit, or not in the dictionary', () => {
    expect(misfitTest(SHARE)).toBeUndefined();
    expect(misfitTest({ ...TWIN, unit: ' ' })).toBeUndefined();
    expect(misfitTest({ ...TWIN, savedAsUnknown: true })).toBeUndefined();
  });
});

describe('planSave', () => {
  it('saves the files that have values and leaves out the rest', () => {
    const withValues = file([SHARE]);
    const empty = file([], 'b.pdf');

    expect(planSave([withValues, empty])).toEqual({ toSave: [withValues], notSaved: [] });
  });

  it('leaves out the twin of a value saved as the same test, in a unit no test is measured in', () => {
    expect(planSave([file([TWIN, SHARE])])).toEqual({
      toSave: [file([SHARE])],
      notSaved: [{ fileName: 'a.pdf', biomarker: TWIN }],
    });
  });

  it('matches the line by its printed name, whatever its case, spacing or accent encoding', () => {
    const name = 'Eritroblastí';
    expect(
      leftOut([proposal(NRBC_PERCENTAGE, { ...TWIN, name }), analyzed({ name: ` ${name.normalize('NFC').toLowerCase()} ` })])
    ).toHaveLength(1);
  });

  it('keeps each file as it is when nothing is left out', () => {
    const reviewed = file([SHARE]);

    expect(planSave([reviewed]).toSave[0]).toBe(reviewed);
  });

  describe('still asks for a fix, leaving nothing out', () => {
    it('when the value is the only one of its line', () => {
      expect(leftOut([TWIN])).toEqual([]);
      expect(leftOut([TWIN, analyzed({ name: 'Leucociti' })])).toEqual([]);
    });

    it('when the other value of its line is saved as another test', () => {
      const count = analyzed({ value: 0.01, unit: '10^9/L', dictionaryMatch: NRBC });
      expect(leftOut([TWIN, count])).toEqual([]);
    });

    it('when its unit fits another test: it may be another measurement', () => {
      // Serum sodium and 24-hour urine sodium, both printed "Sodio"
      const serum = analyzed({ name: 'Sodio', value: 140, unit: 'mmol/L', dictionaryMatch: SODIUM });
      const urine = proposal(SODIUM, { name: 'Sodio', value: 180, unit: 'mmol/24h' });

      expect(leftOut([urine, serum])).toEqual([]);
    });

    it.each([
      ['Sodio', 180, 'mEq/24h', SODIUM, 'Sodio', 140, 'mmol/L'],
      ['Sodio', 180, 'mmol/die', SODIUM, 'Sodio', 140, 'mmol/L'],
      ['Creatinina', 1.2, 'g/die', findBiomarker('Creatinine')!, 'Creatinina', 0.9, 'mg/dL'],
      ['Leucociti', 2, '/campo', findBiomarker('White Blood Cells')!, 'Leucociti', 6.1, '10^9/L'],
    ])(
      'when its unit, %s in %s, is one no test knows: it may be another measurement',
      (name, value, unit, test, savedName, savedValue, savedUnit) => {
        const other = proposal(test, { name, value, unit, normalizedUnit: unit });
        const saved = analyzed({ name: savedName, value: savedValue, unit: savedUnit, dictionaryMatch: test });

        expect(BIOMARKER_DEFINITIONS.some((t) => unitFitsBiomarker(t, unit))).toBe(false);
        expect(unitFitsBiomarker(test, savedUnit)).toBe(true);
        expect(leftOut([other, saved])).toEqual([]);
      }
    );

    it('when the other value of its line is not complete', () => {
      expect(leftOut([TWIN, { ...SHARE, unit: '' }])).toEqual([]);
      expect(leftOut([TWIN, { ...SHARE, value: NaN }])).toEqual([]);
      expect(leftOut([TWIN, { ...TWIN }])).toEqual([]);
    });

    it('when the user chose its test', () => {
      expect(leftOut([chooseTest(TWIN, NRBC_PERCENTAGE), SHARE])).toEqual([]);
    });

    it('when the user typed the row, or changed its name or unit', () => {
      expect(leftOut([{ ...TWIN, analyzed: undefined }, SHARE])).toEqual([]);
      expect(leftOut([{ ...TWIN, name: 'Eritroblasti bis' }, SHARE])).toEqual([]);
      expect(leftOut([{ ...TWIN, unit: '/100 LPF' }, SHARE])).toEqual([]);
    });
  });
});
