/**
 * Loading a folder copy saved on another computer into this browser, for
 * folder sync: the data is replaced, the other tabs are told, and what this
 * tab shows is reloaded. It runs inside a folder sync, so it never starts
 * one (that would wait for this one to end) and leaves telling the user of
 * the load to the sync; only a reload that failed is told here.
 */

import { useCallback } from 'react';
import { notifications } from '@mantine/notifications';
import { announceDataReplaced } from '@data/db/dataReplacedEvents';
import { failedStepsMessage, restoreBackup, restoreBackupIfUnchanged, type ParsedBackupData } from '@services/import';
import { useAfterRestore } from './useAfterRestore';
import { useEncryptedDb } from './useEncryptedDb';

/**
 * Replace this browser's data with a folder copy. Given a stamp, only while
 * the data is as stamped: false, loading nothing, otherwise.
 */
export type ApplyFolderCopy = (data: ParsedBackupData, unchangedSince?: string) => Promise<boolean>;

export function useApplyFolderCopy(): ApplyFolderCopy {
  const { db, isReady } = useEncryptedDb();
  const afterRestore = useAfterRestore();

  return useCallback(
    async (data, unchangedSince) => {
      if (!db || !isReady) {
        throw new Error('Database not available');
      }
      if (unchangedSince === undefined) await restoreBackup(db, data);
      else if ((await restoreBackupIfUnchanged(db, data, unchangedSince)) === null) return false;
      announceDataReplaced();
      const { steps, failed } = await afterRestore('showing the updated results');
      if (failed.length > 0) {
        notifications.show({
          title: 'Updated From the Folder, With Problems',
          message: failedStepsMessage(steps, failed),
          color: 'yellow',
        });
      }
      return true;
    },
    [db, isReady, afterRestore]
  );
}
