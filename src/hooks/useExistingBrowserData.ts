/**
 * The HemoIO data this browser already holds before setup: rows an earlier
 * setup stored, which this setup's new key cannot open
 */

import { useCallback, useEffect, useState } from 'react';
import { clearStoredData, countStoredRows } from '@data/db/storedRows';

export interface UseExistingBrowserDataResult {
  /** How many rows are stored; null while they are being counted */
  rows: number | null;
  /** Deletes them all, at the user's confirmed request; throws if it fails */
  clear: () => Promise<void>;
}

export function useExistingBrowserData(): UseExistingBrowserDataResult {
  const [rows, setRows] = useState<number | null>(null);

  useEffect(() => {
    let current = true;
    countStoredRows().then(
      (count) => {
        if (current) setRows(count);
      },
      () => {
        // Fixed text: the error could name stored data. Setup goes ahead:
        // the unlock sweep still keeps aside any rows the new key cannot open
        console.error('Could not count the data stored in this browser');
        if (current) setRows(0);
      }
    );
    return () => {
      current = false;
    };
  }, []);

  const clear = useCallback(async (): Promise<void> => {
    await clearStoredData();
    setRows(0);
  }, []);

  return { rows, clear };
}
