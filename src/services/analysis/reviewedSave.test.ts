import { describe, it, expect } from 'vitest';
import { fixtureCatalog } from '@/test/loincFixture';
import { loadCatalog } from '@data/loinc/catalog';
import { chooseTest } from './reviewEdits';
import { toUcum } from '@services/units/ucum';
import { missingFields, planSave, unitFit, unitMisfits } from './reviewedSave';
import type { MatchedBiomarker } from './LabReportAnalyzer';

const catalog = fixtureCatalog();

/** A share of 100 of something UCUM cannot read */
const UNREADABLE_SHARE = '/100 HPF';

/** A value as the analysis gives it: its test, the printed name and unit */
function analyzed(overrides: Partial<MatchedBiomarker>): MatchedBiomarker {
  const value: MatchedBiomarker = {
    name: 'S-ALT',
    value: 30,
    unit: 'U/L',
    confidence: 0.95,
    loincCode: '1742-6',
    candidates: [{ code: '1742-6', name: 'Alanine aminotransferase', score: 1 }],
    identifiedBy: 'local',
    identificationFlags: [],
    ...overrides,
  };
  const { loincCode, candidates, identifiedBy, identificationFlags = [], savedAsUnknown } = value;
  return {
    ...value,
    analyzed: {
      name: value.name,
      unit: value.unit,
      identification: { loincCode, candidates, identifiedBy, identificationFlags, savedAsUnknown },
    },
  };
}

/** S-ALT in U/L, saved as its code */
const CODED = analyzed({});

/** S-ALT as a share UCUM cannot read, with no test chosen */
const TWIN = analyzed({
  value: 0.5,
  unit: UNREADABLE_SHARE,
  loincCode: undefined,
  identifiedBy: undefined,
  identificationFlags: ['ambiguous'],
});

function file(editedBiomarkers: MatchedBiomarker[], fileName = 'a.pdf') {
  return { fileName, editedBiomarkers };
}

function leftOut(values: MatchedBiomarker[]): MatchedBiomarker[] {
  return planSave([file(values)], catalog).notSaved.map(({ biomarker }) => biomarker);
}

it(`${UNREADABLE_SHARE} is a share UCUM cannot read`, () => {
  expect(toUcum(UNREADABLE_SHARE)).toBeNull();
});

describe('unitMisfits', () => {
  const glucose = { ...CODED, loincCode: '2345-7', unit: 'mg/dL' };

  it("says when a value's unit is not one of its test's kind", () => {
    expect(unitMisfits({ ...glucose, unit: 'U/L' }, catalog)).toBe(true);
    expect(unitMisfits({ ...glucose, unit: 'g/24h' }, catalog)).toBe(true);
  });

  it("takes the test's unit, and its molar form, as fitting", () => {
    expect(unitMisfits(glucose, catalog)).toBe(false);
    expect(unitMisfits({ ...glucose, unit: 'mmol/L' }, catalog)).toBe(false);
  });

  it('takes a ratio to creatinine in mg/mmol as fitting its mg/g test', () => {
    // 2890-2 is Protein/Creatinine [Mass Ratio] (MRto); mg/mmol reads as Ratio
    expect(unitMisfits({ ...CODED, loincCode: '2890-2', unit: 'mg/mmol' }, catalog)).toBe(false);
  });

  it("takes the units HemoIO offers a test, and LOINC's own, as fitting", async () => {
    const real = await loadCatalog();
    const misfits = (loincCode: string, unit: string): boolean => unitMisfits({ ...CODED, loincCode, unit }, real);
    // Enzymes in the Italian UI/L (ALT, AST, GGT), MCHC in %, HbA1c in mmol/mol
    for (const enzyme of ['1742-6', '1920-8', '2324-2']) expect(misfits(enzyme, 'UI/L')).toBe(false);
    expect(misfits('786-4', '%')).toBe(false);
    expect(misfits('4548-4', 'mmol/mol')).toBe(false);
    expect(misfits('20405-7', 'EU/dL')).toBe(false);
    expect(misfits('2756-5', '[pH]')).toBe(false);
    // Still a misfit: an enzyme unit for a mass concentration
    expect(misfits('2345-7', 'UI/L')).toBe(true);
  });

  it('reads the D-dimer units a unit names: FEU misfits a DDU test, and the other way round', async () => {
    const real = await loadCatalog();
    const fit = (loincCode: string, unit: string): string => unitFit({ ...CODED, loincCode, unit }, real);
    // 48065-7 is D-dimer FEU, 48066-5 D-dimer DDU, 48058-2 DDU by immunoassay
    for (const unit of ['ng/mL FEU', 'ng/mL (FEU)', 'mg/L FEU.', 'ng/mL - FEU']) {
      expect(fit('48065-7', unit)).toBe('fits');
      expect(fit('48066-5', unit)).toBe('misfits');
      expect(fit('48058-2', unit)).toBe('misfits');
    }
    expect(fit('48066-5', 'ng/mL [DDU]')).toBe('fits');
    expect(fit('48065-7', 'ng/mL DDU')).toBe('misfits');
    // No units named: the plain unit decides
    expect(fit('48065-7', 'ng/mL')).toBe('fits');
  });

  it('says nothing of a unit it cannot read, no unit, or no test', () => {
    expect(unitMisfits({ ...glucose, unit: UNREADABLE_SHARE }, catalog)).toBe(false);
    expect(unitMisfits({ ...glucose, unit: '' }, catalog)).toBe(false);
    expect(unitMisfits({ ...glucose, loincCode: undefined, unit: 'U/L' }, catalog)).toBe(false);
  });
});

