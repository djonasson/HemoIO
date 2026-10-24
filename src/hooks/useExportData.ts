/**
 * Hook to gather data for export/backup operations
 *
 * Provides all data sources needed for export services.
 */

import { useState, useCallback, useEffect } from 'react';
import { getBiomarkerDisplayName } from '@data/biomarkers';
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
export interface UseExportDataOptions {
  /**
   * Load while true, and again each time it turns true, so data is as current
   * as when the export was opened. Defaults to true.
   */
  enabled?: boolean;
}

export function useExportData({ enabled = true }: UseExportDataOptions = {}): UseExportDataResult {
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
      const [labResults, testValues, userNotes, userPreferences, settings] = await Promise.all([
        db.getAllLabResults(),
        db.getAllTestValues(),
        db.getAllNotes(),
        db.getPreferences(),
        db.getSettings(),
      ]);

      // Build data sources for JSON export. Exporters decide what of the
      // settings a backup may contain (standard backups omit the API key).
      const sources: ExportDataSources = {
        labResults,
        testValues,
        userNotes,
        userPreferences: userPreferences ?? null,
        settings: settings ?? null,
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

      // Name each biomarker the way the trends view does: its dictionary entry,
      // else the name extracted from the report
      const biomarkerNames = new Map<string, string>();
      for (const tv of testValues) {
        if (!biomarkerNames.has(tv.biomarkerKey)) {
          biomarkerNames.set(tv.biomarkerKey, getBiomarkerDisplayName(tv));
        }
      }

      // Build lab results data
      const resultsData: LabResultForExport[] = labResults.map((labResult) => ({
        labResult,
        testValues: testValuesByLabResult.get(labResult.id!) || [],
        biomarkerNames,
      }));

      setLabResultsData(resultsData);

      // Build biomarker options for filtering
      const options = Array.from(biomarkerNames, ([key, name]) => ({
        value: key,
        label: name,
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

  useEffect(() => {
    if (enabled) void fetchData();
  }, [enabled, fetchData]);

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
