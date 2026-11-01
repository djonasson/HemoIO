import { describe, it, expect } from 'vitest';
import { formatReviewedValue } from './formatReviewedValue';

describe('formatReviewedValue', () => {
  it('reads a number as it is', () => {
    expect(formatReviewedValue({ value: 5.4 })).toBe('5.4');
    expect(formatReviewedValue({ value: 0 })).toBe('0');
  });

  it('reads an interval as its two ends', () => {
    expect(formatReviewedValue({ value: 0.5, isInterval: true, intervalLow: 0, intervalHigh: 1 })).toBe('0-1');
  });

  it('reads a value with no number as nothing', () => {
    expect(formatReviewedValue({ value: NaN })).toBe('');
  });
});
