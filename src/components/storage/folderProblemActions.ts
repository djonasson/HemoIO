/**
 * What the user may do about a folder copy that cannot be read: the same
 * choices where the restore question asks and where the sync notice tells.
 */

import type { FolderCopyProblem } from '@services/sync';
import type { FolderSyncIssue } from '@hooks/useFilesystemSync';

export interface FolderProblemActions {
  /** Pick another folder to sync with */
  chooseFolder: boolean;
  /**
   * Replace the copy with this computer's data, after keeping it as a dated
   * backup: 'warn' when the copy may be someone else's (another password or
   * setup), whose data then no longer syncs from the folder
   */
  replace: false | 'replace' | 'warn';
  /** Read the folder again: the file could not be read at all */
  tryAgain: boolean;
}

/** Choosing a folder failed: fixed text, never the error, which can name a path */
export const CHOOSE_FOLDER_FAILED =
  'The folder could not be chosen. Nothing was changed; try again, or choose a folder in Settings, on the Data tab.';

const NONE: FolderProblemActions = { chooseFolder: false, replace: false, tryAgain: false };

/**
 * For the restore question. Another setup's copy is never replaced: other
 * computers may still sync from it (Start over is the way to join it). A
 * copy from a newer HemoIO is restored by updating, so nothing is offered.
 */
export function folderCopyProblemActions(reason: FolderCopyProblem): FolderProblemActions {
  switch (reason) {
    case 'before-loinc':
    case 'not-a-copy':
    case 'damaged-copy':
      return { ...NONE, chooseFolder: true, replace: 'replace' };
    case 'cannot-decrypt':
      return { ...NONE, chooseFolder: true, replace: 'warn' };
    case 'another-setup':
      return { ...NONE, chooseFolder: true };
    case 'read-failed':
      return { ...NONE, chooseFolder: true, tryAgain: true };
    case 'newer-version':
      return NONE;
  }
}

/**
 * For the sync notice. 'unreadable' cannot tell a damaged copy from one
 * under another key, so its replace warns. The notices about this browser's
 * own data, or a failed write, offer nothing.
 */
export function folderSyncIssueActions(issue: FolderSyncIssue): FolderProblemActions {
  switch (issue) {
    case 'before-loinc':
      return { ...NONE, chooseFolder: true, replace: 'replace' };
    case 'unreadable':
      return { ...NONE, chooseFolder: true, replace: 'warn' };
    case 'another-setup':
      return { ...NONE, chooseFolder: true };
    case 'newer':
    case 'empty':
    case 'set-aside':
    case 'failed':
      return NONE;
  }
}
