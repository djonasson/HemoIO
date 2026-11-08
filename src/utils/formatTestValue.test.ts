import { describe, it, expect } from 'vitest';
import { formatPointValue, formatTestValue } from './formatTestValue';

describe('formatTestValue', () => {
  it('reads an interval as its ends, not its midpoint', () => {
    expect(formatTestValue({ value: 7.5, numericValueType: 'interval', intervalLow: 5, intervalHigh: 10 })).toBe(
      '5-10'
    );
  });

  it('writes the ends and a number as asked', () => {
    const fixed = (n: number) => n.toFixed(1);
    expect(
      formatTestValue({ value: 1, numericValueType: 'interval', intervalLow: 0.5, intervalHigh: 1.5 }, fixed)
    ).toBe('0.5-1.5');
    expect(formatTestValue({ value: 95 }, fixed)).toBe('95.0');
  });

  it('reads an interval missing an end as its number', () => {
    expect(formatTestValue({ value: 7.5, numericValueType: 'interval', intervalLow: 5 })).toBe('7.5');
  });

  it('reads a qualitative result as printed', () => {
    expect(formatTestValue({ value: 'Assenti' })).toBe('Assenti');
  });

  it('reads a yes or no as Positive or Negative', () => {
    expect(formatTestValue({ value: true })).toBe('Positive');
    expect(formatTestValue({ value: false })).toBe('Negative');
  });
});

describe('formatPointValue', () => {
  it("reads a charted interval as its ends, and any other point as its number", () => {
    expect(formatPointValue({ value: 7.5, interval: { low: 5, high: 10 } })).toBe('5-10');
    expect(formatPointValue({ value: 95 })).toBe('95');
  });
});

describe('censored values', () => {
  it.each([
    ['<', '< 10'],
    ['<=', '≤ 10'],
    ['>', '> 10'],
    ['>=', '≥ 10'],
  ] as const)('reads %s 10 with its comparator, as %s', (censored, shown) => {
    expect(formatTestValue({ value: 10, censored })).toBe(shown);
    expect(formatPointValue({ value: 10, censored })).toBe(shown);
  });

  it('writes the bound as asked', () => {
    expect(formatTestValue({ value: 0.2, censored: '<' }, (n) => n.toFixed(2))).toBe('< 0.20');
  });
});
