import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  normalizeUnitForLookup,
  unitsMatch,
  UNIT_CONVERSIONS,
  CHEMISTRY,
  chemistryOf,
  findConversionDefinition,
  getConversion,
} from './definitions';
import { ucumConversion } from './ucum';
import type { CatalogFile } from '@data/loinc/catalog';

const factor = (component: string, from: string, to: string): number | undefined =>
  getConversion(component, from, to)?.factor;

describe('conversion table', () => {
  it('has one entry per substance, whatever the sample', () => {
    const components = UNIT_CONVERSIONS.map((c) => c.component);
    expect(new Set(components).size).toBe(components.length);
  });

  it('has a positive, finite factor in every row', () => {
    for (const def of UNIT_CONVERSIONS) {
      for (const conv of def.conversions) {
        expect(conv.factor).toBeGreaterThan(0);
        expect(Number.isFinite(conv.factor)).toBe(true);
      }
    }
  });

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

  it('holds only conversions UCUM cannot give, so a hand factor never stands in for its value', () => {
    // A row UCUM also converts (with the substance's molar mass) could only
    // repeat UCUM's factor, or hide it behind a wrong one (cells/µL)
    const ucumGives = UNIT_CONVERSIONS.flatMap((definition) =>
      definition.conversions
        .map((row) => ({ row, ucum: ucumConversion(row.from, row.to, chemistryOf(definition.component)) }))
        .filter(({ ucum }) => ucum !== undefined)
        .map(({ row, ucum }) => `${definition.component}: ${row.from} → ${row.to} is ×${ucum!.factor}, not ×${row.factor}`)
    );
    expect(ucumGives).toEqual([]);
  });
});

describe('chemistry', () => {
  it('names every substance as a LOINC component', () => {
    const path = resolve(process.cwd(), 'src/data/loinc/catalog.generated.json');
    const file = JSON.parse(readFileSync(path, 'utf8')) as CatalogFile;
    const components = new Set(file.tests.map((test) => test.component.toLowerCase()));
    expect([...CHEMISTRY.keys()].filter((component) => !components.has(component))).toEqual([]);
  });

  it('gives every molar mass and charge as a positive number', () => {
    for (const { molarMass, charge } of CHEMISTRY.values()) {
      expect(molarMass ?? 1).toBeGreaterThan(0);
      expect(charge ?? 1).toBeGreaterThan(0);
    }
  });
});

describe('findConversionDefinition', () => {
  it('finds by LOINC component, in any case and spacing', () => {
    expect(findConversionDefinition('Amylase')?.component).toBe('Amylase');
    expect(findConversionDefinition('  amylase  ')?.component).toBe('Amylase');
  });

  it('never gives a ratio the conversions of one of its parts', () => {
    expect(findConversionDefinition('Albumin/Creatinine')?.component).toBe('Albumin/Creatinine');
    expect(findConversionDefinition('Spermatozoa.motile/Spermatozoa')).toBeUndefined();
  });

  it('does not match old dictionary names', () => {
    expect(findConversionDefinition('Blood Sugar')).toBeUndefined();
    expect(getConversion('Blood Sugar', 'mg/dL', 'mmol/L')).toBeUndefined();
  });
});

