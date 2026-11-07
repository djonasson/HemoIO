/**
 * What the app offers about a folder copy the sync cannot read: the sync
 * notice's buttons, the replace confirmation they and Settings open, and
 * the state Settings shows once the notice is dismissed.
 */

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { folderSyncIssueActions } from '@services/sync';
import type { FolderReplaceChoice, FolderReplaceResult, FolderSyncIssue, UnreadableCopyTarget } from './useFilesystemSync';
import type { FolderSyncIssueState } from './useFolderSyncIssue';
import type { FolderSyncNoticeActions } from './useFolderSyncNotice';

export interface UseFolderSyncReplaceOptions {
  issue: FolderSyncIssue | null;
  issueTarget: UnreadableCopyTarget | null;
  replaceFolderCopy: (choice: FolderReplaceChoice) => Promise<FolderReplaceResult>;
  syncNow: () => Promise<void>;
}

export interface UseFolderSyncReplaceResult {
  /** Props for ReplaceFolderCopyModal; `key` is new for each opening, so each starts afresh */
  confirmation: {
    key: number;
    opened: boolean;
    warnOtherSetup: boolean;
    onReplace: () => Promise<FolderReplaceResult | undefined>;
    onClose: () => void;
  };
  /** The same object for the whole session: the notice is not shown again for new callbacks */
  noticeActions: FolderSyncNoticeActions;
  issueState: FolderSyncIssueState;
}

/** The confirmation open: the copy it is about */
interface Asked {
  issue: FolderSyncIssue;
  target: UnreadableCopyTarget;
  warn: boolean;
}

export function useFolderSyncReplace({
  issue,
  issueTarget,
  replaceFolderCopy,
  syncNow,
}: UseFolderSyncReplaceOptions): UseFolderSyncReplaceResult {
  const [asked, setAsked] = useState<Asked | null>(null);
  // The confirmation's opening, its key, kept while it closes
  const [opening, setOpening] = useState(0);
  const openingsRef = useRef(0);
  // The confirmation is about the copy the sync found: once it finds another, or none, it closes
  if (asked !== null && (asked.issue !== issue || asked.target.fileId !== issueTarget?.fileId)) setAsked(null);

  const replace = issue === null ? false : folderSyncIssueActions(issue).replace;
  const replaceable = replace !== false && issueTarget !== null;

  // Read at the click, so the notice's actions stay the same object
  const latestRef = useRef({ issue, issueTarget, replace, syncNow });
  useLayoutEffect(() => {
    latestRef.current = { issue, issueTarget, replace, syncNow };
  }, [issue, issueTarget, replace, syncNow]);

  const askReplace = useCallback(() => {
    const { issue: current, issueTarget: target, replace: offered } = latestRef.current;
    if (current === null || target === null || offered === false) return;
    openingsRef.current += 1;
    setOpening(openingsRef.current);
    setAsked({ issue: current, target, warn: offered === 'warn' });
  }, []);

  const syncAgain = useCallback(() => {
    // A failure is told by the sync, as for every sync
    void latestRef.current.syncNow().catch(() => undefined);
  }, []);

  const onReplace = useCallback(async (): Promise<FolderReplaceResult | undefined> => {
    if (asked === null) return undefined;
    const result = await replaceFolderCopy({ kind: 'unreadable', ...asked.target });
    // Writes over the copy kept, taking the notice away; or, the copy
    // changed, tells what the folder holds now
    syncAgain();
    return result;
  }, [asked, replaceFolderCopy, syncAgain]);

  const onClose = useCallback(() => setAsked(null), []);

  // Switched off meanwhile: the sync takes the notice away
  const noticeActions = useMemo<FolderSyncNoticeActions>(
    () => ({ replace: askReplace, onFolderStorageOff: syncAgain }),
    [askReplace, syncAgain]
  );
  const issueState = useMemo<FolderSyncIssueState>(() => ({ replaceable, askReplace }), [replaceable, askReplace]);

  return {
    confirmation: {
      key: opening,
      opened: asked !== null,
      warnOtherSetup: asked?.warn ?? false,
      onReplace,
      onClose,
    },
    noticeActions,
    issueState,
  };
}
