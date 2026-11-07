/**
 * Hook to read and manage lab results
 *
 * Provides lab results with their test values, enriched with status information
 * and filtering capabilities. Must be used within a LabResultsProvider: every
 * view reads the one copy it loads, and each view filters it on its own.
 */

import { createContext, useContext, useMemo, useState } from 'react';
import { isWithinDays } from '@/utils/localDate';
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
  /** Results without a valid date, listed after the dated ones; none while a date filter is set */
  undatedResults: LabResultWithDetails[];
  /** Results without a valid date that the search matches but a date filter hides */
  hiddenUndatedCount: number;
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
 * The shared, unfiltered lab results a LabResultsProvider loads
 */
export interface LabResultsStore {
  allResults: LabResultWithDetails[];
  /** Results without a valid date: kept out of allResults, so out of every date-based view */
  undatedResults: LabResultWithDetails[];
  isLoading: boolean;
  error: string | null;
  /** Reload from the database; called after imports and restores */
  refresh: () => Promise<void>;
  deleteResult: (id: number) => Promise<void>;
}

export const LabResultsContext = createContext<LabResultsStore | null>(null);

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
export function enrichTestValue(testValue: TestValue): EnrichedTestValue {
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
  const store = useContext(LabResultsContext);
  if (!store) {
    throw new Error('useLabResults must be used within a LabResultsProvider');
  }
  const { allResults, undatedResults, isLoading, error, refresh, deleteResult } = store;
  const [filters, setFilters] = useState<LabResultFilters>({});

  /**
   * Apply filters to the results
   */
  const filteredResults = useMemo(() => {
    let results = [...allResults];

    // Filter by date range, in days: a result anywhere in the end day is included
    if (filters.startDate || filters.endDate) {
      results = results.filter((r) =>
        isWithinDays(r.date, filters.startDate ?? null, filters.endDate ?? null)
      );
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

  // A result with no date is in no date range; the search still applies
  const searchedUndated = useMemo(() => {
    const search = filters.searchTerm?.toLowerCase();
    return search
      ? undatedResults.filter((r) => r.labName.toLowerCase().includes(search))
      : undatedResults;
  }, [undatedResults, filters.searchTerm]);
  const dateFiltered = Boolean(filters.startDate || filters.endDate);

  return {
    results: filteredResults,
    undatedResults: dateFiltered ? [] : searchedUndated,
    hiddenUndatedCount: dateFiltered ? searchedUndated.length : 0,
    isLoading,
    error,
    filters,
    setFilters,
    refresh,
    deleteResult,
  };
}
