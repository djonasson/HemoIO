/**
 * Tests for useAlerts hook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAlerts } from './useAlerts';
import { useLabResults } from './useLabResults';
import type { LabResultWithDetails, EnrichedTestValue } from './useLabResults';

// Mock useLabResults
vi.mock('./useLabResults', () => ({
  useLabResults: vi.fn(),
}));

const alertState = {
  acknowledgedThrough: {} as Record<string, Date>,
  dismissedIds: new Set<string>() as ReadonlySet<string>,
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

// Mock biomarker dictionary
vi.mock('@data/biomarkers/dictionary', () => {
  const mock = {
  findBiomarker: vi.fn((name: string) => {
    if (name === 'Glucose' || name.toLowerCase().includes('glucose')) {
      return {
        name: 'Glucose',
        category: 'metabolic',
        canonicalUnit: 'mg/dL',
        alternativeUnits: ['mmol/L'],
      };
    }
    if (name === 'Hemoglobin' || name.toLowerCase().includes('hemoglobin')) {
      return { name: 'Hemoglobin', category: 'cbc' };
    }
    return null;
  }),
  };
  return {
    ...mock,
    // Test data uses arbitrary IDs, so biomarkers are identified by rawText
    getBiomarkerByKey: () => undefined,
    getBiomarkerForTestValue: (tv: { rawText?: string }) => mock.findBiomarker(tv.rawText ?? ''),
  };
});

function createMockTestValue(
  id: number,
  labResultId: number,
  options: Partial<EnrichedTestValue> = {}
): EnrichedTestValue {
  return {
    id,
    labResultId,
    biomarkerKey: options.biomarkerKey || 'marker-1',
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

describe('useAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    alertState.acknowledgedThrough = {};
    alertState.dismissedIds = new Set();
    mockUnitPreferences = {};
  });

  it('reports an out-of-range value in the preferred unit', () => {
    mockUnitPreferences = { glucose: 'mmol/L' };
    mockResults([
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, {
          biomarkerKey: 'glucose',
          value: 120,
          status: 'high',
          referenceRangeLow: 70,
          referenceRangeHigh: 100,
        }),
      ]),
    ]);
    const { result } = renderHook(() => useAlerts());

    const alert = result.current.alerts.find((a) => a.type === 'out_of_range');
    expect(alert).toEqual(expect.objectContaining({ value: 6.66, unit: 'mmol/L' }));
    expect(alert?.message).toContain('Glucose is high at 6.66 mmol/L');
    expect(alert?.referenceRange?.high).toBe(5.55);
  });

  function mockResults(results: LabResultWithDetails[]): void {
    vi.mocked(useLabResults).mockReturnValue({
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
      results: [],
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    const { result } = renderHook(() => useAlerts());

    expect(result.current.alerts).toHaveLength(0);
    expect(result.current.unacknowledgedCount).toBe(0);
  });

  it('should return loading state from useLabResults', () => {
    vi.mocked(useLabResults).mockReturnValue({
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
      results: [createMockResult(1, '2024-01-15', [testValue])],
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    const { result } = renderHook(() => useAlerts());

    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0].status).toBe('high');
    expect(result.current.alerts[0].type).toBe('out_of_range');
    expect(result.current.alerts[0].message).toBe(
      'Glucose is high at 150 mg/dL (reference ≤ 100 mg/dL)'
    );
  });

  it('should generate alert for low value', () => {
    const testValue = createMockTestValue(1, 1, {
      value: 10,
      status: 'low',
      referenceRangeLow: 12,
      rawText: 'Hemoglobin',
      biomarkerKey: 'marker-2',
    });

    vi.mocked(useLabResults).mockReturnValue({
      results: [createMockResult(1, '2024-01-15', [testValue])],
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    const { result } = renderHook(() => useAlerts());

    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0].status).toBe('low');
    expect(result.current.alerts[0].message).toBe(
      'Hemoglobin is low at 10 mg/dL (reference ≥ 12 mg/dL)'
    );
    expect(result.current.alerts[0].severity).toBe('warning');
  });

  it('should not generate alert for normal values', () => {
    const testValue = createMockTestValue(1, 1, {
      value: 90,
      status: 'normal',
      referenceRangeLow: 70,
      referenceRangeHigh: 100,
    });

    vi.mocked(useLabResults).mockReturnValue({
      results: [createMockResult(1, '2024-01-15', [testValue])],
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    const { result } = renderHook(() => useAlerts());

    expect(result.current.alerts).toHaveLength(0);
  });

  it('should sort alerts by severity then date', () => {
    const results = [
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, {
          value: 110,
          status: 'high',
          referenceRangeHigh: 100,
          biomarkerKey: 'marker-1',
        }),
      ]),
      createMockResult(2, '2024-01-20', [
        createMockTestValue(2, 2, {
          value: 200, // Very high - critical
          status: 'high',
          referenceRangeHigh: 100,
          biomarkerKey: 'marker-2',
          rawText: 'Different',
        }),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
      results,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    const { result } = renderHook(() => useAlerts());

    // Critical should come first
    expect(result.current.alerts[0].severity).toBe('critical');
  });

  it('should dismiss alert through the shared state', () => {
    mockResults([
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, { value: 150, status: 'high', referenceRangeHigh: 100 }),
      ]),
    ]);

    const { result } = renderHook(() => useAlerts());
    const alertId = result.current.alerts[0].id;

    act(() => {
      result.current.dismissAlert(alertId);
    });

    expect(alertState.dismiss).toHaveBeenCalledWith(alertId);
  });

  it('should not return dismissed alerts', () => {
    mockResults([
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, { value: 150, status: 'high', referenceRangeHigh: 100 }),
      ]),
    ]);
    const { result: before } = renderHook(() => useAlerts());
    alertState.dismissedIds = new Set([before.current.alerts[0].id]);

    const { result } = renderHook(() => useAlerts());

    expect(result.current.alerts).toHaveLength(0);
  });

  it('should group alerts by biomarker', () => {
    const results = [
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, {
          value: 110,
          status: 'high',
          referenceRangeHigh: 100,
          biomarkerKey: 'marker-1',
          rawText: 'Glucose',
        }),
      ]),
      createMockResult(2, '2024-01-20', [
        createMockTestValue(2, 2, {
          value: 115,
          status: 'high',
          referenceRangeHigh: 100,
          biomarkerKey: 'marker-1',
          rawText: 'Glucose',
        }),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
      results,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    const { result } = renderHook(() => useAlerts());

    expect(result.current.groupedAlerts).toHaveLength(1);
    expect(result.current.groupedAlerts[0].alerts).toHaveLength(2);
    expect(result.current.groupedAlerts[0].biomarkerName).toBe('Glucose');
  });

  it('should filter by category', () => {
    const results = [
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, {
          value: 150,
          status: 'high',
          referenceRangeHigh: 100,
          biomarkerKey: 'marker-1',
          rawText: 'Glucose',
        }),
        createMockTestValue(2, 1, {
          value: 10,
          status: 'low',
          referenceRangeLow: 12,
          biomarkerKey: 'marker-2',
          rawText: 'Hemoglobin',
        }),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
      results,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    const { result } = renderHook(() => useAlerts());

    const metabolicAlerts = result.current.filterByCategory('metabolic');
    expect(metabolicAlerts).toHaveLength(1);
    expect(metabolicAlerts[0].category).toBe('metabolic');

    const cbcAlerts = result.current.filterByCategory('cbc');
    expect(cbcAlerts).toHaveLength(1);
    expect(cbcAlerts[0].category).toBe('cbc');
  });

  it('should get alerts for specific biomarker', () => {
    const results = [
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, {
          value: 150,
          status: 'high',
          referenceRangeHigh: 100,
          biomarkerKey: 'marker-1',
        }),
      ]),
      createMockResult(2, '2024-01-20', [
        createMockTestValue(2, 2, {
          value: 155,
          status: 'high',
          referenceRangeHigh: 100,
          biomarkerKey: 'marker-1',
        }),
      ]),
      createMockResult(3, '2024-01-25', [
        createMockTestValue(3, 3, {
          value: 10,
          status: 'low',
          referenceRangeLow: 12,
          biomarkerKey: 'marker-2',
          rawText: 'Hemoglobin',
        }),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
      results,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    const { result } = renderHook(() => useAlerts());

    const biomarker1Alerts = result.current.getAlertsForBiomarker('marker-1');
    expect(biomarker1Alerts).toHaveLength(2);

    const biomarker2Alerts = result.current.getAlertsForBiomarker('marker-2');
    expect(biomarker2Alerts).toHaveLength(1);
  });

  it('should detect improvement when value returns to normal', () => {
    const results = [
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, {
          value: 150,
          status: 'high',
          referenceRangeHigh: 100,
          biomarkerKey: 'marker-1',
          rawText: 'Glucose',
        }),
      ]),
      createMockResult(2, '2024-01-20', [
        createMockTestValue(2, 2, {
          value: 95,
          status: 'normal',
          referenceRangeLow: 70,
          referenceRangeHigh: 100,
          biomarkerKey: 'marker-1',
          rawText: 'Glucose',
        }),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
      results,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    const { result } = renderHook(() => useAlerts());

    const improvementAlert = result.current.alerts.find((a) => a.type === 'improvement');
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
      results: [createMockResult(1, '2024-01-15', [testValue])],
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    const { result } = renderHook(() => useAlerts());

    expect(result.current.alerts[0].severity).toBe('critical');
  });

  it('should not count improvement alerts in unacknowledgedCount', () => {
    const results = [
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, {
          value: 150,
          status: 'high',
          referenceRangeHigh: 100,
          biomarkerKey: 'marker-1',
        }),
      ]),
      createMockResult(2, '2024-01-20', [
        createMockTestValue(2, 2, {
          value: 95,
          status: 'normal',
          referenceRangeLow: 70,
          referenceRangeHigh: 100,
          biomarkerKey: 'marker-1',
        }),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
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
    const outOfRangeAlerts = result.current.alerts.filter((a) => a.type === 'out_of_range');
    expect(result.current.unacknowledgedCount).toBe(outOfRangeAlerts.length);
  });
  it('hides alerts of a biomarker acknowledged through their date, but not newer ones', async () => {
    alertState.acknowledgedThrough = { 'marker-1': new Date('2024-02-01') };
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

    const dates = result.current.alerts.map((a) => a.date.toISOString().slice(0, 10));
    expect(dates).toEqual(['2024-03-10']);
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

    const ids = result.current.alerts.map((a) => a.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('acknowledging an alert records its biomarker and date in the shared state', async () => {
    mockResults([
      createMockResult(1, '2024-03-10', [
        createMockTestValue(1, 1, { value: 150, status: 'high', referenceRangeHigh: 100 }),
      ]),
    ]);

    const { result } = renderHook(() => useAlerts());
    await waitFor(() => expect(result.current.alerts).toHaveLength(1));

    await result.current.acknowledgeAlert(result.current.alerts[0].id);

    expect(alertState.acknowledge).toHaveBeenCalledWith('marker-1', result.current.alerts[0].date);
  });

  it('raises a trend alert for four consecutive decreasing values', async () => {
    mockResults(
      [11.5, 11.0, 10.5, 10.0].map((value, i) =>
        createMockResult(i + 1, `2024-0${i + 1}-10`, [
          createMockTestValue(i + 1, i + 1, {
            value,
            status: 'low',
            referenceRangeLow: 12,
            rawText: 'Hemoglobin',
          }),
        ])
      )
    );

    const { result } = renderHook(() => useAlerts());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const trend = result.current.alerts.find((a) => a.type === 'trend');
    expect(trend).toMatchObject({ direction: 'decreasing', severity: 'warning' });
    expect(trend?.message).toBe('Consistently decreasing over 3 months (Jan–Apr 2024)');
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

    expect(result.current.alerts.some((a) => a.type === 'trend')).toBe(false);
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

    const improvement = result.current.alerts.find((a) => a.type === 'improvement');
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

    expect(result.current.alerts[0].severity).toBe('warning');
  });

  it('returns refresh from the lab results', () => {
    const refresh = vi.fn();
    vi.mocked(useLabResults).mockReturnValue({
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

    expect(result.current.alerts).toHaveLength(0);
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

    expect(result.current.alerts.some((a) => a.type === 'trend')).toBe(true);
    expect(result.current.unacknowledgedCount).toBe(4);
    expect(result.current.groupedAlerts[0].unacknowledgedCount).toBe(4);
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

    expect(result.current.alerts.some((a) => a.type === 'trend')).toBe(false);
  });
});
