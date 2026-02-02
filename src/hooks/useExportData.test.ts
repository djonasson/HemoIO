/**
 * Tests for useExportData hook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useExportData } from './useExportData';

// Mock useEncryptedDb
const mockDb = {
  getAllLabResults: vi.fn(),
  getAllTestValues: vi.fn(),
  getAllNotes: vi.fn(),
};

vi.mock('./useEncryptedDb', () => ({
  useEncryptedDb: () => ({
    db: mockDb,
    isReady: true,
  }),
}));

describe('useExportData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty data sources when db returns empty arrays', async () => {
    mockDb.getAllLabResults.mockResolvedValue([]);
    mockDb.getAllTestValues.mockResolvedValue([]);
    mockDb.getAllNotes.mockResolvedValue([]);

    const { result } = renderHook(() => useExportData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.dataSources.labResults).toEqual([]);
    expect(result.current.dataSources.testValues).toEqual([]);
    expect(result.current.dataSources.userNotes).toEqual([]);
    expect(result.current.labResultsData).toEqual([]);
    expect(result.current.biomarkerOptions).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('should return lab results data for export', async () => {
    const labResult = {
      id: 1,
      date: new Date('2024-01-15'),
      labName: 'Test Lab',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const testValue = {
      id: 1,
      labResultId: 1,
      biomarkerId: 42,
      value: 95,
      unit: 'mg/dL',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockDb.getAllLabResults.mockResolvedValue([labResult]);
    mockDb.getAllTestValues.mockResolvedValue([testValue]);
    mockDb.getAllNotes.mockResolvedValue([]);

    const { result } = renderHook(() => useExportData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.dataSources.labResults).toEqual([labResult]);
    expect(result.current.dataSources.testValues).toEqual([testValue]);
    expect(result.current.labResultsData).toHaveLength(1);
    expect(result.current.labResultsData[0].labResult).toEqual(labResult);
    expect(result.current.labResultsData[0].testValues).toEqual([testValue]);
  });

  it('should return biomarker options from test values', async () => {
    mockDb.getAllLabResults.mockResolvedValue([]);
    mockDb.getAllTestValues.mockResolvedValue([
      {
        id: 1,
        labResultId: 1,
        biomarkerId: 1,
        value: 95,
        unit: 'mg/dL',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        labResultId: 1,
        biomarkerId: 2,
        value: 100,
        unit: 'mg/dL',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockDb.getAllNotes.mockResolvedValue([]);

    const { result } = renderHook(() => useExportData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.biomarkerOptions).toHaveLength(2);
    expect(result.current.biomarkerOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: '1' }),
        expect.objectContaining({ value: '2' }),
      ])
    );
  });

  it('should handle errors', async () => {
    mockDb.getAllLabResults.mockRejectedValue(new Error('Database error'));
    mockDb.getAllTestValues.mockResolvedValue([]);
    mockDb.getAllNotes.mockResolvedValue([]);

    const { result } = renderHook(() => useExportData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Database error');
  });

  it('should refresh data when refresh is called', async () => {
    mockDb.getAllLabResults.mockResolvedValue([]);
    mockDb.getAllTestValues.mockResolvedValue([]);
    mockDb.getAllNotes.mockResolvedValue([]);

    const { result } = renderHook(() => useExportData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Clear mock calls
    mockDb.getAllLabResults.mockClear();
    mockDb.getAllTestValues.mockClear();
    mockDb.getAllNotes.mockClear();

    // Call refresh
    await result.current.refresh();

    expect(mockDb.getAllLabResults).toHaveBeenCalled();
    expect(mockDb.getAllTestValues).toHaveBeenCalled();
    expect(mockDb.getAllNotes).toHaveBeenCalled();
  });

  it('should group test values by lab result', async () => {
    const labResults = [
      { id: 1, date: new Date(), labName: 'Lab 1', createdAt: new Date(), updatedAt: new Date() },
      { id: 2, date: new Date(), labName: 'Lab 2', createdAt: new Date(), updatedAt: new Date() },
    ];

    const testValues = [
      { id: 1, labResultId: 1, biomarkerId: 1, value: 10, unit: 'u', createdAt: new Date(), updatedAt: new Date() },
      { id: 2, labResultId: 1, biomarkerId: 2, value: 20, unit: 'u', createdAt: new Date(), updatedAt: new Date() },
      { id: 3, labResultId: 2, biomarkerId: 1, value: 30, unit: 'u', createdAt: new Date(), updatedAt: new Date() },
    ];

    mockDb.getAllLabResults.mockResolvedValue(labResults);
    mockDb.getAllTestValues.mockResolvedValue(testValues);
    mockDb.getAllNotes.mockResolvedValue([]);

    const { result } = renderHook(() => useExportData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.labResultsData).toHaveLength(2);

    const labResult1Data = result.current.labResultsData.find(d => d.labResult.id === 1);
    const labResult2Data = result.current.labResultsData.find(d => d.labResult.id === 2);

    expect(labResult1Data?.testValues).toHaveLength(2);
    expect(labResult2Data?.testValues).toHaveLength(1);
  });
});