describe('ratios of like quantities', () => {
  it.each(['9830-1', '1759-0', '44429-9'])('asks no unit of %s, a ratio the report printed with none', async (loincCode) => {
    const real = await loadCatalog();
    const ratio = analyzed({ name: 'Rapporto colesterolo/HDL', value: 3.6, unit: '', loincCode });
    expect(missingFields(ratio, real)).toEqual([]);
  });

  it.each(['13590-5', '54218-3'])('judges a plain ratio as fitting %s, a ratio of like quantities', async (loincCode) => {
    const real = await loadCatalog();
    expect(unitFit(analyzed({ name: 'Rapporto', value: 2.4, unit: 'ratio', loincCode }), real)).toBe('fits');
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

  it('asks no unit of a row typed in review whose test has none (an ordinal, pH, specific gravity)', async () => {
    const real = await loadCatalog();
    const typed = (loincCode: string): MatchedBiomarker => ({ ...CODED, analyzed: undefined, unit: '', loincCode });
    expect(missingFields(typed('718-7'), real)).toEqual(['unit']);
    for (const unitless of ['5802-4', '2756-5', '2965-2']) expect(missingFields(typed(unitless), real)).toEqual([]);
  });

  it('asks no unit of a value the report gave none', () => {
    const screening = analyzed({ name: 'Proteine', unit: '', loincCode: undefined, savedAsUnknown: true });
    expect(missingFields(screening)).toEqual([]);
  });

  it('asks a unit of a value the report gave none once its test is measured in one', async () => {
    const real = await loadCatalog();
    const printed = analyzed({ name: 'Glicemia', value: 90, unit: '', loincCode: undefined, identifiedBy: undefined });
    expect(missingFields(chooseTest(printed, '2345-7'), real)).toEqual(['unit']);
    // A urine pH and an ordinal have none
    expect(missingFields(chooseTest(printed, '2756-5'), real)).toEqual([]);
    expect(missingFields(chooseTest(printed, '5802-4'), real)).toEqual([]);
    expect(missingFields(chooseTest(printed, null), real)).toEqual([]);
  });
});

describe('planSave', () => {
  it('saves the files that have values and leaves out the rest', () => {
    const plan = planSave([file([CODED], 'a.pdf'), file([], 'b.pdf')], catalog);
    expect(plan.toSave.map((f) => f.fileName)).toEqual(['a.pdf']);
    expect(plan.notSaved).toEqual([]);
  });

  it('leaves out a value with no test next to the same printed name saved with a code, in a unit UCUM cannot read', () => {
    const plan = planSave([file([TWIN, CODED])], catalog);
    expect(plan.toSave[0].editedBiomarkers).toEqual([CODED]);
    expect(plan.notSaved).toEqual([{ fileName: 'a.pdf', biomarker: TWIN, reason: 'twin' }]);
  });

  it('pairs a twin only with a value of the same test, not one of its name in another sample', () => {
    expect(leftOut([{ ...TWIN, specimenHint: 'urine' }, { ...CODED, specimenHint: 'blood' }])).toEqual([]);
    expect(leftOut([{ ...TWIN, specimenHint: 'blood' }, { ...CODED, specimenHint: 'blood' }])).toHaveLength(1);
    const otherTests = { ...TWIN, candidates: [{ code: '5821-4', name: 'Leukocytes in Urine sediment', score: 0.9 }] };
    expect(leftOut([otherTests, CODED])).toEqual([]);
  });

  it('matches the printed name whatever its case or spacing', () => {
    expect(leftOut([{ ...TWIN, name: 's-alt ', analyzed: { ...TWIN.analyzed!, name: 's-alt ' } }, CODED])).toHaveLength(1);
  });

  describe('a value the user gives the test of another value of its file', () => {
    const SERUM = analyzed({ name: 'Glucosio', value: 90, unit: 'mg/dL', loincCode: '2345-7' });
    const undecided = (value: number) =>
      analyzed({
        name: 'Glucosio',
        value,
        unit: 'mmol/L',
        loincCode: undefined,
        identifiedBy: undefined,
        identificationFlags: ['ambiguous'],
      });

    it('is left out once it is the same measurement in another unit, the standard unit kept', () => {
      const molar = chooseTest(undecided(5), '14749-6');
      const plan = planSave([file([molar, SERUM])], catalog);
      expect(plan.toSave[0].editedBiomarkers).toEqual([SERUM]);
      expect(plan.notSaved).toEqual([{ fileName: 'a.pdf', biomarker: molar, reason: 'duplicate', savedAs: SERUM }]);
    });

    it("saves the value kept with the comparator of the twin left out", () => {
      const bound = { ...chooseTest(undecided(5), '14749-6'), censored: '<' as const };
      const plan = planSave([file([bound, SERUM])], catalog);
      expect(plan.toSave[0].editedBiomarkers).toEqual([{ ...SERUM, censored: '<' }]);
      expect(plan.notSaved).toEqual([
        { fileName: 'a.pdf', biomarker: bound, reason: 'duplicate', savedAs: { ...SERUM, censored: '<' } },
      ]);
    });

    it('never leaves out a bound for a measured value in its unit', () => {
      const bound = analyzed({ name: 'Glucosio', value: 90, unit: 'mg/dL', loincCode: '2345-7', censored: '<' });
      expect(leftOut([bound, SERUM])).toEqual([]);
    });

    it('is kept when it is another measurement, or still has no test', () => {
      expect(leftOut([chooseTest(undecided(8), '14749-6'), SERUM])).toEqual([]);
      expect(leftOut([undecided(5), SERUM])).toEqual([]);
    });

    it('is kept, as the analyzer keeps them, when another measurement of its test shares a printed name', () => {
      // 90 mg/dL and 5 mmol/L are one measurement, but a second "Glucosio" of
      // 120 mg/dL makes the three a conflict the user settles
      const other = analyzed({ name: 'Glucosio', value: 120, unit: 'mg/dL', loincCode: '2345-7' });
      expect(leftOut([chooseTest(undecided(5), '14749-6'), SERUM, other])).toEqual([]);
    });

    it('is left out when the other measurements of its test have names of their own', () => {
      const fasting = analyzed({ name: 'Glicemia', value: 120, unit: 'mg/dL', loincCode: '2345-7' });
      const molar = chooseTest(undecided(5), '14749-6');
      expect(leftOut([molar, SERUM, fasting])).toEqual([molar]);
    });

    it('is kept when its test is the same substance in another sample', () => {
      expect(leftOut([chooseTest(undecided(5), '15074-8'), SERUM])).toEqual([]);
    });
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
      const perDay = analyzed({ ...TWIN, unit: 'mmol/24h'});
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
