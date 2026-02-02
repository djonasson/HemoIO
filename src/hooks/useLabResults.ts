/**
 * Hook to fetch and manage lab results
 *
 * Provides lab results with their test values, enriched with status information
 * and filtering capabilities.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useEncryptedDb } from './useEncryptedDb';
import type { LabResult, TestValue } from '@/types';

/**
 * Status of a test value relative to reference range
 */
export type TestValueStatus = 'normal' | 'low' | 'high' | 'unknown';

/**
 * Test value enriched with status information
 */
export interface EnrichedTestValue extends TestValue {
  /** Status relative to reference range */
  status: TestValueStatus;
  /** Biomarker name (from dictionary lookup) */
  biomarkerName?: string;
}

/**
 * Lab result with associated test values and computed properties
 */
export interface LabResultWithDetails extends LabResult {
  /** All test values for this lab result */
  testValues: EnrichedTestValue[];
  /** Count of abnormal (high or low) values */
  abnormalCount: number;
  /** Total number of test values */
  totalCount: number;
}

/**
 * Filters for lab results
 */
export interface LabResultFilters {
  /** Start date for filtering */
  startDate?: Date;
  /** End date for filtering */
  endDate?: Date;
  /** Search term for lab name */
  searchTerm?: string;
}

/**
 * Result of useLabResults hook
 */
export interface UseLabResultsResult {
  /** Lab results with details, sorted by date (newest first) */
  results: LabResultWithDetails[];
  /** Whether data is currently loading */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Current filters applied */
  filters: LabResultFilters;
  /** Set filters for results */
  setFilters: (filters: LabResultFilters) => void;
  /** Refresh the data from database */
  refresh: () => Promise<void>;
  /** Delete a lab result by ID */
  deleteResult: (id: number) => Promise<void>;
}

/**
 * Determine the status of a test value based on reference range
 */
function getTestValueStatus(testValue: TestValue): TestValueStatus {
  // If value is not numeric, we can't determine status
  if (typeof testValue.value !== 'number') {
    return 'unknown';
  }

  const value = testValue.value;
  const { referenceRangeLow, referenceRangeHigh } = testValue;

  // If no reference range, status is unknown
  if (referenceRangeLow === undefined && referenceRangeHigh === undefined) {
    return 'unknown';
  }

  if (referenceRangeLow !== undefined && value < referenceRangeLow) {
    return 'low';
  }

  if (referenceRangeHigh !== undefined && value > referenceRangeHigh) {
    return 'high';
  }

  return 'normal';
}

/**
 * Enrich a test value with status information
 */
function enrichTestValue(testValue: TestValue): EnrichedTestValue {
  return {
    ...testValue,
    status: getTestValueStatus(testValue),
  };
}

/**
 * Hook to fetch and manage lab results
 *
 * @returns UseLabResultsResult with results, loading state, and actions
 *
 * @example
 * ```tsx
 * function TimelineView() {
 *   const { results, isLoading, error, setFilters, deleteResult } = useLabResults();
 *
 *   if (isLoading) return <Loader />;
 *   if (error) return <Alert color="red">{error}</Alert>;
 *
 *   return (
 *     <Stack>
 *       {results.map(result => (
 *         <LabResultCard
 *           key={result.id}
 *           result={result}
 *           onDelete={() => deleteResult(result.id!)}
 *         />
 *       ))}
 *     </Stack>
 *   );
 * }
 * ```
 */
export function useLabResults(): UseLabResultsResult {
  const { db, isReady } = useEncryptedDb();
  const [allResults, setAllResults] = useState<LabResultWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<LabResultFilters>({});

  /**
   * Fetch all lab results with their test values
   */
  const fetchResults = useCallback(async () => {
    if (!db || !isReady) {
      setAllResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch all lab results
      const labResults = await db.getAllLabResults();

      // Fetch test values for each result and compute enriched data
      const resultsWithDetails: LabResultWithDetails[] = await Promise.all(
        labResults.map(async (labResult) => {
          const testValues = labResult.id
            ? await db.getTestValuesByLabResult(labResult.id)
            : [];

          const enrichedTestValues = testValues.map(enrichTestValue);
          const abnormalCount = enrichedTestValues.filter(
            (tv) => tv.status === 'low' || tv.status === 'high'
          ).length;

          return {
            ...labResult,
            testValues: enrichedTestValues,
            abnormalCount,
            totalCount: testValues.length,
          };
        })
      );

      setAllResults(resultsWithDetails);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load lab results';
      setError(message);
      console.error('Error fetching lab results:', err);
    } finally {
      setIsLoading(false);
    }
  }, [db, isReady]);

  // Fetch results on mount and when db changes
  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  /**
   * Apply filters to the results
   */
  const filteredResults = useMemo(() => {
    let results = [...allResults];

    // Filter by date range
    if (filters.startDate) {
      results = results.filter((r) => r.date >= filters.startDate!);
    }
    if (filters.endDate) {
      results = results.filter((r) => r.date <= filters.endDate!);
    }

    // Filter by search term (lab name)
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      results = results.filter((r) =>
        r.labName.toLowerCase().includes(searchLower)
      );
    }

    // Sort by date (newest first) - already sorted by getAllLabResults but ensure order
    results.sort((a, b) => b.date.getTime() - a.date.getTime());

    return results;
  }, [allResults, filters]);

  /**
   * Delete a lab result
   */
  const deleteResult = useCallback(
    async (id: number) => {
      if (!db) {
        throw new Error('Database not available');
      }

      try {
        await db.deleteLabResult(id);
        // Remove from local state immediately for responsive UI
        setAllResults((prev) => prev.filter((r) => r.id !== id));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete lab result';
        setError(message);
        throw new Error(message);
      }
    },
    [db]
  );

  /**
   * Refresh data from database
   */
  const refresh = useCallback(async () => {
    await fetchResults();
  }, [fetchResults]);

  return {
    results: filteredResults,
    isLoading,
    error,
    filters,
    setFilters,
    refresh,
    deleteResult,
  };
}
