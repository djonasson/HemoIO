import { describe, expect, it } from 'vitest';
import { fixtureCatalog } from '@/test/loincFixture';
import { convertRange, valueStatus, withRangeInValueUnit } from './valueStatus';
import type { TestValue } from '@/types';

const range = (low?: number, high?: number) => ({ referenceRangeLow: low, referenceRangeHigh: high });

describe('valueStatus', () => {
  it('reads a plain number against its range', () => {
    expect(valueStatus({ value: 5, ...range(10, 50) })).toBe('low');
    expect(valueStatus({ value: 60, ...range(10, 50) })).toBe('high');
    expect(valueStatus({ value: 30, ...range(10, 50) })).toBe('normal');
    expect(valueStatus({ value: 30 })).toBe('unknown');
  });

  it.each([
    ['<', 10, range(0, 50), 'normal'],
    ['<', 10, range(undefined, 50), 'normal'],
    ['<', 10, range(20, 50), 'low'],
    ['<', 20, range(20, 50), 'low'],
    ['<=', 20, range(20, 50), 'unknown'],
    ['<', 30, range(20, 50), 'unknown'],
    ['<', 60, range(0, 50), 'unknown'],
    ['>', 200, range(undefined, 150), 'high'],
    ['>', 150, range(undefined, 150), 'high'],
    ['>=', 150, range(undefined, 150), 'unknown'],
    ['>', 100, range(0, 150), 'unknown'],
    ['>', 100, range(60), 'normal'],
    ['>', 10, range(60), 'unknown'],
  ] as const)('reads %s %s with range %o as %s', (censored, value, r, status) => {
    expect(valueStatus({ value, censored, ...r })).toBe(status);
  });

  it("takes the lab's high or low mark when the range cannot tell", () => {
    expect(valueStatus({ value: 30, labFlag: 'high' })).toBe('high');
    expect(valueStatus({ value: 30, censored: '<', labFlag: 'low', ...range(20, 50) })).toBe('low');
    expect(valueStatus({ value: 'Positivo', labFlag: 'high' })).toBe('high');
    expect(valueStatus({ value: 30, labFlag: 'abnormal' })).toBe('unknown');
  });

  it("lets the range decide when it can, whatever the lab's mark", () => {
    expect(valueStatus({ value: 30, labFlag: 'high', ...range(10, 50) })).toBe('normal');
  });
});

describe('convertRange', () => {
  const catalog = fixtureCatalog();

  it("keeps a range in the value's unit as it is", () => {
    expect(convertRange(catalog, '2345-7', { low: 70, high: 100 }, 'mg/dl', 'mg/dL')).toEqual({ low: 70, high: 100 });
  });

  it("converts a range printed in another unit to the value's", () => {
    const converted = convertRange(catalog, '2345-7', { low: 3.9, high: 5.6 }, 'mmol/L', 'mg/dL');
    expect(converted?.low).toBeCloseTo(70, 0);
    expect(converted?.high).toBeCloseTo(101, 0);
  });

  it('cannot convert between units the test does not, or for no test', () => {
    expect(convertRange(catalog, '2345-7', { low: 1, high: 2 }, 'g/24h', 'mg/dL')).toBeUndefined();
    expect(convertRange(catalog, 'unknown:zorb', { low: 1 }, 'mmol/L', 'mg/dL')).toBeUndefined();
    expect(convertRange(catalog, undefined, { low: 1 }, 'mmol/L', 'mg/dL')).toBeUndefined();
  });
});

describe('withRangeInValueUnit', () => {
  const now = new Date();
  const glucose = (options: Partial<TestValue>): TestValue => ({
    labResultId: 1,
    biomarkerKey: '2345-7',
    value: 100,
    unit: 'mg/dL',
    createdAt: now,
    updatedAt: now,
    ...options,
  });

  it("keeps a range in the value's unit, or with no unit, as it is", () => {
    const plain = glucose(range(70, 100));
    expect(withRangeInValueUnit(plain)).toBe(plain);
    const same = glucose({ ...range(70, 100), referenceRangeUnit: 'mg/dl' });
    expect(withRangeInValueUnit(same)).toBe(same);
  });

  it('sets apart a range in another unit, so it is never compared', () => {
    const apart = withRangeInValueUnit(glucose({ ...range(1, 2), referenceRangeUnit: 'g/24h' }));
    expect(apart).toMatchObject({ referenceRangeLow: undefined, referenceRangeHigh: undefined });
    expect(apart.unconvertedRange).toEqual({ low: 1, high: 2, unit: 'g/24h' });
    expect(valueStatus(apart)).toBe('unknown');
  });
});
