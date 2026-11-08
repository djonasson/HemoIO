import { describe, it, expect } from 'vitest';
import { formatReviewedRange, formatReviewedValue } from './formatReviewedValue';

describe('formatReviewedValue', () => {
  it('reads a number as it is', () => {
    expect(formatReviewedValue({ value: 5.4 })).toBe('5.4');
    expect(formatReviewedValue({ value: 0 })).toBe('0');
  });

  it('reads an interval as its two ends', () => {
    expect(formatReviewedValue({ value: 0.5, isInterval: true, intervalLow: 0, intervalHigh: 1 })).toBe('0-1');
  });

  it('reads a qualitative result as printed, with the number it reads as', () => {
    const qualitative = { text: 'Assenti', kind: 'boolean' as const, value: 0 };
    expect(formatReviewedValue({ value: 0, qualitative })).toBe('Assenti (0)');
    // Edited to another number, it is that number
    expect(formatReviewedValue({ value: 2, qualitative })).toBe('2');
  });

  it('reads a value with no number as nothing', () => {
    expect(formatReviewedValue({ value: NaN })).toBe('');
  });
});

describe('formatReviewedRange', () => {
  it('reads a range in its own unit, or else in the value\'s', () => {
    expect(formatReviewedRange({ unit: 'mg/dL', referenceRange: { low: 70, high: 100, unit: 'mmol/L' } })).toBe(
      '70 - 100 mmol/L'
    );
    expect(formatReviewedRange({ unit: 'mg/dL', referenceRange: { low: 70, high: 100, unit: '' } })).toBe(
      '70 - 100 mg/dL'
    );
  });

  it('reads a range with one end as ≤ or ≥', () => {
    expect(formatReviewedRange({ unit: 'mg/dL', referenceRange: { high: 100, unit: 'mg/dL' } })).toBe('≤ 100 mg/dL');
    expect(formatReviewedRange({ unit: 'mg/dL', referenceRange: { low: 70, unit: 'mg/dL' } })).toBe('≥ 70 mg/dL');
  });

  it('is null without a range', () => {
    expect(formatReviewedRange({ unit: 'mg/dL' })).toBeNull();
  });
});
