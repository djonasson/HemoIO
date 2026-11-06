/**
 * Hook to gather data for export/backup operations
 *
 * Provides all data sources needed for export services.
 */

import { useState, useCallback, useEffect } from 'react';
import { testDisplayName, testName, trendCode } from '@data/loinc/display';
import { useCatalog } from '@contexts/useCatalog';
import { useEncryptedDb } from './useEncryptedDb';
import { useSetAsideRecords } from './useSetAsideRecords';
import type { SetAsideSummary, TestValue } from '@/types';
import type { ExportDataSources, LabResultForExport } from '@services/export';

/** A test to filter the export by, with every stored key its values have */
export interface ExportBiomarkerOption {
  /** The test's trend code */
  value: string;
  label: string;
  /** The keys of the test's values: the codes of its trend group they were saved under */
  keys: string[];
}

/**
 * Result of useExportData hook
 */
export interface UseExportDataResult {
  /** Full data sources for JSON backup */
  dataSources: ExportDataSources;
  /** Lab results with test values and biomarker names for CSV export */
  labResultsData: LabResultForExport[];
  /** Available biomarker options for filtering, one per test with a value */
  biomarkerOptions: ExportBiomarkerOption[];
  /** Records HemoIO cannot open, which no export holds */
  setAside: SetAsideSummary;
  /** Whether data is loading */
  isLoading: boolean;
  /** Error if loading failed */
  error: string | null;
  /** Reload from the database; resolves with what was loaded, null if nothing could be */
  refresh: () => Promise<ExportDataSources | null>;
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
  const catalog = useCatalog();
  const { db, isReady } = useEncryptedDb();
  // Kept current as rows are set aside, saved or deleted
  const { summary: setAside } = useSetAsideRecords();
  const [dataSources, setDataSources] = useState<ExportDataSources>({
    labResults: [],
    testValues: [],
    userNotes: [],
    userPreferences: null,
    settings: null,
  });
  const [labResultsData, setLabResultsData] = useState<LabResultForExport[]>([]);
  const [biomarkerOptions, setBiomarkerOptions] = useState<ExportBiomarkerOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch all data from database
   */
  const fetchData = useCallback(async (): Promise<ExportDataSources | null> => {
    if (!db || !isReady) {
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Every record, those without a valid date included: a backup that left
      // them out would let the next restore delete them
      const {
        labResults,
        testValues,
        userNotes,
        preferences: userPreferences,
        settings,
      } = await db.exportAllData();

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

      const biomarkerNames = new Map<string, string>();
      const tests = new Map<string, ExportBiomarkerOption>();
      for (const tv of testValues) {
        if (biomarkerNames.has(tv.biomarkerKey)) continue;
        const name = testDisplayName(catalog, tv);
        biomarkerNames.set(tv.biomarkerKey, name);
        const test = trendCode(catalog, tv.biomarkerKey);
        // The test's name, whichever of its codes its first value was saved under
        const option = tests.get(test) ?? {
          value: test,
          label: testName(catalog, test, tv.rawText),
          keys: [],
        };
        option.keys.push(tv.biomarkerKey);
        tests.set(test, option);
      }

      const resultsData: LabResultForExport[] = labResults.map((labResult) => ({
        labResult,
        testValues: testValuesByLabResult.get(labResult.id!) || [],
        biomarkerNames,
      }));

      setLabResultsData(resultsData);

      setBiomarkerOptions([...tests.values()].sort((a, b) => a.label.localeCompare(b.label)));
      return sources;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load export data';
      setError(message);
      console.error('Error fetching export data:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [catalog, db, isReady]);

  useEffect(() => {
    if (enabled) void fetchData();
  }, [enabled, fetchData]);

  /**
   * Refresh data from database
   */
  const refresh = useCallback(() => fetchData(), [fetchData]);

  return {
    dataSources,
    labResultsData,
    biomarkerOptions,
    setAside,
    isLoading,
    error,
    refresh,
  };
}
