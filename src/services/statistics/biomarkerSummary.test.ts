import { describe, it, expect } from 'vitest';
import { summarizeBiomarkerResults, type SummarizableResult } from './biomarkerSummary';

const GLUCOSE = { key: 'glucose', name: 'Glucose' };

function result(day: string, values: SummarizableResult['testValues']): SummarizableResult {
  return { date: new Date(`${day}T12:00:00Z`), labName: `Lab ${day}`, testValues: values };
}

const glucose = (
  value: number | string | boolean,
  status: 'normal' | 'high' | 'low' | 'unknown' = 'normal'
) => ({
  biomarkerKey: 'glucose',
  value,
  unit: 'mg/dL',
  status,
});

describe('summarizeBiomarkerResults', () => {
  it('returns null without recorded values', () => {
    expect(summarizeBiomarkerResults([result('2024-01-15', [])], GLUCOSE)).toBeNull();
  });

  it('counts the values and reports the newest, whatever the order of results', () => {
    const summary = summarizeBiomarkerResults(
      [
        result('2024-02-20', [glucose(120, 'high')]),
        result('2024-01-15', [glucose(95), { ...glucose(14), biomarkerKey: 'hemoglobin' }]),
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
      [result('2024-02-20', [glucose(100)])],
      GLUCOSE,
      'mmol/L'
    );
    expect(summary?.latest).toEqual(expect.objectContaining({ value: 5.55, unit: 'mmol/L' }));
  });

  it('reports a latest value that is not a number as recorded', () => {
    const summary = summarizeBiomarkerResults(
      [result('2024-02-20', [glucose(true, 'unknown')])],
      GLUCOSE,
      'mmol/L'
    );
    expect(summary?.latest).toEqual(
      expect.objectContaining({ value: true, unit: 'mg/dL', status: 'unknown' })
    );
  });
});
