import { describe, it, expect } from 'vitest';
import {
  normalizeUnitForLookup,
  unitsMatch,
  UNIT_CONVERSIONS,
  findConversionDefinition,
  getConversion,
  getConversionFactor,
} from './definitions';

describe('Unit Conversion Definitions', () => {
  describe('UNIT_CONVERSIONS', () => {
    it('keys conversions by LOINC component', () => {
      const glucose = UNIT_CONVERSIONS.find((c) => c.component === 'Glucose');
      expect(glucose?.conversions).toContainEqual(
        expect.objectContaining({ from: 'mg/dL', to: 'mmol/L' })
      );
      const hemoglobin = UNIT_CONVERSIONS.find((c) => c.component === 'Hemoglobin');
      expect(hemoglobin?.conversions).toContainEqual(
        expect.objectContaining({ from: 'g/dL', to: 'g/L' })
      );
    });

    it('has one entry per substance, whatever the sample', () => {
      const components = UNIT_CONVERSIONS.map((c) => c.component);
      expect(new Set(components).size).toBe(components.length);
      // Serum, urine and 24-hour urine creatinine share one entry
      const creatinine = UNIT_CONVERSIONS.find((c) => c.component === 'Creatinine');
      expect(creatinine?.conversions).toContainEqual(
        expect.objectContaining({ from: 'mg/dL', to: 'µmol/L' })
      );
      expect(creatinine?.conversions).toContainEqual(
        expect.objectContaining({ from: 'g/24h', to: 'mmol/24h' })
      );
    });

    it('all conversions have valid factor', () => {
      for (const def of UNIT_CONVERSIONS) {
        for (const conv of def.conversions) {
          expect(typeof conv.factor).toBe('number');
          expect(conv.factor).toBeGreaterThan(0);
          expect(Number.isFinite(conv.factor)).toBe(true);
        }
      }
    });
  });

  describe('findConversionDefinition', () => {
    it('finds by LOINC component, in any case and spacing', () => {
      expect(findConversionDefinition('Glucose')?.component).toBe('Glucose');
      expect(findConversionDefinition('glucose')?.component).toBe('Glucose');
      expect(findConversionDefinition('  Glucose  ')?.component).toBe('Glucose');
    });

    it('uses the substance for a component with a subpart', () => {
      expect(findConversionDefinition('Cholesterol.in LDL')?.component).toBe('Cholesterol');
      expect(findConversionDefinition('Glucose^2H post 75 g glucose PO')?.component).toBe('Glucose');
    });

    it('prefers a subpart that has its own conversions', () => {
      expect(findConversionDefinition('Thyroxine.free')?.component).toBe('Thyroxine.free');
    });

    it('never gives a ratio the conversions of one of its parts', () => {
      expect(findConversionDefinition('Albumin/Creatinine')?.component).toBe('Albumin/Creatinine');
      expect(findConversionDefinition('Spermatozoa.motile/Spermatozoa')).toBeUndefined();
    });

    it('does not match old dictionary names', () => {
      expect(findConversionDefinition('Blood Sugar')).toBeUndefined();
      expect(findConversionDefinition('Urine Creatinine')).toBeUndefined();
    });

    it('returns undefined for an unknown component', () => {
      expect(findConversionDefinition('Unknown Biomarker XYZ')).toBeUndefined();
    });

    it('keys a generic component by its property too', () => {
      // MCV is "Observation", which also names appearance, colour and specific gravity
      const mcv = { component: 'Observation', property: 'EntMeanVol', system: 'RBC' };
      expect(findConversionDefinition(mcv)?.component).toBe('Observation');
      expect(findConversionDefinition({ ...mcv, property: 'SpGrav' })).toBeUndefined();
      expect(findConversionDefinition('Observation')).toBeUndefined();
      // ESR is "Erythrocyte", as is red cell distribution width
      const esr = { component: 'Erythrocyte', property: 'Sedimentation Rate', system: 'Bld' };
      expect(getConversionFactor(esr, 'mm/hr', 'mm/h')).toBe(1);
      expect(getConversionFactor({ ...esr, property: 'DistWidth' }, 'mm/hr', 'mm/h')).toBeUndefined();
    });

    it('converts albumin mg/L to µg/min only for urine', () => {
      const urine = { component: 'Albumin', property: 'MCnc', system: 'Urine' };
      expect(getConversionFactor(urine, 'mg/L', 'µg/min')).toBeCloseTo(1.04);
      expect(getConversionFactor({ ...urine, system: 'Ser/Plas' }, 'mg/L', 'µg/min')).toBeUndefined();
      expect(getConversionFactor('Albumin', 'mg/L', 'µg/min')).toBeUndefined();
      // The rest of albumin's conversions hold for every sample
      expect(getConversionFactor({ ...urine, system: 'Ser/Plas' }, 'g/dL', 'g/L')).toBe(10);
    });
  });

  describe('getConversionFactor', () => {
    it('returns correct factor for glucose mg/dL to mmol/L', () => {
      const factor = getConversionFactor('Glucose', 'mg/dL', 'mmol/L');
      expect(factor).toBeCloseTo(0.0555, 4);
    });

    it('returns correct factor for glucose mmol/L to mg/dL', () => {
      const factor = getConversionFactor('Glucose', 'mmol/L', 'mg/dL');
      expect(factor).toBeCloseTo(18.018, 2);
    });

    it('returns correct factor for creatinine mg/dL to µmol/L', () => {
      const factor = getConversionFactor('Creatinine', 'mg/dL', 'µmol/L');
      expect(factor).toBeCloseTo(88.4, 1);
    });

    it('returns 1 for same unit', () => {
      const factor = getConversionFactor('Glucose', 'mg/dL', 'mg/dL');
      expect(factor).toBe(1);
    });

    it('handles case-insensitive unit comparison for same unit', () => {
      const factor = getConversionFactor('Glucose', 'mg/dL', 'MG/DL');
      expect(factor).toBe(1);
    });

    it('normalizes ASCII u to µ', () => {
      const factor = getConversionFactor('Creatinine', 'mg/dL', 'umol/L');
      expect(factor).toBeCloseTo(88.4, 1);
    });

    it('normalizes lowercase units', () => {
      const factor = getConversionFactor('Glucose', 'mg/dl', 'mmol/l');
      expect(factor).toBeCloseTo(0.0555, 4);
    });

    it('returns undefined for unknown biomarker', () => {
      const factor = getConversionFactor('Unknown', 'mg/dL', 'mmol/L');
      expect(factor).toBeUndefined();
    });

    it('returns undefined for unsupported unit conversion', () => {
      const factor = getConversionFactor('Glucose', 'mg/dL', 'stones');
      expect(factor).toBeUndefined();
    });

    it('converts urine creatinine units under the one creatinine entry', () => {
      const factor = getConversionFactor('Creatinine', 'µmol/L', 'g/L');
      expect(factor).toBeDefined();
      expect(factor).toBeGreaterThan(0);
    });
  });

  describe('Conversion factor pairs', () => {
    it('glucose conversions are inverse pairs', () => {
      const mgToMmol = getConversionFactor('Glucose', 'mg/dL', 'mmol/L');
      const mmolToMg = getConversionFactor('Glucose', 'mmol/L', 'mg/dL');
      expect(mgToMmol).toBeDefined();
      expect(mmolToMg).toBeDefined();
      // Product should be close to 1
      expect(mgToMmol! * mmolToMg!).toBeCloseTo(1, 2);
    });

    it('creatinine conversions are inverse pairs', () => {
      const mgToUmol = getConversionFactor('Creatinine', 'mg/dL', 'µmol/L');
      const umolToMg = getConversionFactor('Creatinine', 'µmol/L', 'mg/dL');
      expect(mgToUmol).toBeDefined();
      expect(umolToMg).toBeDefined();
      // Product should be close to 1
      expect(mgToUmol! * umolToMg!).toBeCloseTo(1, 2);
    });

    it('hemoglobin conversions are inverse pairs', () => {
      const gDlToGL = getConversionFactor('Hemoglobin', 'g/dL', 'g/L');
      const gLToGDl = getConversionFactor('Hemoglobin', 'g/L', 'g/dL');
      expect(gDlToGL).toBeDefined();
      expect(gLToGDl).toBeDefined();
      // Product should be close to 1
      expect(gDlToGL! * gLToGDl!).toBeCloseTo(1, 5);
    });

    it('cholesterol conversions are inverse pairs', () => {
      const mgToMmol = getConversionFactor('Cholesterol', 'mg/dL', 'mmol/L');
      const mmolToMg = getConversionFactor('Cholesterol', 'mmol/L', 'mg/dL');
      expect(mgToMmol).toBeDefined();
      expect(mmolToMg).toBeDefined();
      // Product should be close to 1
      expect(mgToMmol! * mmolToMg!).toBeCloseTo(1, 2);
    });

    it('vitamin D conversions are inverse pairs', () => {
      const ngToNmol = getConversionFactor('Calcidiol+ercalcidiol', 'ng/mL', 'nmol/L');
      const nmolToNg = getConversionFactor('Calcidiol+ercalcidiol', 'nmol/L', 'ng/mL');
      expect(ngToNmol).toBeDefined();
      expect(nmolToNg).toBeDefined();
      // Product should be close to 1
      expect(ngToNmol! * nmolToNg!).toBeCloseTo(1, 2);
    });
  });
});

