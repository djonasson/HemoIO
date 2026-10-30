/**
 * Hook to save a reviewed import
 *
 * Saves every file of the import or none, and tells the user which. Only a
 * saved import is learned from, shown and synced: the views then read it
 * back from the database, so they show exactly what a later unlock will.
 */

import { useCallback } from 'react';
import { notifications } from '@mantine/notifications';
import { saveErrorMessage } from '@data/db/saveError';
import { saveImportResults } from '@services/persistence';
import { useEncryptedDb } from './useEncryptedDb';
import { useLabResults } from './useLabResults';
import { usePreferences } from './usePreferences';
import type { ReviewedResult } from '@components/import';

function notifyNotSaved(reason: string): void {
  notifications.show({ title: 'Import not saved', message: `Nothing was saved. ${reason}`, color: 'red' });
}

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
        notifyNotSaved('The database is not available. Unlock the app, then try again.');
        return false;
      }

      let output;
      try {
        output = await saveImportResults(results, db);
      } catch (err) {
        notifyNotSaved(saveErrorMessage(err));
        return false;
      }

      notifications.show({
        title: 'Import Complete',
        message: `Successfully saved ${output.totalLabResults} lab result(s) with ${output.totalTestValues} test value(s).`,
        color: 'green',
      });

      // Names saved under a test are this user's aliases from now on
      await learnAliases(
        results.flatMap((r) =>
          r.editedBiomarkers.map((b) => ({
            name: b.name,
            key: b.dictionaryMatch?.key,
            pickedByUser: b.identifiedBy === 'user',
            savedAsUnknown: b.savedAsUnknown,
          }))
        )
      ).catch(() => console.error('Failed to save learned names'));

      // Every view, the alerts badge included, shows the new results
      await refresh();
      await syncNow();
      return true;
    },
    [db, isReady, refresh, learnAliases, syncNow]
  );
}
