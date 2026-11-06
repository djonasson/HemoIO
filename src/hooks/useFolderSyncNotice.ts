/**
 * Tells the user when the folder sync holds back to protect the folder copy,
 * or cannot write to the folder
 */

import { useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import type { FolderSyncIssue } from './useFilesystemSync';

export const FOLDER_SYNC_NOTICE_ID = 'folder-sync';

const SKIPPED = 'Folder sync skipped';

const NOTICES: Record<FolderSyncIssue, { title: string; message: string }> = {
  empty: {
    title: SKIPPED,
    message:
      'This browser has no lab results right now, but your folder copy does. ' +
      'HemoIO left your folder copy as it is. ' +
      'Syncing starts again once you add or restore results.',
  },
  unreadable: {
    title: SKIPPED,
    message:
      'The copy in your folder cannot be read: it was saved by a different HemoIO setup, ' +
      'or it is damaged. HemoIO left it as it is. ' +
      'To keep syncing, choose a different folder in Settings > Data.',
  },
  newer: {
    title: SKIPPED,
    message:
      'The copy in your folder was saved by a newer version of HemoIO, ' +
      'so this version left it as it is. Reload HemoIO to update it and keep syncing.',
  },
  'before-loinc': {
    title: SKIPPED,
    message:
      'The copy in your folder was saved before tests were identified by LOINC, ' +
      'so it cannot be restored, and HemoIO left it as it is. ' +
      'To keep syncing, choose a different folder in Settings > Data.',
  },
  'set-aside': {
    title: SKIPPED,
    message:
      "Some stored records can't be opened, and your folder copy may still hold them. " +
      'HemoIO left it as it is. Download or delete the unreadable records to sync again.',
  },
  failed: {
    title: 'Folder sync failed',
    message:
      'Your data could not be saved to your folder. It is safe in this browser, ' +
      'and HemoIO keeps trying. Check that the folder is available.',
  },
};

/**
 * One notice per issue, kept open until dismissed: a sync every 30 seconds
 * must not repeat it, and one that writes again takes it away.
 */
export function useFolderSyncNotice(issue: FolderSyncIssue | null): void {
  useEffect(() => {
    if (!issue) return;

    notifications.show({
      id: FOLDER_SYNC_NOTICE_ID,
      ...NOTICES[issue],
      color: 'yellow',
      autoClose: false,
    });
    return () => {
      notifications.hide(FOLDER_SYNC_NOTICE_ID);
    };
  }, [issue]);
}
