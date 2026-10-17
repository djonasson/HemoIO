import { describe, it, expect } from 'vitest';
import { convertMeasurement } from './convertMeasurement';

describe('convertMeasurement', () => {
  it('converts the value and reference range together', () => {
    const result = convertMeasurement(
      'Glucose',
      { value: 5.5, unit: 'mmol/L', referenceRangeLow: 3.9, referenceRangeHigh: 5.6 },
      'mg/dL'
    );

    expect(result).toEqual({ value: 99, unit: 'mg/dL', referenceRange: { low: 70, high: 101 } });
  });

  it('keeps the original unit when the units cannot be converted', () => {
    // Microscopy field counts cannot be expressed as counts per µL
    const result = convertMeasurement(
      'Urine Epithelial Cells',
      { value: 2, unit: '/HPF' },
      '/µL'
    );

    expect(result).toEqual({ value: 2, unit: '/HPF', referenceRange: { low: undefined, high: undefined } });
  });

  it('keeps the original unit for an unknown biomarker', () => {
    const result = convertMeasurement('Not A Biomarker', { value: 3, unit: 'U/L' }, 'mg/dL');

    expect(result.unit).toBe('U/L');
    expect(result.value).toBe(3);
  });

  it('returns the measurement unchanged when it is already in the target unit', () => {
    const result = convertMeasurement(
      'Glucose',
      { value: 95, unit: 'mg/dL', referenceRangeHigh: 100 },
      'mg/dL'
    );

    expect(result).toEqual({ value: 95, unit: 'mg/dL', referenceRange: { low: undefined, high: 100 } });
  });
});
