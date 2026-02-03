import { describe, test, expect } from 'vitest';
import { canConvert, convertValue } from './conversion';

describe('Greek mu (μ) vs micro sign (µ) handling', () => {
  test('should convert Creatinine with Greek mu character', () => {
    // μ is Greek mu (U+03BC), commonly used in European lab reports
    expect(canConvert('Creatinine', 'μmol/L', 'mg/dL')).toBe(true);
    const result = convertValue('Creatinine', 67, 'μmol/L', 'mg/dL');
    // 67 * 0.0113 = 0.7571 mg/dL, default precision for mg/dL is 0
    // So it rounds to 1 mg/dL - but lab shows 0.75, so we need more precision
    expect(result.convertedValue).toBe(1);  // Default precision is 0 decimal places
    
    // With precision override, we should get closer
    const resultWithPrecision = convertValue('Creatinine', 67, 'μmol/L', 'mg/dL', 2);
    expect(resultWithPrecision.convertedValue).toBeCloseTo(0.76, 1);
  });

  test('should convert Urine Creatinine with Greek mu character', () => {
    expect(canConvert('Urine Creatinine', 'μmol/L', 'mg/dL')).toBe(true);
    expect(canConvert('Urine Creatinine', 'g/L', 'mg/dL')).toBe(true);
  });
});

describe('Protein Creatinine Ratio unit normalization', () => {
  test('should normalize mg/mmolcreat. and handle conversion', () => {
    // mg/gcreat. should be treated as mg/g
    expect(canConvert('Protein Creatinine Ratio', 'mg/mmolcreat.', 'mg/g')).toBe(true);
    expect(canConvert('Protein Creatinine Ratio', 'mg/mmol', 'mg/g')).toBe(true);
    
    const result = convertValue('Protein Creatinine Ratio', 15, 'mg/mmolcreat.', 'mg/g');
    expect(result.convertedValue).toBeCloseTo(132.6, 0);  // 15 * 8.84 = 132.6
  });
  
  test('should handle mg/gcreat. as same unit as mg/g', () => {
    // When normalizing, mg/gcreat. becomes mg/g, so same-unit conversion
    expect(canConvert('Protein Creatinine Ratio', 'mg/gcreat.', 'mg/g')).toBe(true);
  });
});
