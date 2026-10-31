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
import { useEncryptedDb } from './useEncryptedDb';
import { useLabResults } from './useLabResults';
import { usePreferences } from './usePreferences';
import type { ReviewedResult } from '@components/import';

/**
 * @param syncNow - Copies the saved data to the sync folder, when one is set up
 * @returns A function that saves an import and resolves to whether it was saved
 */
export function useSaveImport(
  syncNow: () => Promise<void>
): (results: ReviewedResult[]) => Promise<boolean> {
  const { db, isReady } = useEncryptedDb();
  const { refresh } = useLabResults();
  const { learnAliases } = usePreferences();

  return useCallback(
    async (results: ReviewedResult[]) => {
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
        output = await saveImportResults(results, db);
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
      void learnAliases(
        // Names saved under a test are this user's aliases from now on
        results.flatMap((r) =>
          r.editedBiomarkers.map((b) => ({
            name: b.name,
            key: b.dictionaryMatch?.key,
            pickedByUser: b.identifiedBy === 'user',
            savedAsUnknown: b.savedAsUnknown,
          }))
        )
      )
        .catch((err: unknown) =>
          notifySaveFailed('Learned names not saved', err, 'The import was saved.')
        )
        .then(syncNow)
        // The results are saved either way; the folder sync tells of its own failure
        .catch(() => undefined);
      return true;
    },
    [db, isReady, refresh, learnAliases, syncNow]
  );
}
