/**
 * Tests for useLabResults hook
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useLabResults } from './useLabResults';
import type { LabResult, TestValue } from '@/types';

// Mock useEncryptedDb
vi.mock('./useEncryptedDb', () => ({
  useEncryptedDb: vi.fn(),
}));

import { useEncryptedDb } from './useEncryptedDb';

// Sample test data
const mockLabResults: LabResult[] = [
  {
    id: 1,
    date: new Date('2024-01-15'),
    labName: 'Quest Diagnostics',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 2,
    date: new Date('2024-03-20'),
    labName: 'LabCorp',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 3,
    date: new Date('2024-06-10'),
    labName: 'Quest Diagnostics',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const mockTestValues: Record<number, TestValue[]> = {
  1: [
    {
      id: 1,
      labResultId: 1,
      biomarkerId: 1,
      value: 14.5,
      unit: 'g/dL',
      referenceRangeLow: 12.0,
      referenceRangeHigh: 17.5,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      labResultId: 1,
      biomarkerId: 2,
      value: 125,
      unit: 'mg/dL',
      referenceRangeLow: 70,
      referenceRangeHigh: 100,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
  2: [
    {
      id: 3,
      labResultId: 2,
      biomarkerId: 1,
      value: 11.0,
      unit: 'g/dL',
      referenceRangeLow: 12.0,
      referenceRangeHigh: 17.5,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
  3: [],
};

function createMockDb() {
  return {
    getAllLabResults: vi.fn().mockResolvedValue(mockLabResults),
    getTestValuesByLabResult: vi.fn((id: number) =>
      Promise.resolve(mockTestValues[id] || [])
    ),
    deleteLabResult: vi.fn().mockResolvedValue(undefined),
  };
}

describe('useLabResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty results when not authenticated', async () => {
    vi.mocked(useEncryptedDb).mockReturnValue({
      db: null,
      isReady: false,
    });

    const { result } = renderHook(() => useLabResults());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.results).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('should fetch and enrich lab results when authenticated', async () => {
    const mockDb = createMockDb();
    vi.mocked(useEncryptedDb).mockReturnValue({
      db: mockDb as any,
      isReady: true,
    });

    const { result } = renderHook(() => useLabResults());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.results).toHaveLength(3);
    expect(mockDb.getAllLabResults).toHaveBeenCalled();
  });

  it('should sort results by date (newest first)', async () => {
    const mockDb = createMockDb();
    vi.mocked(useEncryptedDb).mockReturnValue({
      db: mockDb as any,
      isReady: true,
    });

    const { result } = renderHook(() => useLabResults());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const dates = result.current.results.map((r) => r.date.toISOString());
    expect(dates[0]).toBe(new Date('2024-06-10').toISOString());
    expect(dates[1]).toBe(new Date('2024-03-20').toISOString());
    expect(dates[2]).toBe(new Date('2024-01-15').toISOString());
  });

  it('should calculate abnormal counts correctly', async () => {
    const mockDb = createMockDb();
    vi.mocked(useEncryptedDb).mockReturnValue({
      db: mockDb as any,
      isReady: true,
    });

    const { result } = renderHook(() => useLabResults());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Find result with id 1 (has one high value - glucose at 125)
    const result1 = result.current.results.find((r) => r.id === 1);
    expect(result1?.abnormalCount).toBe(1);
    expect(result1?.totalCount).toBe(2);

    // Find result with id 2 (has one low value - hemoglobin at 11.0)
    const result2 = result.current.results.find((r) => r.id === 2);
    expect(result2?.abnormalCount).toBe(1);
    expect(result2?.totalCount).toBe(1);
  });

  it('should set test value status correctly', async () => {
    const mockDb = createMockDb();
    vi.mocked(useEncryptedDb).mockReturnValue({
      db: mockDb as any,
      isReady: true,
    });

    const { result } = renderHook(() => useLabResults());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const result1 = result.current.results.find((r) => r.id === 1);
    const testValues = result1?.testValues || [];

    // Hemoglobin 14.5 with range 12.0-17.5 should be normal
    expect(testValues[0].status).toBe('normal');

    // Glucose 125 with range 70-100 should be high
    expect(testValues[1].status).toBe('high');

    const result2 = result.current.results.find((r) => r.id === 2);
    const testValues2 = result2?.testValues || [];

    // Hemoglobin 11.0 with range 12.0-17.5 should be low
    expect(testValues2[0].status).toBe('low');
  });

  it('should filter by date range', async () => {
    const mockDb = createMockDb();
    vi.mocked(useEncryptedDb).mockReturnValue({
      db: mockDb as any,
      isReady: true,
    });

    const { result } = renderHook(() => useLabResults());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Apply date filter
    act(() => {
      result.current.setFilters({
        startDate: new Date('2024-03-01'),
        endDate: new Date('2024-07-01'),
      });
    });

    // Should only show March and June results
    expect(result.current.results).toHaveLength(2);
    expect(result.current.results.map((r) => r.id)).toEqual([3, 2]);
  });

  it('should filter by search term (lab name)', async () => {
    const mockDb = createMockDb();
    vi.mocked(useEncryptedDb).mockReturnValue({
      db: mockDb as any,
      isReady: true,
    });

    const { result } = renderHook(() => useLabResults());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Apply search filter
    act(() => {
      result.current.setFilters({
        searchTerm: 'Quest',
      });
    });

    // Should only show Quest Diagnostics results
    expect(result.current.results).toHaveLength(2);
    expect(result.current.results.every((r) => r.labName === 'Quest Diagnostics')).toBe(true);
  });

  it('should filter case-insensitively', async () => {
    const mockDb = createMockDb();
    vi.mocked(useEncryptedDb).mockReturnValue({
      db: mockDb as any,
      isReady: true,
    });

    const { result } = renderHook(() => useLabResults());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Apply search filter with different case
    act(() => {
      result.current.setFilters({
        searchTerm: 'quest',
      });
    });

    // Should still match Quest Diagnostics
    expect(result.current.results).toHaveLength(2);
  });

  it('should delete a result', async () => {
    const mockDb = createMockDb();
    vi.mocked(useEncryptedDb).mockReturnValue({
      db: mockDb as any,
      isReady: true,
    });

    const { result } = renderHook(() => useLabResults());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.results).toHaveLength(3);

    // Delete result with id 1
    await act(async () => {
      await result.current.deleteResult(1);
    });

    expect(mockDb.deleteLabResult).toHaveBeenCalledWith(1);
    expect(result.current.results).toHaveLength(2);
    expect(result.current.results.find((r) => r.id === 1)).toBeUndefined();
  });

  it('should handle errors during fetch', async () => {
    const mockDb = createMockDb();
    mockDb.getAllLabResults.mockRejectedValue(new Error('Database error'));
    vi.mocked(useEncryptedDb).mockReturnValue({
      db: mockDb as any,
      isReady: true,
    });

    const { result } = renderHook(() => useLabResults());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Database error');
    expect(result.current.results).toEqual([]);
  });

  it('should handle errors during delete', async () => {
    const mockDb = createMockDb();
    mockDb.deleteLabResult.mockRejectedValue(new Error('Delete failed'));
    vi.mocked(useEncryptedDb).mockReturnValue({
      db: mockDb as any,
      isReady: true,
    });

    const { result } = renderHook(() => useLabResults());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await expect(
      act(async () => {
        await result.current.deleteResult(1);
      })
    ).rejects.toThrow('Delete failed');
  });

  it('should refresh data when called', async () => {
    const mockDb = createMockDb();
    vi.mocked(useEncryptedDb).mockReturnValue({
      db: mockDb as any,
      isReady: true,
    });

    const { result } = renderHook(() => useLabResults());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Clear mock calls
    mockDb.getAllLabResults.mockClear();

    // Call refresh
    await act(async () => {
      await result.current.refresh();
    });

    expect(mockDb.getAllLabResults).toHaveBeenCalled();
  });

  it('should return unknown status when no reference range', async () => {
    const mockDbWithNoRange = createMockDb();
    mockDbWithNoRange.getTestValuesByLabResult.mockResolvedValue([
      {
        id: 1,
        labResultId: 1,
        biomarkerId: 1,
        value: 14.5,
        unit: 'g/dL',
        // No reference range
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    vi.mocked(useEncryptedDb).mockReturnValue({
      db: mockDbWithNoRange as any,
      isReady: true,
    });

    const { result } = renderHook(() => useLabResults());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const testValue = result.current.results[0]?.testValues[0];
    expect(testValue?.status).toBe('unknown');
  });

  it('should return unknown status for non-numeric values', async () => {
    const mockDbWithString = createMockDb();
    mockDbWithString.getTestValuesByLabResult.mockResolvedValue([
      {
        id: 1,
        labResultId: 1,
        biomarkerId: 1,
        value: 'Positive',
        unit: '',
        referenceRangeLow: 0,
        referenceRangeHigh: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    vi.mocked(useEncryptedDb).mockReturnValue({
      db: mockDbWithString as any,
      isReady: true,
    });

    const { result } = renderHook(() => useLabResults());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const testValue = result.current.results[0]?.testValues[0];
    expect(testValue?.status).toBe('unknown');
  });
});
