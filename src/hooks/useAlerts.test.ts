/**
 * Tests for useAlerts hook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAlerts } from './useAlerts';
import { useLabResults } from './useLabResults';
import type { LabResultWithDetails, EnrichedTestValue } from './useLabResults';

// Mock useLabResults
vi.mock('./useLabResults', () => ({
  useLabResults: vi.fn(),
}));

// Mock biomarker dictionary
vi.mock('@data/biomarkers/dictionary', () => ({
  findBiomarker: vi.fn((name: string) => {
    if (name === 'Glucose' || name.toLowerCase().includes('glucose')) {
      return { name: 'Glucose', category: 'metabolic' };
    }
    if (name === 'Hemoglobin' || name.toLowerCase().includes('hemoglobin')) {
      return { name: 'Hemoglobin', category: 'cbc' };
    }
    return null;
  }),
}));

function createMockTestValue(
  id: number,
  labResultId: number,
  options: Partial<EnrichedTestValue> = {}
): EnrichedTestValue {
  return {
    id,
    labResultId,
    biomarkerId: options.biomarkerId || 1,
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
  });

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
    expect(result.current.alerts[0].message).toContain('elevated');
  });

  it('should generate alert for low value', () => {
    const testValue = createMockTestValue(1, 1, {
      value: 10,
      status: 'low',
      referenceRangeLow: 12,
      rawText: 'Hemoglobin',
      biomarkerId: 2,
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
    expect(result.current.alerts[0].message).toContain('low');
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
          biomarkerId: 1,
        }),
      ]),
      createMockResult(2, '2024-01-20', [
        createMockTestValue(2, 2, {
          value: 200, // Very high - critical
          status: 'high',
          referenceRangeHigh: 100,
          biomarkerId: 2,
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

  it('should dismiss alert', () => {
    const testValue = createMockTestValue(1, 1, {
      value: 150,
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

    expect(result.current.alerts).toHaveLength(1);
    const alertId = result.current.alerts[0].id;

    act(() => {
      result.current.dismissAlert(alertId);
    });

    expect(result.current.alerts).toHaveLength(0);
  });

  it('should acknowledge alert', () => {
    const testValue = createMockTestValue(1, 1, {
      value: 150,
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

    const alertId = result.current.alerts[0].id;
    expect(result.current.alerts[0].acknowledged).toBe(false);

    act(() => {
      result.current.acknowledgeAlert(alertId);
    });

    expect(result.current.alerts[0].acknowledged).toBe(true);
  });

  it('should group alerts by biomarker', () => {
    const results = [
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, {
          value: 110,
          status: 'high',
          referenceRangeHigh: 100,
          biomarkerId: 1,
          rawText: 'Glucose',
        }),
      ]),
      createMockResult(2, '2024-01-20', [
        createMockTestValue(2, 2, {
          value: 115,
          status: 'high',
          referenceRangeHigh: 100,
          biomarkerId: 1,
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
          biomarkerId: 1,
          rawText: 'Glucose',
        }),
        createMockTestValue(2, 1, {
          value: 10,
          status: 'low',
          referenceRangeLow: 12,
          biomarkerId: 2,
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
          biomarkerId: 1,
        }),
      ]),
      createMockResult(2, '2024-01-20', [
        createMockTestValue(2, 2, {
          value: 155,
          status: 'high',
          referenceRangeHigh: 100,
          biomarkerId: 1,
        }),
      ]),
      createMockResult(3, '2024-01-25', [
        createMockTestValue(3, 3, {
          value: 10,
          status: 'low',
          referenceRangeLow: 12,
          biomarkerId: 2,
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

    const biomarker1Alerts = result.current.getAlertsForBiomarker(1);
    expect(biomarker1Alerts).toHaveLength(2);

    const biomarker2Alerts = result.current.getAlertsForBiomarker(2);
    expect(biomarker2Alerts).toHaveLength(1);
  });

  it('should clear dismissed alerts', () => {
    const testValue = createMockTestValue(1, 1, {
      value: 150,
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

    const alertId = result.current.alerts[0].id;

    act(() => {
      result.current.dismissAlert(alertId);
    });

    expect(result.current.alerts).toHaveLength(0);

    act(() => {
      result.current.clearDismissed();
    });

    expect(result.current.alerts).toHaveLength(1);
  });

  it('should detect improvement when value returns to normal', () => {
    const results = [
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, {
          value: 150,
          status: 'high',
          referenceRangeHigh: 100,
          biomarkerId: 1,
          rawText: 'Glucose',
        }),
      ]),
      createMockResult(2, '2024-01-20', [
        createMockTestValue(2, 2, {
          value: 95,
          status: 'normal',
          referenceRangeLow: 70,
          referenceRangeHigh: 100,
          biomarkerId: 1,
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
    expect(improvementAlert?.message).toContain('returned to normal');
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
          biomarkerId: 1,
        }),
      ]),
      createMockResult(2, '2024-01-20', [
        createMockTestValue(2, 2, {
          value: 95,
          status: 'normal',
          referenceRangeLow: 70,
          referenceRangeHigh: 100,
          biomarkerId: 1,
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
});
