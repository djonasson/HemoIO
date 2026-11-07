/**
 * Tells the user when the folder sync holds back to protect the folder copy,
 * or cannot write to the folder
 */

import { createElement, useEffect, useRef } from 'react';
import { notifications } from '@mantine/notifications';
import { showPersistentNotice } from '@components/common/showPersistentNotice';
import { FolderSyncNoticeBody } from '@components/storage/FolderSyncNoticeBody';
import { folderSyncIssueActions } from '@services/sync';
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
      "To keep syncing, choose another folder, or replace the folder copy with this computer's data " +
      '(also in Settings > Data).',
  },
  'another-setup': {
    title: SKIPPED,
    message:
      "Your folder holds another HemoIO setup's copy, so HemoIO left it as it is. " +
      'Choose another folder, or use Start over in Settings > Security to set up from that copy.',
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
      "To keep syncing, choose another folder, or replace the folder copy with this computer's data " +
      '(also in Settings > Data).',
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

/** What the notice's buttons do; the same object for as long as the notice may show, so it is not shown again */
export interface FolderSyncNoticeActions {
  /** Ask to confirm replacing the folder copy the issue is about */
  replace: () => void;
  /** "Choose another folder" found folder storage switched off meanwhile */
  onFolderStorageOff: () => void;
}

/**
 * One notice per issue, kept open until dismissed: a sync every 30 seconds
 * must not repeat it, and one that writes again takes it away. A copy that
 * cannot be read comes with what can be done about it (folderSyncIssueActions).
 */
export function useFolderSyncNotice(issue: FolderSyncIssue | null, actions: FolderSyncNoticeActions): void {
  // Each notice shown gets a body of its own, so nothing it showed carries
  // over to the next: notifications are keyed by their id, so a notice shown
  // again while the last one still fades out could otherwise keep its body
  const shownRef = useRef(0);
  useEffect(() => {
    if (!issue) return;
    shownRef.current += 1;

    const { title, message } = NOTICES[issue];
    const available = folderSyncIssueActions(issue);
    const offered = available.chooseFolder || available.replace !== false;
    showPersistentNotice({
      id: FOLDER_SYNC_NOTICE_ID,
      title,
      message: offered
        ? createElement(FolderSyncNoticeBody, {
            key: `${issue}-${shownRef.current}`,
            message,
            actions: available,
            onFolderStorageOff: actions.onFolderStorageOff,
            onReplace: actions.replace,
          })
        : message,
      color: 'yellow',
    });
    return () => {
      notifications.hide(FOLDER_SYNC_NOTICE_ID);
    };
  }, [issue, actions]);
}
