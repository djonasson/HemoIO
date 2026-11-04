import { describe, it, expect } from 'vitest';
import { toUcum } from '@services/units/ucum';
import { missingFields, planSave, targetTest } from './reviewedSave';
import type { MatchedBiomarker } from './LabReportAnalyzer';

/** A share of 100 of something UCUM cannot read */
const UNREADABLE_SHARE = '/100 HPF';

/** A value as the analysis gives it: its test, the printed name and unit */
function analyzed(overrides: Partial<MatchedBiomarker>): MatchedBiomarker {
  const value: MatchedBiomarker = {
    name: 'S-ALT',
    value: 30,
    unit: 'U/L',
    confidence: 0.95,
    isExactMatch: true,
    normalizedUnit: 'U/L',
    loincCode: '1742-6',
    candidates: [{ code: '1742-6', name: 'Alanine aminotransferase', score: 1 }],
    identifiedBy: 'local',
    identificationFlags: [],
    ...overrides,
  };
  const { loincCode, candidates, identifiedBy, identificationFlags = [], savedAsUnknown, isExactMatch } = value;
  return {
    ...value,
    analyzed: {
      name: value.name,
      unit: value.unit,
      identification: { loincCode, candidates, identifiedBy, identificationFlags, savedAsUnknown, isExactMatch },
    },
  };
}

/** S-ALT in U/L, saved as its code */
const CODED = analyzed({});

/** S-ALT as a share UCUM cannot read, with no test chosen */
const TWIN = analyzed({
  value: 0.5,
  unit: UNREADABLE_SHARE,
  normalizedUnit: UNREADABLE_SHARE,
  loincCode: undefined,
  identifiedBy: undefined,
  identificationFlags: ['ambiguous'],
  isExactMatch: false,
});

function file(editedBiomarkers: MatchedBiomarker[], fileName = 'a.pdf') {
  return { fileName, editedBiomarkers };
}

function leftOut(values: MatchedBiomarker[]): MatchedBiomarker[] {
  return planSave([file(values)]).notSaved.map(({ biomarker }) => biomarker);
}

it(`${UNREADABLE_SHARE} is a share UCUM cannot read`, () => {
  expect(toUcum(UNREADABLE_SHARE)).toBeNull();
});

describe('targetTest', () => {
  it("is the value's LOINC code, or none", () => {
    expect(targetTest(CODED)).toBe('1742-6');
    expect(targetTest(TWIN)).toBeNull();
  });
});

describe('missingFields', () => {
  it('asks for nothing of a complete value', () => {
    expect(missingFields(CODED)).toEqual([]);
  });

  it('asks for a name and a number', () => {
    expect(missingFields({ ...CODED, name: '', value: NaN })).toEqual(['name', 'value']);
  });

  it('asks for a unit the user emptied, or of a row typed in review', () => {
    expect(missingFields({ ...CODED, unit: '' })).toEqual(['unit']);
    const typed: MatchedBiomarker = { ...CODED, analyzed: undefined, unit: '' };
    expect(missingFields(typed)).toEqual(['unit']);
  });

  it('asks no unit of a value the report gave none', () => {
    const screening = analyzed({ name: 'Proteine', unit: '', loincCode: undefined, savedAsUnknown: true });
    expect(missingFields(screening)).toEqual([]);
  });
});

describe('planSave', () => {
  it('saves the files that have values and leaves out the rest', () => {
    const plan = planSave([file([CODED], 'a.pdf'), file([], 'b.pdf')]);
    expect(plan.toSave.map((f) => f.fileName)).toEqual(['a.pdf']);
    expect(plan.notSaved).toEqual([]);
  });

  it('leaves out a value with no test next to the same printed name saved with a code, in a unit UCUM cannot read', () => {
    const plan = planSave([file([TWIN, CODED])]);
    expect(plan.toSave[0].editedBiomarkers).toEqual([CODED]);
    expect(plan.notSaved).toEqual([{ fileName: 'a.pdf', biomarker: TWIN }]);
  });

  it('matches the printed name whatever its case or spacing', () => {
    expect(leftOut([{ ...TWIN, name: 's-alt ', analyzed: { ...TWIN.analyzed!, name: 's-alt ' } }, CODED])).toHaveLength(1);
  });

  describe('still asks for a test, leaving nothing out', () => {
    it('when the value is the only one of its name', () => {
      expect(leftOut([TWIN])).toEqual([]);
    });

    it('when the other value of its name has no code either', () => {
      expect(leftOut([TWIN, { ...CODED, loincCode: undefined }])).toEqual([]);
    });

    it('when the other value of its name is not complete', () => {
      expect(leftOut([TWIN, { ...CODED, value: NaN }])).toEqual([]);
    });

    it('when its unit is one UCUM reads: it may be another measurement', () => {
      const perDay = analyzed({ ...TWIN, unit: 'mmol/24h', normalizedUnit: 'mmol/24h' });
      expect(leftOut([perDay, CODED])).toEqual([]);
    });

    it('when the user chose its test, or "Not a LOINC test"', () => {
      expect(leftOut([{ ...TWIN, identifiedBy: 'user', loincCode: '1742-6' }, CODED])).toEqual([]);
      expect(leftOut([{ ...TWIN, identifiedBy: 'user', savedAsUnknown: true }, CODED])).toEqual([]);
    });

    it('when the user typed the row, or changed its name or unit', () => {
      expect(leftOut([{ ...TWIN, analyzed: undefined }, CODED])).toEqual([]);
      expect(leftOut([{ ...TWIN, name: 'S-ALT bis' }, CODED])).toEqual([]);
      expect(leftOut([{ ...TWIN, unit: '/100 WBC' }, CODED])).toEqual([]);
    });
  });
});
