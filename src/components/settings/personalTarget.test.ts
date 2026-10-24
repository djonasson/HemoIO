import { describe, it, expect } from 'vitest';
import { getBiomarkerByKey } from '@data/biomarkers';
import { hasTargetRange, toPersonalTarget } from './personalTarget';

describe('hasTargetRange', () => {
  it('is true when either bound is set', () => {
    expect(hasTargetRange({ low: 70 })).toBe(true);
    expect(hasTargetRange({ high: 90 })).toBe(true);
  });

  it('is false for no range or an empty one', () => {
    expect(hasTargetRange(undefined)).toBe(false);
    expect(hasTargetRange({})).toBe(false);
  });
});

describe('toPersonalTarget', () => {
  it('pairs a biomarker with its stored target', () => {
    const glucose = getBiomarkerByKey('glucose')!;
    expect(toPersonalTarget(glucose, { high: 90 })).toEqual({
      biomarkerKey: 'glucose',
      biomarkerName: glucose.name,
      unit: glucose.canonicalUnit,
      standardLow: glucose.defaultReferenceRange?.low,
      standardHigh: glucose.defaultReferenceRange?.high,
      personalLow: undefined,
      personalHigh: 90,
    });
  });
});
