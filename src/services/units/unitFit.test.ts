import { describe, it, expect } from 'vitest';
import { findBiomarker } from '@data/biomarkers/dictionary';
import { unitFitsBiomarker } from './unitFit';

describe('unitFitsBiomarker', () => {
  it('accepts the units the dictionary lists and units that convert', () => {
    expect(unitFitsBiomarker(findBiomarker('Hemoglobin A1c')!, 'mmol/mol')).toBe(true);
    expect(unitFitsBiomarker(findBiomarker('Glucose')!, 'MMOL/L')).toBe(true);
  });

  it('accepts Greek mu and "u" for micro', () => {
    expect(unitFitsBiomarker(findBiomarker('Creatinine')!, '\u03bcmol/L')).toBe(true);
    expect(unitFitsBiomarker(findBiomarker('Creatinine')!, 'umol/L')).toBe(true);
  });

  it('accepts the units Italian reports write for creatinine ratios and nucleated red cells', () => {
    expect(unitFitsBiomarker(findBiomarker('Protein Creatinine Ratio')!, 'mg/g cr')).toBe(true);
    expect(unitFitsBiomarker(findBiomarker('Albumin Creatinine Ratio')!, 'mg/gcr')).toBe(true);
    expect(
      unitFitsBiomarker(findBiomarker('Nucleated Red Blood Cells Percentage')!, '/100WBC')
    ).toBe(true);
  });

  it('rejects a unit the biomarker cannot be measured in', () => {
    expect(unitFitsBiomarker(findBiomarker('Hemoglobin A1c')!, 'g/dL')).toBe(false);
  });

  it('accepts a unit that converts but no other test of the substance lists', () => {
    expect(unitFitsBiomarker(findBiomarker('C-Reactive Protein')!, 'nmol/L')).toBe(true);
  });

  it('leaves a unit to the test of the same substance that lists it', () => {
    // Urea converts from g/L, but urea in g/L is the urine test
    expect(unitFitsBiomarker(findBiomarker('Urea')!, 'g/L')).toBe(false);
    expect(unitFitsBiomarker(findBiomarker('Urine Urea')!, 'g/L')).toBe(true);
    expect(unitFitsBiomarker(findBiomarker('Total Protein')!, 'mg/dL')).toBe(false);
    expect(unitFitsBiomarker(findBiomarker('Urine Protein')!, 'mg/dL')).toBe(true);
  });
});
