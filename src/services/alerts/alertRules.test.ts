import { describe, it, expect } from 'vitest';
import {
  detectConsistentDirection,
  formatReferenceRange,
  formatTimeframe,
  improvementMessage,
  indicatorColor,
  outOfRangeMessage,
  outOfRangeSeverity,
  trendMessage,
} from './alertRules';

const d = (iso: string) => new Date(`${iso}T10:00:00Z`);

describe('outOfRangeSeverity', () => {
  it('is critical at 50% or more beyond the nearest bound', () => {
    expect(outOfRangeSeverity(150, 'high', { low: 70, high: 100 })).toBe('critical');
    expect(outOfRangeSeverity(180, 'high', { low: 70, high: 100 })).toBe('critical');
    expect(outOfRangeSeverity(6, 'low', { low: 12, high: 17.5 })).toBe('critical');
  });

  it('is a warning below 50%', () => {
    expect(outOfRangeSeverity(110, 'high', { low: 70, high: 100 })).toBe('warning');
    expect(outOfRangeSeverity(10, 'low', { low: 12, high: 17.5 })).toBe('warning');
    expect(outOfRangeSeverity(11.5, 'low', { low: 12, high: 17.5 })).toBe('warning');
  });

  it('uses the only bound available, and warns when the needed bound is missing', () => {
    expect(outOfRangeSeverity(160, 'high', { high: 100 })).toBe('critical');
    expect(outOfRangeSeverity(160, 'high', { low: 70 })).toBe('warning');
    expect(outOfRangeSeverity(160, 'high', undefined)).toBe('warning');
    // A zero lower bound cannot be exceeded by a percentage
    expect(outOfRangeSeverity(-1, 'low', { low: 0, high: 5 })).toBe('warning');
  });
});

describe('detectConsistentDirection', () => {
  it('counts the values of one day as one point', () => {
    // Two labs on the same day are not two steps of a trend
    expect(
      detectConsistentDirection([
        { date: new Date('2024-01-10T09:00:00Z'), value: 10 },
        { date: new Date('2024-02-10T09:00:00Z'), value: 11 },
        { date: new Date('2024-03-10T09:00:00Z'), value: 12 },
        { date: new Date('2024-03-10T15:00:00Z'), value: 13 },
      ])
    ).toBeNull();
  });

  it('describes a span shorter than a month in days', () => {
    expect(formatTimeframe(new Date(2024, 0, 30), new Date(2024, 1, 2))).toMatch(/^over 3 days/);
  });

  it('finds four consecutive decreasing values ending with the latest', () => {
    const result = detectConsistentDirection([
      { date: d('2024-04-10'), value: 10.0 },
      { date: d('2024-01-10'), value: 11.5 },
      { date: d('2024-03-10'), value: 10.5 },
      { date: d('2024-02-10'), value: 11.0 },
    ]);
    expect(result).toEqual({ direction: 'decreasing', count: 4, start: d('2024-01-10'), end: d('2024-04-10') });
  });

  it('needs at least four values in the run', () => {
    expect(
      detectConsistentDirection([
        { date: d('2024-01-10'), value: 1 },
        { date: d('2024-02-10'), value: 2 },
        { date: d('2024-03-10'), value: 3 },
      ])
    ).toBeNull();
  });

  it('does not treat a plateau as consistent', () => {
    expect(
      detectConsistentDirection([
        { date: d('2024-01-10'), value: 1 },
        { date: d('2024-02-10'), value: 2 },
        { date: d('2024-03-10'), value: 2 },
        { date: d('2024-04-10'), value: 3 },
        { date: d('2024-05-10'), value: 4 },
      ])
    ).toBeNull();
  });

  it('only counts the run that ends with the latest value', () => {
    const result = detectConsistentDirection([
      { date: d('2024-01-10'), value: 9 },
      { date: d('2024-02-10'), value: 1 },
      { date: d('2024-03-10'), value: 2 },
      { date: d('2024-04-10'), value: 3 },
      { date: d('2024-05-10'), value: 4 },
    ]);
    expect(result).toMatchObject({ direction: 'increasing', count: 4, start: d('2024-02-10') });
  });
});

describe('messages', () => {
  it('formats the timeframe of a trend', () => {
    expect(formatTimeframe(d('2024-01-10'), d('2024-04-10'))).toBe('over 3 months (Jan–Apr 2024)');
    expect(formatTimeframe(d('2023-11-10'), d('2024-02-10'))).toBe('over 3 months (Nov 2023–Feb 2024)');
    expect(formatTimeframe(d('2024-01-01'), d('2024-01-20'))).toBe('over 19 days (Jan 2024)');
    expect(formatTimeframe(d('2024-01-10'), d('2024-02-10'))).toBe('over 1 month (Jan–Feb 2024)');
  });

  it('formats reference ranges with one or two bounds', () => {
    expect(formatReferenceRange({ low: 70, high: 100 }, 'mg/dL')).toBe('70 - 100 mg/dL');
    expect(formatReferenceRange({ high: 100 }, 'mg/dL')).toBe('≤ 100 mg/dL');
    expect(formatReferenceRange({ low: 40 }, 'mg/dL')).toBe('≥ 40 mg/dL');
    expect(formatReferenceRange({}, 'mg/dL')).toBeNull();
  });

  it('builds the out-of-range, trend and improvement messages', () => {
    expect(outOfRangeMessage('Glucose', 'high', 150, 'mg/dL', { low: 70, high: 100 })).toBe(
      'Glucose is high at 150 mg/dL (reference 70 - 100 mg/dL)'
    );
    expect(outOfRangeMessage('Hemoglobin', 'low', 10, 'g/dL', undefined)).toBe('Hemoglobin is low at 10 g/dL');
    expect(trendMessage('decreasing', d('2024-01-10'), d('2024-04-10'))).toBe(
      'Consistently decreasing over 3 months (Jan–Apr 2024)'
    );
    expect(improvementMessage('Glucose')).toBe('Improved: Glucose now within range');
  });
});

describe('indicatorColor', () => {
  it('colours by direction, not severity', () => {
    expect(indicatorColor({ type: 'out_of_range', status: 'high' })).toBe('red');
    expect(indicatorColor({ type: 'out_of_range', status: 'low' })).toBe('orange');
    expect(indicatorColor({ type: 'trend', status: 'normal', direction: 'increasing' })).toBe('red');
    expect(indicatorColor({ type: 'trend', status: 'low', direction: 'decreasing' })).toBe('orange');
    expect(indicatorColor({ type: 'improvement', status: 'normal' })).toBe('green');
  });
});
