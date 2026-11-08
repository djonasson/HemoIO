/**
 * Hook to save a reviewed import
 *
 * Saves every file of the import or none, and tells the user which. Only a
 * saved import is learned from, shown and synced: the views then read it
 * back from the database, so they show exactly what a later unlock will.
 */

import { useCallback } from 'react';
import { notifications } from '@mantine/notifications';
import { notifySaveFailed } from '@components/common/notifySaveFailed';
import { saveImportResults } from '@services/persistence';
import { toLearn } from '@services/analysis/identification';
import { useCatalog } from '@contexts/useCatalog';
import { useEncryptedDb } from './useEncryptedDb';
import { useLabResults } from './useLabResults';
import { usePreferences } from './usePreferences';
import type { ReviewedResult } from '@components/import';
import type { SavePlan } from '@services/analysis/reviewedSave';

/**
 * @param syncNow - Copies the saved data to the sync folder, when one is set up
 * @returns A function that saves an import's plan and resolves to whether it was saved
 */
export function useSaveImport(
  syncNow: () => Promise<void>
): (plan: SavePlan<ReviewedResult>) => Promise<boolean> {
  const { db, isReady } = useEncryptedDb();
  const { refresh } = useLabResults();
  const { learnTests } = usePreferences();
  const catalog = useCatalog();

  return useCallback(
    async ({ toSave: results, notSaved }: SavePlan<ReviewedResult>) => {
      if (!db || !isReady) {
        notifications.show({
          title: 'Import not saved',
          message: 'Nothing was saved. The database is not available. Unlock the app, then try again.',
          color: 'red',
        });
        return false;
      }

      let output;
      try {
        output = await saveImportResults(results, db, catalog);
      } catch (err) {
        notifySaveFailed('Import not saved', err, 'Nothing was saved.');
        return false;
      }

      notifications.show({
        title: 'Import Complete',
        message: `Successfully saved ${output.totalLabResults} lab result(s) with ${output.totalTestValues} test value(s).`,
        color: 'green',
      });

      // Every view, the alerts badge included, shows the new results
      await refresh();
      // Not waited for: the import is saved, and the user may go on. The
      // sync comes after, as it copies the learned names too.
      void learnTests(
        // What the user decided for a wording and unit is matched without asking from now on,
        // a value set aside as the duplicate of another included: its test was decided too
        [...results.flatMap((r) => r.editedBiomarkers), ...notSaved.map((v) => v.biomarker)].map(toLearn)
      )
        .catch((err: unknown) =>
          notifySaveFailed('Learned names not saved', err, 'The import was saved.')
        )
        .then(syncNow)
        // The results are saved either way; the folder sync tells of its own failure
        .catch(() => undefined);
      return true;
    },
    [db, isReady, refresh, learnTests, syncNow, catalog]
  );
}
