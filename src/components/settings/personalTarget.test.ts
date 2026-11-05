import { describe, it, expect } from 'vitest';
import { fixtureCatalog } from '@/test/loincFixture';
import { hasTargetRange, toPersonalTarget } from './personalTarget';

const catalog = fixtureCatalog();

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
  it('pairs a test with its standard range and stored target', () => {
    expect(toPersonalTarget(catalog, '2345-7', { high: 90 })).toEqual({
      biomarkerKey: '2345-7',
      biomarkerName: 'Glucose',
      unit: 'mg/dL',
      standardLow: 70,
      standardHigh: 100,
      personalLow: undefined,
      personalHigh: 90,
    });
  });

  it('names a test HemoIO has no add-on for by LOINC, with no standard range', () => {
    expect(toPersonalTarget(catalog, '2339-0', undefined)).toMatchObject({
      biomarkerName: 'Glucose Bld-mCnc',
      unit: '',
      standardLow: undefined,
      standardHigh: undefined,
    });
  });
});
