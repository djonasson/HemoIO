/**
 * The HemoIO data this browser already holds before setup: rows an earlier
 * setup stored, which this setup's new key cannot open
 */

import { useCallback, useEffect, useState } from 'react';
import { clearStoredData, countStoredRows } from '@data/db/storedRows';
import { clearLocalHemoIOStorage } from '@data/storage/browserStorage';
import { loadStoredCredentials } from '@contexts/credentialsStorage';
import { SETUP_LOCK } from '@/utils/locks';
import { withWebLock } from '@/utils/withWebLock';
import { logFailure } from '@/utils/logFailure';

export interface UseExistingBrowserDataResult {
  /** How many rows are stored; null while they are being counted */
  rows: number | null;
  /**
   * Deletes them all, at the user's confirmed request; throws if it fails.
   * The earlier setup's folder choice and other HemoIO keys go too, so the
   * new setup starts as on a fresh browser. False, with nothing deleted,
   * when another tab has finished setup meanwhile: the data is that setup's now.
   */
  clear: () => Promise<boolean>;
}

export function useExistingBrowserData(): UseExistingBrowserDataResult {
  const [rows, setRows] = useState<number | null>(null);

  useEffect(() => {
    let current = true;
    // Under the setup lock, so a Start over still clearing (which holds it)
    // finishes first, and the count is of what it left
    withWebLock(SETUP_LOCK, () => countStoredRows()).then(
      (count) => {
        if (current) setRows(count);
      },
      () => {
        // Fixed text: the error could name stored data. Setup goes ahead:
        // the unlock sweep still keeps aside any rows the new key cannot open
        logFailure('Could not count the data stored in this browser');
        if (current) setRows(0);
      }
    );
    return () => {
      current = false;
    };
  }, []);

  const clear = useCallback(async (): Promise<boolean> => {
    // Under the setup lock, so a setup in another tab cannot finish between
    // the check and the clear
    const cleared = await withWebLock(SETUP_LOCK, async () => {
      if (loadStoredCredentials()) return false;
      await clearStoredData();
      // Checked above: no credentials are among the keys this removes. The
      // rows are gone, so a folder choice left behind fails nothing: the new
      // setup's first sync finds another setup's copy there, and says so.
      await clearLocalHemoIOStorage().catch(() => {
        logFailure("Could not forget the earlier setup's folder choice");
      });
      return true;
    });
    if (cleared) setRows(0);
    return cleared;
  }, []);

  return { rows, clear };
}
