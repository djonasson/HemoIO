/**
 * Tests for useExportData hook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useExportData } from './useExportData';
import { createCatalog, type Catalog } from '@data/loinc/catalog';

// Mock useEncryptedDb
const mockDb = {
  getAllLabResults: vi.fn(),
  getAllTestValues: vi.fn(),
  getAllNotes: vi.fn(),
  getPreferences: vi.fn(),
  getSettings: vi.fn(),
};

const catalogs = vi.hoisted(() => ({ current: undefined as Catalog | undefined }));
vi.mock('@contexts/useCatalog', async () => {
  const { fixtureCatalog } = await import('@/test/loincFixture');
  const fixture = fixtureCatalog();
  return { useCatalog: () => catalogs.current ?? fixture };
});

vi.mock('./useEncryptedDb', () => ({
  useEncryptedDb: () => ({
    db: mockDb,
    isReady: true,
  }),
}));

describe('useExportData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    catalogs.current = undefined;
    mockDb.getPreferences.mockResolvedValue(undefined);
    mockDb.getSettings.mockResolvedValue(undefined);
  });

  it('should include preferences and settings so backups carry them', async () => {
    const preferences = {
      unitPreferences: { glucose: 'mmol/L' },
      personalTargets: { glucose: { high: 99 } },
      theme: 'dark',
      dateFormat: 'YYYY-MM-DD',
    };
    const settings = { storageProvider: 'local', aiProvider: 'anthropic', anthropicModel: 'claude-x', language: 'en' };
    mockDb.getAllLabResults.mockResolvedValue([]);
    mockDb.getAllTestValues.mockResolvedValue([]);
    mockDb.getAllNotes.mockResolvedValue([]);
    mockDb.getPreferences.mockResolvedValue(preferences);
    mockDb.getSettings.mockResolvedValue(settings);

    const { result } = renderHook(() => useExportData());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.dataSources.userPreferences).toEqual(preferences);
    expect(result.current.dataSources.settings).toEqual(settings);
  });

  it('loads nothing until enabled, then reloads each time it is enabled again', async () => {
    mockDb.getAllLabResults.mockResolvedValue([]);
    mockDb.getAllTestValues.mockResolvedValue([]);
    mockDb.getAllNotes.mockResolvedValue([]);

    const { rerender } = renderHook(({ enabled }) => useExportData({ enabled }), {
      initialProps: { enabled: false },
    });
    expect(mockDb.getAllLabResults).not.toHaveBeenCalled();

    // Opening the export dialog loads the data as it is now
    rerender({ enabled: true });
    await waitFor(() => expect(mockDb.getAllLabResults).toHaveBeenCalledTimes(1));

    rerender({ enabled: false });
    rerender({ enabled: true });
    await waitFor(() => expect(mockDb.getAllLabResults).toHaveBeenCalledTimes(2));
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
      biomarkerKey: 'marker-42',
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
        biomarkerKey: 'marker-1',
        value: 95,
        unit: 'mg/dL',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        labResultId: 1,
        biomarkerKey: 'marker-2',
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
        expect.objectContaining({ value: 'marker-1' }),
        expect.objectContaining({ value: 'marker-2' }),
      ])
    );
  });

  it('offers glucose in mg/dL and in mmol/L as one test, with the keys of both', async () => {
    mockDb.getAllLabResults.mockResolvedValue([
      { id: 1, date: new Date(), labName: 'Lab', createdAt: new Date(), updatedAt: new Date() },
    ]);
    mockDb.getAllTestValues.mockResolvedValue([
      { id: 1, labResultId: 1, biomarkerKey: '2345-7', value: 95, unit: 'mg/dL', createdAt: new Date(), updatedAt: new Date() },
      { id: 2, labResultId: 1, biomarkerKey: '14749-6', value: 5, unit: 'mmol/L', rawText: 'Glicemia', createdAt: new Date(), updatedAt: new Date() },
    ]);
    mockDb.getAllNotes.mockResolvedValue([]);

    const { result } = renderHook(() => useExportData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.biomarkerOptions).toEqual([
      { value: '2345-7', label: 'Glucose', keys: ['2345-7', '14749-6'] },
    ]);
  });

  it("labels a test by the test's name, not by the code its first value was saved under", async () => {
    // Made-up lactate in moles (the more common) and in mass, one LOINC group
    const group = { id: 'LG-T1', parentId: 'LG-P', parentName: 'Sample types', name: 'Lactate|Pt|ANYBldSerPl' };
    const row = { component: 'Lactate', system: 'Bld', scale: 'Qn', method: '', classCode: 'CHEM', names: [], units: [], groups: [group.id] };
    catalogs.current = createCatalog({
      version: 'test',
      groups: [group],
      tests: [
        { ...row, code: '90020-3', name: 'Lactate [Moles/volume] in Blood', shortName: 'Lactate Bld-sCnc', property: 'SCnc', rank: 300 },
        { ...row, code: '90021-1', name: 'Lactate [Mass/volume] in Blood', shortName: 'Lactate Bld-mCnc', property: 'MCnc', rank: 700 },
      ],
    });
    mockDb.getAllLabResults.mockResolvedValue([
      { id: 1, date: new Date(), labName: 'Lab', createdAt: new Date(), updatedAt: new Date() },
    ]);
    mockDb.getAllTestValues.mockResolvedValue([
      { id: 1, labResultId: 1, biomarkerKey: '90021-1', value: 9, unit: 'mg/dL', createdAt: new Date(), updatedAt: new Date() },
      { id: 2, labResultId: 1, biomarkerKey: '90020-3', value: 1, unit: 'mmol/L', createdAt: new Date(), updatedAt: new Date() },
    ]);
    mockDb.getAllNotes.mockResolvedValue([]);

    const { result } = renderHook(() => useExportData());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.biomarkerOptions).toEqual([
      { value: '90020-3', label: 'Lactate Bld', keys: ['90021-1', '90020-3'] },
    ]);
  });

  it('names a value saved as not a LOINC test by its printed name, never a test it resembles', async () => {
    mockDb.getAllLabResults.mockResolvedValue([
      { id: 1, date: new Date(), labName: 'Lab', createdAt: new Date(), updatedAt: new Date() },
    ]);
    mockDb.getAllTestValues.mockResolvedValue([
      {
        id: 1,
        labResultId: 1,
        // Saved as not a LOINC test
        biomarkerKey: 'unknown:bloodsugar',
        value: 95,
        unit: 'mg/dL',
        // An alias of Glucose, which review did not save it as
        rawText: 'Blood Sugar',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        labResultId: 1,
        biomarkerKey: 'marker-10008',
        value: 3,
        unit: 'U/L',
        // Not in the catalog: keep the name from the report
        rawText: 'Exotic Marker',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockDb.getAllNotes.mockResolvedValue([]);

    const { result } = renderHook(() => useExportData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.biomarkerOptions).toEqual(
      expect.arrayContaining([
        { value: 'unknown:bloodsugar', label: 'Blood Sugar', keys: ['unknown:bloodsugar'] },
        { value: 'marker-10008', label: 'Exotic Marker', keys: ['marker-10008'] },
      ])
    );
    const names = result.current.labResultsData[0].biomarkerNames;
    expect(names.get('unknown:bloodsugar')).toBe('Blood Sugar');
    expect(names.get('marker-10008')).toBe('Exotic Marker');
  });

  it('should handle errors', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockDb.getAllLabResults.mockRejectedValue(new Error('Database error'));
    mockDb.getAllTestValues.mockResolvedValue([]);
    mockDb.getAllNotes.mockResolvedValue([]);

    const { result } = renderHook(() => useExportData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Database error');
    expect(consoleError).toHaveBeenCalledWith('Error fetching export data:', expect.any(Error));
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
    await act(async () => {
      await result.current.refresh();
    });

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
      { id: 1, labResultId: 1, biomarkerKey: 'marker-1', value: 10, unit: 'u', createdAt: new Date(), updatedAt: new Date() },
      { id: 2, labResultId: 1, biomarkerKey: 'marker-2', value: 20, unit: 'u', createdAt: new Date(), updatedAt: new Date() },
      { id: 3, labResultId: 2, biomarkerKey: 'marker-1', value: 30, unit: 'u', createdAt: new Date(), updatedAt: new Date() },
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
