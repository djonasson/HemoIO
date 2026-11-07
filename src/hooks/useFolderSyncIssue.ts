/**
 * The folder sync's issue, where the app shows more than the notice: a copy
 * that cannot be read stays to be replaced from Settings once the notice is
 * dismissed. AppShell, which runs the sync, provides it.
 */

import { createContext, useContext } from 'react';

export interface FolderSyncIssueState {
  /** The folder copy cannot be read, and the user may replace it */
  replaceable: boolean;
  /** Ask to confirm replacing it (the same confirmation as the notice's) */
  askReplace: () => void;
}

export const FolderSyncIssueContext = createContext<FolderSyncIssueState | null>(null);

/** Null outside AppShell, where no folder sync runs */
export function useFolderSyncIssue(): FolderSyncIssueState | null {
  return useContext(FolderSyncIssueContext);
}
