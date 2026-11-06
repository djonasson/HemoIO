/**
 * Tests for useAlerts hook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAlerts, type BiomarkerAlert, type UseAlertsResult } from './useAlerts';
import { useLabResults } from './useLabResults';
import type { LabResultWithDetails, EnrichedTestValue } from './useLabResults';
import { fixtureCatalog } from '@/test/loincFixture';
import { testKey } from '@data/loinc/display';

// Mock useLabResults
vi.mock('./useLabResults', () => ({
  useLabResults: vi.fn(),
}));

const alertState = {
  acknowledgedThrough: {} as Record<string, Date>,
  dismissedThrough: {} as Record<string, Date>,
  acknowledge: vi.fn(async () => {}),
  dismiss: vi.fn(),
};
vi.mock('./useAlertState', () => ({ useAlertState: () => alertState }));

let mockUnitPreferences: Record<string, string> = {};
vi.mock('./usePreferences', () => ({
  usePreferences: () => ({
    unitPreferences: mockUnitPreferences,
    personalTargets: {},
    isLoaded: true,
    setPreferredUnit: vi.fn(),
    setPersonalTarget: vi.fn(),
    reload: vi.fn(),
  }),
}));

// The fixture LOINC catalog: 2345-7 glucose (mg/dL), 14749-6 glucose (mmol/L), 718-7 hemoglobin
vi.mock('@contexts/useCatalog', async () => {
  const { fixtureCatalog } = await import('@/test/loincFixture');
  const catalog = fixtureCatalog();
  return { useCatalog: () => catalog };
});

/** The key a test's preferences and acknowledgements are kept under, as the app keeps them */
const catalog = fixtureCatalog();
const GLUCOSE_KEY = testKey(catalog, '2345-7');
const HEMOGLOBIN_KEY = testKey(catalog, '718-7');