describe('getConversion', () => {
  it('converts a mass to moles by the molar mass', () => {
    expect(factor('Glucose', 'mg/dL', 'mmol/L')).toBeCloseTo(0.0555, 4);
    expect(factor('Glucose', 'mmol/L', 'mg/dL')).toBeCloseTo(18.018, 2);
    expect(factor('Creatinine', 'mg/dL', 'µmol/L')).toBeCloseTo(88.4, 1);
    expect(factor('Cholesterol', 'mg/dL', 'mmol/L')).toBeCloseTo(0.0259, 4);
    expect(factor('Hemoglobin', 'g/dL', 'mmol/L')).toBeCloseTo(0.6206, 4);
  });

  it('converts a component with a subpart as its substance', () => {
    expect(factor('Cholesterol.in LDL', 'mg/dL', 'mmol/L')).toBeCloseTo(0.0259, 4);
    expect(factor('Glucose^2H post 75 g glucose PO', 'mg/dL', 'mmol/L')).toBeCloseTo(0.0555, 4);
    expect(factor('Thyroxine.free', 'ng/dL', 'pmol/L')).toBeCloseTo(12.87, 2);
  });

  it('never converts a ratio by the molar mass of one of its parts', () => {
    expect(getConversion('Urea nitrogen/Creatinine', 'mg/dL', 'mmol/L')).toBeUndefined();
  });

  it('converts vitamin D3 (calcidiol) and the total of D2 and D3 alike', () => {
    expect(factor('Calcidiol', 'ng/mL', 'nmol/L')).toBeCloseTo(2.496, 3);
    expect(factor('Calcidiol+ercalcidiol', 'nmol/L', 'ng/mL')).toBeCloseTo(0.4006, 4);
  });

  it('converts a substance that has a molar mass and no conversions of its own', () => {
    expect(factor('Cortisol', 'µg/dL', 'nmol/L')).toBeCloseTo(27.59, 2);
    expect(factor('Urate', 'mg/dL', 'mmol/L')).toBeCloseTo(0.05948, 5);
    expect(factor('Testosterone.free', 'pg/mL', 'pmol/L')).toBeCloseTo(3.467, 3);
  });

  it('converts moles to equivalents by the charge', () => {
    expect(factor('Carbon dioxide', 'mEq/L', 'mmol/L')).toBe(1);
    expect(factor('Magnesium', 'mEq/L', 'mmol/L')).toBe(0.5);
    expect(factor('Magnesium', 'mg/dL', 'mEq/L')).toBeCloseTo(0.8229, 4);
  });

  it('converts units of one dimension as UCUM does, for a test with no conversions of its own', () => {
    expect(getConversion('Zorblatin', 'g/dL', 'g/L')).toEqual({ factor: 10, offset: 0 });
    expect(getConversion('Zorblatin', 'x10³/µL', '10^9/L')).toEqual({ factor: 1, offset: 0 });
    expect(getConversion('Leukocytes', 'cells/μL', '10^9/L')).toEqual({ factor: 0.001, offset: 0 });
    expect(getConversion('Follitropin', 'mIU/mL', 'mUI/mL')).toEqual({ factor: 1, offset: 0 });
    expect(getConversion('Follitropin', 'mIU/mL', 'IU/L')).toEqual({ factor: 1, offset: 0 });
    // A mass to moles needs the substance's molar mass
    expect(getConversion('Zorblatin', 'mg/dL', 'mmol/L')).toBeUndefined();
  });

  it('rescales either end of a conversion of its own', () => {
    const urine = { component: 'Albumin', system: 'Urine' };
    expect(getConversion(urine, 'mg/dL', 'µg/min')?.factor).toBeCloseTo(10.4);
    expect(getConversion('Alpha-1-Fetoprotein', 'µg/L', 'IU/mL')?.factor).toBeCloseTo(1 / 1.21);
    expect(getConversion('Thyroperoxidase Ab', 'U/mL', 'kIU/L')).toEqual({ factor: 1, offset: 0 });
  });

  it('converts albumin mg/L to µg/min only for urine', () => {
    const urine = { component: 'Albumin', system: 'Urine' };
    expect(getConversion(urine, 'mg/L', 'µg/min')?.factor).toBeCloseTo(1.04);
    expect(getConversion({ ...urine, system: 'Ser/Plas' }, 'mg/L', 'µg/min')).toBeUndefined();
    expect(getConversion('Albumin', 'mg/L', 'µg/min')).toBeUndefined();
    // The rest of albumin's conversions hold for every sample
    expect(getConversion({ ...urine, system: 'Ser/Plas' }, 'g/dL', 'g/L')?.factor).toBe(10);
  });

  it('gives 1 for one unit, however spelled', () => {
    expect(getConversion('Glucose', 'mg/dL', 'MG/DL')).toEqual({ factor: 1, offset: 0 });
    expect(getConversion('Fructosamine', 'µmol/L', 'μmol/L')).toEqual({ factor: 1, offset: 0 });
    expect(getConversion('Zorblatin', 'mL/min/1,73m^2', 'mL/min/1.73m²')).toEqual({ factor: 1, offset: 0 });
    expect(getConversion('Spermatozoa', '10^6', 'million')).toEqual({ factor: 1, offset: 0 });
  });

  it('is undefined for a unit it cannot read', () => {
    expect(getConversion('Glucose', 'mg/dL', 'stones')).toBeUndefined();
  });
});

describe('unit spellings', () => {
  it('matches conversion rows written with the Greek mu', () => {
    // Row: mg/L → µg/min (micro sign), which UCUM alone cannot give
    expect(getConversion({ component: 'Albumin', system: 'Urine' }, 'mg/L', 'μg/min')?.factor).toBe(1.04);
  });

  it('converts a creatinine ratio written without spaces or a dot', () => {
    expect(getConversion('Protein/Creatinine', 'mg/mmolcreat', 'mg/g')?.factor).toBe(8.84);
  });

  it('reads a unit with spaces run together or around it', () => {
    expect(normalizeUnitForLookup('  mmol/mol   Hb ')).toBe('mmol/mol');
  });

  it('never reads a unit as a name the lookup table inherits', () => {
    expect(normalizeUnitForLookup('toString')).toBe('toString');
    expect(normalizeUnitForLookup('constructor')).toBe('constructor');
  });
});
