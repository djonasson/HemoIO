/**
 * Lab Results Context
 *
 * Loads and decrypts the lab results once for every view. Views reload them
 * only after a write (an import, a restore or a deletion), never on navigation.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useEncryptedDb } from '@hooks/useEncryptedDb';
import {
  LabResultsContext,
  enrichTestValue,
  type LabResultWithDetails,
  type LabResultsStore,
} from '@hooks/useLabResults';

export function LabResultsProvider({ children }: { children: ReactNode }): ReactNode {
  const { db, isReady } = useEncryptedDb();
  const [allResults, setAllResults] = useState<LabResultWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The database of the current session. A load that finishes after a lock
  // (or after the next unlock) belongs to a session that is over: its
  // decrypted results must not reach the app.
  const sessionDb = useRef(isReady ? db : null);
  useEffect(() => {
    sessionDb.current = isReady ? db : null;
  }, [db, isReady]);

  const refresh = useCallback(async () => {
    if (!db || !isReady) {
      setAllResults([]);
      setIsLoading(false);
      return;
    }
    const isCurrent = () => sessionDb.current === db;

    setIsLoading(true);
    setError(null);

    try {
      const labResults = await db.getAllLabResults();
      const resultsWithDetails = await Promise.all(
        labResults.map(async (labResult) => {
          const testValues = labResult.id ? await db.getTestValuesByLabResult(labResult.id) : [];
          const enrichedTestValues = testValues.map(enrichTestValue);
          return {
            ...labResult,
            testValues: enrichedTestValues,
            abnormalCount: enrichedTestValues.filter(
              (tv) => tv.status === 'low' || tv.status === 'high'
            ).length,
            totalCount: testValues.length,
          };
        })
      );
      if (isCurrent()) setAllResults(resultsWithDetails);
    } catch (err) {
      if (!isCurrent()) return;
      setError(err instanceof Error ? err.message : 'Failed to load lab results');
      console.error('Error fetching lab results:', err);
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [db, isReady]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const deleteResult = useCallback(
    async (id: number) => {
      if (!db) {
        throw new Error('Database not available');
      }

      try {
        await db.deleteLabResult(id);
        // Remove from the shared state at once, so every view updates
        setAllResults((prev) => prev.filter((r) => r.id !== id));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete lab result';
        setError(message);
        throw new Error(message);
      }
    },
    [db]
  );

  const value = useMemo<LabResultsStore>(
    () => ({ allResults, isLoading, error, refresh, deleteResult }),
    [allResults, isLoading, error, refresh, deleteResult]
  );

  return <LabResultsContext.Provider value={value}>{children}</LabResultsContext.Provider>;
}
