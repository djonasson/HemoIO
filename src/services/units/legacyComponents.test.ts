import { describe, expect, it } from 'vitest';
import { componentForBiomarker } from './legacyComponents';
import { convertValue } from './conversion';
import { findConversionDefinition } from './definitions';

describe('componentForBiomarker', () => {
  it.each([
    ['Glucose', 'Glucose'],
    ['Blood Sugar', 'Glucose'],
    ['blood sugar', 'Glucose'],
    ['Urine Glucose', 'Glucose'],
    ['LDL Cholesterol', 'Cholesterol.in LDL'],
    ['Direct Bilirubin', 'Bilirubin.glucuronidated+Bilirubin.albumin bound'],
    ['Urine Creatinine', 'Creatinine'],
    ['24-Hour Urine Creatinine', 'Creatinine'],
    ['HbA1c', 'Hemoglobin A1c/Hemoglobin.total'],
    ['GGT', 'Gamma glutamyl transferase'],
    ['White Blood Cell Count', 'Leukocytes'],
  ])('reads the dictionary name %s as %s', (name, component) => {
    expect(componentForBiomarker(name)).toBe(component);
  });

  it('finds a name through the dictionary’s own aliases', () => {
    expect(componentForBiomarker('P-Creatinina (metodo enzimatico)')).toBe('Creatinine');
  });

  it('passes any other name through, so a LOINC component still works', () => {
    expect(componentForBiomarker('Fructosamine')).toBe('Fructosamine');
    expect(componentForBiomarker('Unknown Marker')).toBe('Unknown Marker');
  });

  it.each(['Total Cholesterol', 'Non-HDL', 'Free T4', 'TPO Antibodies', 'Sexual Abstinence'])(
    'reads %s as a component that has conversions',
    (name) => {
      expect(findConversionDefinition(componentForBiomarker(name))).toBeDefined();
    }
  );

  it('keeps old callers converting', () => {
    expect(convertValue(componentForBiomarker('Blood Sugar'), 100, 'mg/dL', 'mmol/L').convertedValue)
      .toBeCloseTo(5.55, 2);
  });
});
