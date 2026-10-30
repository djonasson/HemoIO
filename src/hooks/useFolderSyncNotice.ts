/**
 * Tells the user when the folder sync holds back to protect the folder copy
 */

import { useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import type { FolderProtectionReason } from '@services/sync';

export const FOLDER_SYNC_NOTICE_ID = 'folder-sync-skipped';

const MESSAGES: Record<FolderProtectionReason, string> = {
  empty:
    'This browser has no lab results right now, but your folder copy does. ' +
    'HemoIO left your folder copy as it is. ' +
    'Syncing starts again once you add or restore results.',
  unreadable:
    'The copy in your folder cannot be read: it was saved with another password, ' +
    'or it is damaged. HemoIO left it as it is. ' +
    'To keep syncing, choose a different folder in Settings > Data.',
  newer:
    'The copy in your folder was saved by a newer version of HemoIO, ' +
    'so this version left it as it is. Reload HemoIO to update it and keep syncing.',
};

/**
 * One notice per reason, kept open until dismissed: a sync every 30 seconds
 * must not repeat it, and one that writes again takes it away.
 */
export function useFolderSyncNotice(protection: FolderProtectionReason | null): void {
  useEffect(() => {
    if (!protection) return;

    notifications.show({
      id: FOLDER_SYNC_NOTICE_ID,
      title: 'Folder sync skipped',
      message: MESSAGES[protection],
      color: 'yellow',
      autoClose: false,
    });
    return () => {
      notifications.hide(FOLDER_SYNC_NOTICE_ID);
    };
  }, [protection]);
}
