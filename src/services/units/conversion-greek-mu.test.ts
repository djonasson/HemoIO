import { describe, test, expect } from 'vitest';
import { canConvert, convertValue } from './conversion';

describe('Greek mu (μ) vs micro sign (µ) handling', () => {
  test('should convert Creatinine with Greek mu character', () => {
    // μ is Greek mu (U+03BC), commonly used in European lab reports
    expect(canConvert('Creatinine', 'μmol/L', 'mg/dL')).toBe(true);
    const result = convertValue('Creatinine', 67, 'μmol/L', 'mg/dL');
    // 67 × 113.12 g/mol = 0.758 mg/dL: small values keep two significant figures
    expect(result.convertedValue).toBe(0.76);
  });

  test('should convert Urine Creatinine with Greek mu character', () => {
    // 3780 μmol/L × 113.12 g/mol = 0.43 g/L
    expect(convertValue('Creatinine', 3780, 'μmol/L', 'g/L', 2).convertedValue).toBe(0.43);
  });

  test('should convert with a conversion row written with the Greek mu', () => {
    // Urine albumin's mg/L → µg/min is a row of its own: UCUM cannot give it
    const urine = { component: 'Albumin', system: 'Urine' };
    expect(convertValue(urine, 25, 'mg/L', 'μg/min', 1).convertedValue).toBe(26);
  });
});

describe('Protein Creatinine Ratio unit normalization', () => {
  test('should normalize mg/mmolcreat. and handle conversion', () => {
    // mg/gcreat. should be treated as mg/g
    expect(canConvert('Protein/Creatinine', 'mg/mmolcreat.', 'mg/g')).toBe(true);
    expect(canConvert('Protein/Creatinine', 'mg/mmol', 'mg/g')).toBe(true);

    const result = convertValue('Protein/Creatinine', 15, 'mg/mmolcreat.', 'mg/g');
    expect(result.convertedValue).toBeCloseTo(132.6, 0);  // 15 * 8.84 = 132.6
  });

  test('should handle mg/gcreat. as same unit as mg/g', () => {
    // When normalizing, mg/gcreat. becomes mg/g, so same-unit conversion
    expect(canConvert('Protein/Creatinine', 'mg/gcreat.', 'mg/g')).toBe(true);
  });
});