function createMockTestValue(
  id: number,
  labResultId: number,
  options: Partial<EnrichedTestValue> = {}
): EnrichedTestValue {
  return {
    id,
    labResultId,
    biomarkerKey: options.biomarkerKey || '2345-7',
    value: options.value ?? 100,
    unit: options.unit || 'mg/dL',
    status: options.status || 'normal',
    rawText: options.rawText || 'Glucose',
    referenceRangeLow: options.referenceRangeLow,
    referenceRangeHigh: options.referenceRangeHigh,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createMockResult(
  id: number,
  date: string,
  testValues: EnrichedTestValue[]
): LabResultWithDetails {
  return {
    id,
    date: new Date(date),
    labName: 'Test Lab',
    createdAt: new Date(),
    updatedAt: new Date(),
    testValues,
    abnormalCount: testValues.filter((tv) => tv.status === 'high' || tv.status === 'low').length,
    totalCount: testValues.length,
  };
}

/** Every alert on the shown cards */
function alertsOf(result: UseAlertsResult): BiomarkerAlert[] {
  return result.groups.flatMap((group) => [
    group.headline,
    ...(group.trend ? [group.trend] : []),
    ...group.earlier.map((r) => r.alert),
  ]);
}

describe('useAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    alertState.acknowledgedThrough = {};
    alertState.dismissedThrough = {};
    mockUnitPreferences = {};
  });

  it('keeps a trend whose values were recorded in two other units than the preferred one', () => {
    // No direct mmol/L → g/L factor exists; the values go through g/dL
    mockUnitPreferences = { [HEMOGLOBIN_KEY]: 'g/L' };
    const values: Array<[number, string]> = [
      [17, 'g/dL'],
      [10.9, 'mmol/L'],
      [18, 'g/dL'],
      [11.5, 'mmol/L'],
    ];
    mockResults(
      values.map(([value, unit], i) =>
        createMockResult(i + 1, `2024-0${i + 1}-10`, [
          createMockTestValue(i + 1, i + 1, {
            biomarkerKey: '718-7',
            rawText: 'Hemoglobin',
            value,
            unit,
            status: 'high',
          }),
        ])
      )
    );
    const { result } = renderHook(() => useAlerts());

    const trend = alertsOf(result.current).find((a) => a.type === 'trend');
    expect(trend).toEqual(expect.objectContaining({ direction: 'increasing', unit: 'g/L' }));
  });

  it('reports an out-of-range value in the preferred unit', () => {
    mockUnitPreferences = { [GLUCOSE_KEY]: 'mmol/L' };
    mockResults([
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, {
          biomarkerKey: '2345-7',
          value: 120,
          status: 'high',
          referenceRangeLow: 70,
          referenceRangeHigh: 100,
        }),
      ]),
    ]);
    const { result } = renderHook(() => useAlerts());

    const alert = alertsOf(result.current).find((a) => a.type === 'out_of_range');
    expect(alert).toEqual(expect.objectContaining({ value: 6.66, unit: 'mmol/L' }));
    expect(alert?.message).toContain('Glucose is high at 6.66 mmol/L');
    expect(alert?.referenceRange?.high).toBe(5.55);
  });

  function mockResults(results: LabResultWithDetails[]): void {
    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });
  }

  it('should return empty alerts when no results', () => {
    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results: [],
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    const { result } = renderHook(() => useAlerts());

    expect(alertsOf(result.current)).toHaveLength(0);
    expect(result.current.unacknowledgedCount).toBe(0);
  });

  it('counts the values checked against a reference range', () => {
    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results: [
        createMockResult(1, '2026-01-01', [
          createMockTestValue(1, 1, { status: 'normal' }),
          createMockTestValue(2, 1, { status: 'unknown' as EnrichedTestValue['status'] }),
        ]),
      ],
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    const { result } = renderHook(() => useAlerts());

    expect(result.current.assessedCount).toBe(1);
  });

  it('should return loading state from useLabResults', () => {
    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results: [],
      isLoading: true,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    const { result } = renderHook(() => useAlerts());

    expect(result.current.isLoading).toBe(true);
  });

  it('should return error state from useLabResults', () => {
    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results: [],
      isLoading: false,
      error: 'Database error',
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    const { result } = renderHook(() => useAlerts());

    expect(result.current.error).toBe('Database error');
  });

  it('should generate alert for high value', () => {
    const testValue = createMockTestValue(1, 1, {
      value: 150,
      status: 'high',
      referenceRangeHigh: 100,
      rawText: 'Glucose',
    });

    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results: [createMockResult(1, '2024-01-15', [testValue])],
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    const { result } = renderHook(() => useAlerts());

    expect(alertsOf(result.current)).toHaveLength(1);
    expect(alertsOf(result.current)[0].status).toBe('high');
    expect(alertsOf(result.current)[0].type).toBe('out_of_range');
    expect(alertsOf(result.current)[0].message).toBe(
      'Glucose is high at 150 mg/dL (reference ≤ 100 mg/dL)'
    );
  });

  it('should generate alert for low value', () => {
    const testValue = createMockTestValue(1, 1, {
      value: 10,
      unit: 'g/dL',
      status: 'low',
      referenceRangeLow: 12,
      rawText: 'Hemoglobin',
      biomarkerKey: '718-7',
    });

    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results: [createMockResult(1, '2024-01-15', [testValue])],
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    const { result } = renderHook(() => useAlerts());

    expect(alertsOf(result.current)).toHaveLength(1);
    expect(alertsOf(result.current)[0].status).toBe('low');
    expect(alertsOf(result.current)[0].message).toBe(
      'Hemoglobin is low at 10 g/dL (reference ≥ 12 g/dL)'
    );
    expect(alertsOf(result.current)[0].severity).toBe('warning');
  });

  it('should not generate alert for normal values', () => {
    const testValue = createMockTestValue(1, 1, {
      value: 90,
      status: 'normal',
      referenceRangeLow: 70,
      referenceRangeHigh: 100,
    });

    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results: [createMockResult(1, '2024-01-15', [testValue])],
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    const { result } = renderHook(() => useAlerts());

    expect(alertsOf(result.current)).toHaveLength(0);
  });

  it('puts the card of a critical value first', () => {
    const results = [
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, {
          value: 110,
          status: 'high',
          referenceRangeHigh: 100,
          biomarkerKey: '2345-7',
        }),
      ]),
      createMockResult(2, '2024-01-20', [
        createMockTestValue(2, 2, {
          value: 200, // Very high - critical
          status: 'high',
          referenceRangeHigh: 100,
          biomarkerKey: '718-7',
          rawText: 'Different',
        }),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    const { result } = renderHook(() => useAlerts());

    expect(result.current.groups[0].severity).toBe('critical');
  });

  it("dismisses a test's card through its latest alert in the shared state", () => {
    mockResults([
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, { value: 150, status: 'high', referenceRangeHigh: 100 }),
      ]),
      createMockResult(2, '2024-03-10', [
        createMockTestValue(2, 2, { value: 140, status: 'high', referenceRangeHigh: 100 }),
      ]),
    ]);

    const { result } = renderHook(() => useAlerts());

    act(() => {
      result.current.dismissGroup(result.current.groups[0]);
    });

    expect(alertState.dismiss).toHaveBeenCalledWith(GLUCOSE_KEY, new Date('2024-03-10'));
  });

  it('leaves dismissed cards out, and out of the count', () => {
    mockResults([
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, { value: 150, status: 'high', referenceRangeHigh: 100 }),
      ]),
    ]);
    alertState.dismissedThrough = { [GLUCOSE_KEY]: new Date('2024-01-15') };

    const { result } = renderHook(() => useAlerts());

    expect(result.current.groups).toHaveLength(0);
    expect(result.current.unacknowledgedCount).toBe(0);
    expect(result.current.hiddenCount).toBe(1);
  });

  it('groups alerts by trend group', () => {
    // Glucose under its mass code, then under its molar code: one card
    mockResults([
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, { value: 130, status: 'high', referenceRangeHigh: 100 }),
      ]),
      createMockResult(2, '2024-02-15', [
        createMockTestValue(2, 2, {
          biomarkerKey: '14749-6',
          rawText: 'Glicemia',
          value: 7.5,
          unit: 'mmol/L',
          status: 'high',
          referenceRangeHigh: 5.6,
        }),
      ]),
    ]);

    const { result } = renderHook(() => useAlerts());

    expect(result.current.groups).toHaveLength(1);
    const [card] = result.current.groups;
    expect(card).toMatchObject({ biomarkerKey: GLUCOSE_KEY, resultCount: 2 });
    // In the unit Trends shows the test in, as the chart the card opens does
    expect(card.headline).toMatchObject({ biomarkerName: 'Glucose', value: 135, unit: 'mg/dL' });
  });

  it('should group alerts by biomarker', () => {
    const results = [
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, {
          value: 110,
          status: 'high',
          referenceRangeHigh: 100,
          biomarkerKey: '2345-7',
          rawText: 'Glucose',
        }),
      ]),
      createMockResult(2, '2024-01-20', [
        createMockTestValue(2, 2, {
          value: 115,
          status: 'high',
          referenceRangeHigh: 100,
          biomarkerKey: '2345-7',
          rawText: 'Glucose',
        }),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    const { result } = renderHook(() => useAlerts());

    expect(result.current.groups).toHaveLength(1);
    expect(result.current.groups[0].resultCount).toBe(2);
    expect(result.current.groups[0].headline.biomarkerName).toBe('Glucose');
  });

  it("gives each card its test's LOINC class", () => {
    const results = [
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, {
          value: 150,
          status: 'high',
          referenceRangeHigh: 100,
          biomarkerKey: '2345-7',
          rawText: 'Glucose',
        }),
        createMockTestValue(2, 1, {
          value: 10,
          status: 'low',
          referenceRangeLow: 12,
          biomarkerKey: '718-7',
          rawText: 'Hemoglobin',
        }),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    const { result } = renderHook(() => useAlerts());

    const categories = result.current.groups.map((g) => g.headline.category).sort();
    expect(categories).toEqual(['Chemistry', 'Hematology']);
  });

  it('should get alerts for specific biomarker', () => {
    const results = [
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, {
          value: 150,
          status: 'high',
          referenceRangeHigh: 100,
          biomarkerKey: '2345-7',
        }),
      ]),
      createMockResult(2, '2024-01-20', [
        createMockTestValue(2, 2, {
          value: 155,
          status: 'high',
          referenceRangeHigh: 100,
          biomarkerKey: '2345-7',
        }),
      ]),
      createMockResult(3, '2024-01-25', [
        createMockTestValue(3, 3, {
          value: 10,
          status: 'low',
          referenceRangeLow: 12,
          biomarkerKey: '718-7',
          rawText: 'Hemoglobin',
        }),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    const { result } = renderHook(() => useAlerts());

    const resultsFor = (key: string) =>
      result.current.groups.find((group) => group.biomarkerKey === key)?.resultCount;
    expect(resultsFor(GLUCOSE_KEY)).toBe(2);
    expect(resultsFor(HEMOGLOBIN_KEY)).toBe(1);
  });

  it('should detect improvement when value returns to normal', () => {
    const results = [
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, {
          value: 150,
          status: 'high',
          referenceRangeHigh: 100,
          biomarkerKey: '2345-7',
          rawText: 'Glucose',
        }),
      ]),
      createMockResult(2, '2024-01-20', [
        createMockTestValue(2, 2, {
          value: 95,
          status: 'normal',
          referenceRangeLow: 70,
          referenceRangeHigh: 100,
          biomarkerKey: '2345-7',
          rawText: 'Glucose',
        }),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    const { result } = renderHook(() => useAlerts());

    const improvementAlert = alertsOf(result.current).find((a) => a.type === 'improvement');
    expect(improvementAlert).toBeDefined();
    expect(improvementAlert?.severity).toBe('positive');
    expect(improvementAlert?.message).toBe('Improved: Glucose now within range');
  });

  it('should calculate critical severity for very high values', () => {
    const testValue = createMockTestValue(1, 1, {
      value: 200, // 100% over reference
      status: 'high',
      referenceRangeHigh: 100,
    });

    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results: [createMockResult(1, '2024-01-15', [testValue])],
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    const { result } = renderHook(() => useAlerts());

    expect(alertsOf(result.current)[0].severity).toBe('critical');
  });

  it('should not count improvement alerts in unacknowledgedCount', () => {
    const results = [
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, {
          value: 150,
          status: 'high',
          referenceRangeHigh: 100,
          biomarkerKey: '2345-7',
        }),
      ]),
      createMockResult(2, '2024-01-20', [
        createMockTestValue(2, 2, {
          value: 95,
          status: 'normal',
          referenceRangeLow: 70,
          referenceRangeHigh: 100,
          biomarkerKey: '2345-7',
        }),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    const { result } = renderHook(() => useAlerts());

    // Should only count the out_of_range alert, not the improvement
    const outOfRangeAlerts = alertsOf(result.current).filter((a) => a.type === 'out_of_range');
    expect(result.current.unacknowledgedCount).toBe(outOfRangeAlerts.length);
  });
  it('counts results acknowledged through their date as not new, and newer ones as new', async () => {
    alertState.acknowledgedThrough = { [GLUCOSE_KEY]: new Date('2024-02-01') };
    mockResults([
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, { value: 150, status: 'high', referenceRangeHigh: 100 }),
      ]),
      createMockResult(2, '2024-03-10', [
        createMockTestValue(2, 2, { value: 140, status: 'high', referenceRangeHigh: 100 }),
      ]),
    ]);

    const { result } = renderHook(() => useAlerts());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.groups[0].resultCount).toBe(2);
    expect(result.current.groups[0].newCount).toBe(1);
    expect(result.current.unacknowledgedCount).toBe(1);
  });

  it('heads a group with its latest alert, not its most severe', async () => {
    mockResults([
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, { value: 300, status: 'high', referenceRangeHigh: 100 }),
      ]),
      createMockResult(2, '2024-03-10', [
        createMockTestValue(2, 2, { value: 110, status: 'high', referenceRangeHigh: 100 }),
      ]),
    ]);

    const { result } = renderHook(() => useAlerts());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const group = result.current.groups[0];
    expect(group.severity).toBe('critical');
    expect(group.headline.date.toISOString().slice(0, 10)).toBe('2024-03-10');
  });

  it('counts the cards acknowledgements hide', async () => {
    alertState.acknowledgedThrough = { [GLUCOSE_KEY]: new Date('2024-02-01') };
    mockResults([
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, { value: 150, status: 'high', referenceRangeHigh: 100 }),
      ]),
    ]);

    const { result } = renderHook(() => useAlerts());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.groups).toEqual([]);
    expect(result.current.hiddenCount).toBe(1);
  });

  it('gives each abnormal value its own alert id, even within one lab result', async () => {
    mockResults([
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, { value: 150, status: 'high', referenceRangeHigh: 100 }),
        createMockTestValue(2, 1, { value: 160, status: 'high', referenceRangeHigh: 100 }),
      ]),
    ]);

    const { result } = renderHook(() => useAlerts());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const ids = alertsOf(result.current).map((a) => a.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("acknowledging a card records its test through the test's latest alert", async () => {
    mockResults([
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, { value: 150, status: 'high', referenceRangeHigh: 100 }),
      ]),
      createMockResult(2, '2024-03-10', [
        createMockTestValue(2, 2, { value: 140, status: 'high', referenceRangeHigh: 100 }),
      ]),
    ]);

    const { result } = renderHook(() => useAlerts());
    await waitFor(() => expect(result.current.groups).toHaveLength(1));

    await result.current.acknowledgeGroup(result.current.groups[0]);

    expect(alertState.acknowledge).toHaveBeenCalledWith(GLUCOSE_KEY, new Date('2024-03-10'));
  });

  it('raises a trend alert for four consecutive decreasing values', async () => {
    mockResults(
      [11.5, 11.0, 10.5, 10.0].map((value, i) =>
        createMockResult(i + 1, `2024-0${i + 1}-10`, [
          createMockTestValue(i + 1, i + 1, {
            value,
            unit: 'g/dL',
            status: 'low',
            referenceRangeLow: 12,
            rawText: 'Hemoglobin',
          }),
        ])
      )
    );

    const { result } = renderHook(() => useAlerts());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const trend = alertsOf(result.current).find((a) => a.type === 'trend');
    expect(trend).toMatchObject({ direction: 'decreasing', severity: 'warning' });
    expect(trend?.message).toBe('Consistently decreasing over 3 months (Jan–Apr 2024)');
  });

  it('raises a trend for values that share a unit the display unit cannot convert', async () => {
    // e.g. TSH in mUI/L on Italian reports: listed, but with no conversion
    mockResults(
      [110, 120, 130, 140].map((value, i) =>
        createMockResult(i + 1, `2024-0${i + 1}-10`, [
          createMockTestValue(i + 1, i + 1, {
            value,
            unit: 'mUI/dL',
            status: 'high',
            referenceRangeHigh: 100,
            biomarkerKey: '2345-7',
            rawText: 'Glucose',
          }),
        ])
      )
    );

    const { result } = renderHook(() => useAlerts());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const trend = alertsOf(result.current).find((a) => a.type === 'trend');
    expect(trend).toMatchObject({ direction: 'increasing' });
  });

  it("reads a trend on the line Trends draws the latest value on, apart from values on a line of their own", () => {
    // An early value in a unit glucose does not convert to is on a line of its own
    mockResults([
      createMockResult(9, '2023-12-10', [
        createMockTestValue(9, 9, { value: 3, unit: 'mg/g', status: 'high', referenceRangeHigh: 2 }),
      ]),
      ...[110, 120, 130, 140].map((value, i) =>
        createMockResult(i + 1, `2024-0${i + 1}-10`, [
          createMockTestValue(i + 1, i + 1, { value, status: 'high', referenceRangeHigh: 100 }),
        ])
      ),
    ]);

    const { result } = renderHook(() => useAlerts());

    const trend = alertsOf(result.current).find((a) => a.type === 'trend');
    expect(trend).toMatchObject({ direction: 'increasing', value: 140, unit: 'mg/dL', testValueId: 4 });
    // Each alert names the value it is about, so Trends opens the line it is on
    const own = alertsOf(result.current).find((a) => a.unit === 'mg/g');
    expect(own).toMatchObject({ type: 'out_of_range', testValueId: 9 });
  });

  it('does not raise a trend alert for only three consecutive values', () => {
    mockResults(
      [11.0, 10.5, 10.0].map((value, i) =>
        createMockResult(i + 1, `2024-0${i + 1}-10`, [
          createMockTestValue(i + 1, i + 1, { value, status: 'low', referenceRangeLow: 12 }),
        ])
      )
    );

    const { result } = renderHook(() => useAlerts());

    expect(alertsOf(result.current).some((a) => a.type === 'trend')).toBe(false);
  });

  it('raises an improvement alert when the latest value is back in range', async () => {
    mockResults([
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, { value: 180, status: 'high', referenceRangeHigh: 100 }),
      ]),
      createMockResult(2, '2024-02-15', [
        createMockTestValue(2, 2, {
          value: 95,
          status: 'normal',
          referenceRangeLow: 70,
          referenceRangeHigh: 100,
          rawText: 'Glucose',
        }),
      ]),
    ]);

    const { result } = renderHook(() => useAlerts());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const improvement = alertsOf(result.current).find((a) => a.type === 'improvement');
    expect(improvement?.message).toBe('Improved: Glucose now within range');
    expect(improvement?.severity).toBe('positive');
  });

  it('rates values under 50% beyond the bound as warning', () => {
    mockResults([
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, { value: 105, status: 'high', referenceRangeHigh: 100 }),
      ]),
    ]);

    const { result } = renderHook(() => useAlerts());

    expect(alertsOf(result.current)[0].severity).toBe('warning');
  });

  it('returns refresh from the lab results', () => {
    const refresh = vi.fn();
    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results: [],
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh,
      deleteResult: vi.fn(),
    });

    const { result } = renderHook(() => useAlerts());

    expect(result.current.refresh).toBe(refresh);
  });
  it('does not raise a trend alert when the latest value is within range', () => {
    mockResults(
      [80, 85, 90, 95].map((value, i) =>
        createMockResult(i + 1, `2024-0${i + 1}-10`, [
          createMockTestValue(i + 1, i + 1, {
            value,
            status: 'normal',
            referenceRangeLow: 70,
            referenceRangeHigh: 100,
          }),
        ])
      )
    );

    const { result } = renderHook(() => useAlerts());

    expect(alertsOf(result.current)).toHaveLength(0);
    expect(result.current.unacknowledgedCount).toBe(0);
  });

  it('counts only out-of-range values, not the trend they form', () => {
    mockResults(
      [110, 120, 130, 140].map((value, i) =>
        createMockResult(i + 1, `2024-0${i + 1}-10`, [
          createMockTestValue(i + 1, i + 1, { value, status: 'high', referenceRangeHigh: 100 }),
        ])
      )
    );

    const { result } = renderHook(() => useAlerts());

    expect(alertsOf(result.current).some((a) => a.type === 'trend')).toBe(true);
    expect(result.current.unacknowledgedCount).toBe(4);
    expect(result.current.groups[0].newCount).toBe(4);
  });

  it('compares trend values in one unit', () => {
    // 7.5 mmol/L is about 135 mg/dL: converted, the values fall then rise
    mockResults([
      createMockResult(1, '2024-01-10', [
        createMockTestValue(1, 1, { value: 7.5, unit: 'mmol/L', status: 'high', referenceRangeHigh: 5.6 }),
      ]),
      ...[120, 121, 122].map((value, i) =>
        createMockResult(i + 2, `2024-0${i + 2}-10`, [
          createMockTestValue(i + 2, i + 2, { value, status: 'high', referenceRangeHigh: 100 }),
        ])
      ),
    ]);

    const { result } = renderHook(() => useAlerts());

    expect(alertsOf(result.current).some((a) => a.type === 'trend')).toBe(false);
  });
  it("records the test's latest status, though no improvement alert is raised", () => {
    mockResults([
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, { value: 150, status: 'high', referenceRangeHigh: 100 }),
      ]),
      createMockResult(2, '2024-02-15', [
        createMockTestValue(2, 2, { value: 90, status: 'normal', referenceRangeHigh: 100 }),
      ]),
      createMockResult(3, '2024-03-15', [
        createMockTestValue(3, 3, { value: 92, status: 'normal', referenceRangeHigh: 100 }),
      ]),
    ]);

    const { result } = renderHook(() => useAlerts());

    expect(result.current.groups[0].headline.type).toBe('out_of_range');
    expect(result.current.groups[0].headline.latestStatus).toBe('normal');
  });

  it('does not call a test back in range while its latest value is out of range', () => {
    mockResults([
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, { value: 150, status: 'high', referenceRangeHigh: 100 }),
      ]),
    ]);

    const { result } = renderHook(() => useAlerts());

    expect(result.current.groups[0].headline.latestStatus).toBe('high');
  });
  it('reads a day with an out-of-range value as out of range, whatever the order', () => {
    mockResults([
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, { value: 150, status: 'high', referenceRangeHigh: 100 }),
      ]),
      createMockResult(2, '2024-05-20', [
        createMockTestValue(2, 2, { value: 95, status: 'normal', referenceRangeHigh: 100 }),
        createMockTestValue(3, 2, { value: 130, status: 'high', referenceRangeHigh: 100 }),
      ]),
    ]);

    const { result } = renderHook(() => useAlerts());

    expect(alertsOf(result.current).some((a) => a.type === 'improvement')).toBe(false);
    expect(result.current.groups[0].headline.latestStatus).toBe('high');
  });
});