describe('unit spellings', () => {
  it('matches conversion rows written with the Greek mu', () => {
    // Row: μUI/mL → mIU/L
    expect(getConversion('Thyrotropin', 'µUI/mL', 'mIU/L')).toBeDefined();
    expect(getConversion('Leukocytes', 'cells/μL', '10^9/L')).toBeDefined();
  });

  it('takes two spellings of one unit as the same unit, with or without a conversion', () => {
    expect(getConversion('Fructosamine', 'µmol/L', 'μmol/L')).toEqual({ factor: 1, offset: 0 });
    expect(getConversion('Zorblatin', 'mL/min/1,73m^2', 'mL/min/1.73m²')).toEqual({
      factor: 1,
      offset: 0,
    });
  });

  it('converts a creatinine ratio written without spaces or a dot', () => {
    expect(getConversion('Protein/Creatinine', 'mg/mmolcreat', 'mg/g')).toBeDefined();
  });

  it('reads a unit with spaces run together or around it', () => {
    expect(normalizeUnitForLookup('  mmol/mol   Hb ')).toBe('mmol/mol');
  });

  it('never reads a unit as a name the lookup table inherits', () => {
    expect(normalizeUnitForLookup('toString')).toBe('toString');
    expect(normalizeUnitForLookup('constructor')).toBe('constructor');
  });
});

describe('conversion rows', () => {
  it('lists each conversion once, never one spelling of a unit to another', () => {
    const repeated = UNIT_CONVERSIONS.flatMap((definition) =>
      definition.conversions
        .filter(
          (row, i) =>
            unitsMatch(row.from, row.to) ||
            definition.conversions.findIndex(
              (other) => unitsMatch(other.from, row.from) && unitsMatch(other.to, row.to)
            ) !== i
        )
        .map((row) => `${definition.component}: ${row.from} → ${row.to}`)
    );
    expect(repeated).toEqual([]);
  });
});
