import { describe, it, expect } from 'vitest';
import { fixtureCatalog } from '@/test/loincFixture';
import { summarizeBiomarkerResults, type SummarizableResult } from './biomarkerSummary';

const catalog = fixtureCatalog();
const GLUCOSE = '2345-7';

function result(day: string, values: SummarizableResult['testValues']): SummarizableResult {
  return { date: new Date(`${day}T12:00:00Z`), labName: `Lab ${day}`, testValues: values };
}

const glucose = (
  value: number | string | boolean,
  status: 'normal' | 'high' | 'low' | 'unknown' = 'normal'
) => ({
  biomarkerKey: GLUCOSE,
  value,
  unit: 'mg/dL',
  status,
});

describe('summarizeBiomarkerResults', () => {
  it('returns null without recorded values', () => {
    expect(summarizeBiomarkerResults(catalog, [result('2024-01-15', [])], GLUCOSE)).toBeNull();
  });

  it('counts the values and reports the newest, whatever the order of results', () => {
    const summary = summarizeBiomarkerResults(
      catalog,
      [
        result('2024-02-20', [glucose(120, 'high')]),
        result('2024-01-15', [glucose(95), { ...glucose(14), biomarkerKey: '718-7' }]),
        result('2024-01-30', [glucose(99)]),
      ],
      GLUCOSE
    );
    expect(summary).toEqual({
      count: 3,
      latest: {
        value: 120,
        unit: 'mg/dL',
        date: new Date('2024-02-20T12:00:00Z'),
        status: 'high',
        labName: 'Lab 2024-02-20',
      },
    });
  });

  it('reports the latest value in the display unit', () => {
    const summary = summarizeBiomarkerResults(
      catalog,
      [result('2024-02-20', [glucose(100)])],
      GLUCOSE,
      'mmol/L'
    );
    expect(summary?.latest).toEqual(expect.objectContaining({ value: 5.55, unit: 'mmol/L' }));
  });

  it("reports an interval's ends with its midpoint, unconverted", () => {
    const summary = summarizeBiomarkerResults(
      catalog,
      [
        result('2024-02-20', [
          { ...glucose(7.5), numericValueType: 'interval', intervalLow: 5, intervalHigh: 10 },
        ]),
      ],
      GLUCOSE,
      'mmol/L'
    );
    expect(summary?.latest).toEqual(
      expect.objectContaining({ value: 7.5, unit: 'mg/dL', numericValueType: 'interval', intervalLow: 5, intervalHigh: 10 })
    );
  });

  it("reports a censored value's comparator", () => {
    const summary = summarizeBiomarkerResults(
      catalog,
      [result('2024-02-20', [{ ...glucose(10), censored: '<' }])],
      GLUCOSE
    );
    expect(summary?.latest).toEqual(expect.objectContaining({ value: 10, censored: '<' }));
  });

  it('reports a latest value that is not a number as recorded', () => {
    const summary = summarizeBiomarkerResults(
      catalog,
      [result('2024-02-20', [glucose(true, 'unknown')])],
      GLUCOSE,
      'mmol/L'
    );
    expect(summary?.latest).toEqual(
      expect.objectContaining({ value: true, unit: 'mg/dL', status: 'unknown' })
    );
  });

  it("counts the values of every code of the test's trend group", () => {
    const molar = { biomarkerKey: '14749-6', value: 7, unit: 'mmol/L', status: 'high' as const };
    const summary = summarizeBiomarkerResults(
      catalog,
      [result('2024-01-15', [glucose(95)]), result('2024-02-20', [molar])],
      GLUCOSE,
      'mg/dL'
    );
    expect(summary?.count).toBe(2);
    expect(summary?.latest).toEqual(expect.objectContaining({ value: 126, unit: 'mg/dL' }));
  });
});
