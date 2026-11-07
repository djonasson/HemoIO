/**
 * What the user may do about a folder copy that cannot be read: the one
 * policy for the restore question, the sync notice, Settings and the sync
 * itself (which copies it may write over once the user chose to replace
 * them: REPLACEABLE in folderSync, derived from this table).
 */

import type { FolderCopyProblem } from './folderCopy';
import type { FolderProtectionReason } from './folderSync';

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
 * For the sync notice, by the same table: 'unreadable' cannot tell a
 * damaged copy from one under another key, so it reads as 'cannot-decrypt'
 * and its replace warns. The notices about this browser's own data, or a
 * failed write, offer nothing.
 */
export function folderSyncIssueActions(issue: FolderProtectionReason | 'failed'): FolderProblemActions {
  switch (issue) {
    case 'unreadable':
      return folderCopyProblemActions('cannot-decrypt');
    case 'before-loinc':
    case 'another-setup':
      return folderCopyProblemActions(issue);
    case 'newer':
      return folderCopyProblemActions('newer-version');
    case 'empty':
    case 'set-aside':
    case 'failed':
      return NONE;
  }
}
