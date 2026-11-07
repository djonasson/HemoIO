/**
 * Tells the user when the folder sync holds back to protect the folder copy,
 * or cannot write to the folder
 */

import { createElement, useEffect, useLayoutEffect, useRef } from 'react';
import { notifications } from '@mantine/notifications';
import { showPersistentNotice } from '@components/common/showPersistentNotice';
import { FolderSyncNoticeBody } from '@components/storage/FolderSyncNoticeBody';
import { folderSyncIssueActions } from '@components/storage/folderProblemActions';
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
      "To keep syncing, choose another folder, or replace the folder copy with this computer's data.",
  },
  'another-setup': {
    title: SKIPPED,
    message:
      "Your folder holds another HemoIO setup's copy, so HemoIO left it as it is. " +
      'Choose a different folder in Settings > Data, or use Start over in Settings > Security ' +
      'to set up from that copy.',
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
      "To keep syncing, choose another folder, or replace the folder copy with this computer's data.",
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

/** What the notice's buttons do */
export interface FolderSyncNoticeActions {
  /**
   * Show the folder picker; called straight from the click. Resolves false
   * when cancelled, and rejects when the folder could not be chosen.
   */
  chooseFolder: () => Promise<boolean>;
  /** Ask to confirm replacing the folder copy the issue is about */
  replace: (issue: FolderSyncIssue) => void;
}

/**
 * One notice per issue, kept open until dismissed: a sync every 30 seconds
 * must not repeat it, and one that writes again takes it away. A copy that
 * cannot be read comes with what can be done about it (folderSyncIssueActions).
 */
export function useFolderSyncNotice(issue: FolderSyncIssue | null, actions?: FolderSyncNoticeActions): void {
  // The latest, read at the click: the notice is not shown again for new callbacks
  const actionsRef = useRef(actions);
  useLayoutEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  useEffect(() => {
    if (!issue) return;

    const { title, message } = NOTICES[issue];
    const available = actionsRef.current ? folderSyncIssueActions(issue) : null;
    const offered = available !== null && (available.chooseFolder || available.replace !== false);
    showPersistentNotice({
      id: FOLDER_SYNC_NOTICE_ID,
      title,
      message: offered
        ? createElement(FolderSyncNoticeBody, {
            message,
            actions: available,
            onChooseFolder: () => actionsRef.current?.chooseFolder() ?? Promise.resolve(false),
            onReplace: () => actionsRef.current?.replace(issue),
          })
        : message,
      color: 'yellow',
    });
    return () => {
      notifications.hide(FOLDER_SYNC_NOTICE_ID);
    };
  }, [issue]);
}
