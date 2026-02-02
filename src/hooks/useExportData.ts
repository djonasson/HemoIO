/**
 * Hook to gather data for export/backup operations
 *
 * Provides all data sources needed for export services.
 */

import { useState, useCallback, useEffect } from 'react';
import { useEncryptedDb } from './useEncryptedDb';
import type { TestValue } from '@/types';
import type { ExportDataSources, LabResultForExport } from '@services/export';

/**
 * Result of useExportData hook
 */
export interface UseExportDataResult {
  /** Full data sources for JSON backup */
  dataSources: ExportDataSources;
  /** Lab results with test values and biomarker names for CSV export */
  labResultsData: LabResultForExport[];
  /** Available biomarker options for filtering */
  biomarkerOptions: { value: string; label: string }[];
  /** Whether data is loading */
  isLoading: boolean;
  /** Error if loading failed */
  error: string | null;
  /** Refresh data from database */
  refresh: () => Promise<void>;
}

/**
 * Hook to gather all data for export operations
 *
 * @returns UseExportDataResult with data sources for export
 *
 * @example
 * ```tsx
 * function ExportButton() {
 *   const { dataSources, labResultsData, biomarkerOptions, isLoading } = useExportData();
 *
 *   return (
 *     <ExportDialog
 *       labResultsData={labResultsData}
 *       fullDataSources={dataSources}
 *       biomarkerOptions={biomarkerOptions}
 *     />
 *   );
 * }
 * ```
 */
export function useExportData(): UseExportDataResult {
  const { db, isReady } = useEncryptedDb();
  const [dataSources, setDataSources] = useState<ExportDataSources>({
    labResults: [],
    testValues: [],
    userNotes: [],
    userPreferences: null,
    settings: null,
  });
  const [labResultsData, setLabResultsData] = useState<LabResultForExport[]>([]);
  const [biomarkerOptions, setBiomarkerOptions] = useState<{ value: string; label: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch all data from database
   */
  const fetchData = useCallback(async () => {
    if (!db || !isReady) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch all data in parallel
      const [labResults, testValues, userNotes] = await Promise.all([
        db.getAllLabResults(),
        db.getAllTestValues(),
        db.getAllNotes(),
      ]);

      // Build data sources for JSON export
      const sources: ExportDataSources = {
        labResults,
        testValues,
        userNotes,
        userPreferences: null, // TODO: Add when preferences are implemented
        settings: null, // TODO: Add when settings storage is implemented
      };

      setDataSources(sources);

      // Build lab results data for CSV export
      // Group test values by lab result ID
      const testValuesByLabResult = new Map<number, TestValue[]>();
      for (const tv of testValues) {
        const existing = testValuesByLabResult.get(tv.labResultId) || [];
        existing.push(tv);
        testValuesByLabResult.set(tv.labResultId, existing);
      }

      // Build biomarker names map (using IDs as names for now)
      // TODO: Look up actual names from biomarker dictionary
      const allBiomarkerIds = new Set<number>();
      for (const tv of testValues) {
        allBiomarkerIds.add(tv.biomarkerId);
      }

      const biomarkerNames = new Map<number, string>();
      for (const id of allBiomarkerIds) {
        // For now, just use the ID - this would be looked up from dictionary
        biomarkerNames.set(id, `Biomarker ${id}`);
      }

      // Build lab results data
      const resultsData: LabResultForExport[] = labResults.map((labResult) => ({
        labResult,
        testValues: testValuesByLabResult.get(labResult.id!) || [],
        biomarkerNames,
      }));

      setLabResultsData(resultsData);

      // Build biomarker options for filtering
      const options = Array.from(allBiomarkerIds).map((id) => ({
        value: id.toString(),
        label: biomarkerNames.get(id) || `Biomarker ${id}`,
      }));

      setBiomarkerOptions(options);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load export data';
      setError(message);
      console.error('Error fetching export data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [db, isReady]);

  // Fetch data on mount and when db changes
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * Refresh data from database
   */
  const refresh = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  return {
    dataSources,
    labResultsData,
    biomarkerOptions,
    isLoading,
    error,
    refresh,
  };
}
