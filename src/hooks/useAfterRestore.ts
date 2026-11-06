/**
 * What follows replacing this browser's data (a restore, a folder copy
 * loaded, or another tab doing either): the contexts that hold data of their
 * own reload it. A step that fails does not undo the replacement: its name
 * is returned, for the caller to tell the user.
 */

import { useCallback } from 'react';
import { runAfterRestore, type AfterRestoreStep } from '@services/import';
import { useAlertState } from './useAlertState';
import { useLabResults } from './useLabResults';
import { usePreferences } from './usePreferences';

export interface AfterRestoreRun {
  steps: AfterRestoreStep[];
  /** The names of the steps that failed */
  failed: string[];
}

/**
 * Reload preferences, alert acknowledgements, then the results, named
 * `resultsStep` for the user; `extra` steps run before the results
 */
export type AfterRestore = (resultsStep: string, extra?: AfterRestoreStep[]) => Promise<AfterRestoreRun>;

export function useAfterRestore(): AfterRestore {
  const { refresh: refreshLabResults } = useLabResults();
  const { reload: reloadPreferences } = usePreferences();
  const { reload: reloadAlertState } = useAlertState();

  return useCallback(
    async (resultsStep, extra = []) => {
      const steps: AfterRestoreStep[] = [
        // A backup can bring unit preferences, personal targets and acknowledgements
        { name: 'loading your preferences', run: reloadPreferences },
        { name: 'loading your alert acknowledgements', run: reloadAlertState },
        ...extra,
        { name: resultsStep, run: refreshLabResults },
      ];
      return { steps, failed: await runAfterRestore(steps) };
    },
    [reloadPreferences, reloadAlertState, refreshLabResults]
  );
}
