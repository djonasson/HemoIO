/**
 * What the app offers about a folder copy the sync cannot read: the sync
 * notice's buttons, the replace confirmation they and Settings open, and
 * the state Settings shows once the notice is dismissed.
 */

import { useCallback, useMemo, useState } from 'react';
import { folderSyncIssueActions } from '@components/storage/folderProblemActions';
import { chooseFolder } from '@data/storage/chooseFolder';
import { isFolderStorageOn } from '@data/storage/storageChoice';
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
  /** Props for ReplaceFolderCopyModal; `key` is new for each opening */
  confirmation: {
    key: number;
    opened: boolean;
    warnOtherSetup: boolean;
    onReplace: () => Promise<FolderReplaceResult | undefined>;
    onClose: () => void;
  };
  noticeActions: FolderSyncNoticeActions;
  issueState: FolderSyncIssueState;
}

interface Asked {
  opening: number;
  issue: FolderSyncIssue;
  target: UnreadableCopyTarget;
}

export function useFolderSyncReplace({
  issue,
  issueTarget,
  replaceFolderCopy,
  syncNow,
}: UseFolderSyncReplaceOptions): UseFolderSyncReplaceResult {
  const [asked, setAsked] = useState<Asked | null>(null);
  // The last opening, kept while the confirmation closes
  const [opening, setOpening] = useState(0);
  // The confirmation is about the copy the sync found: once it finds another, or none, it closes
  if (asked !== null && (asked.issue !== issue || asked.target.fileId !== issueTarget?.fileId)) setAsked(null);

  const replaceable = issue !== null && issueTarget !== null && folderSyncIssueActions(issue).replace !== false;

  const askReplace = useCallback(() => {
    if (!replaceable || issue === null || issueTarget === null) return;
    const next = opening + 1;
    setOpening(next);
    setAsked({ opening: next, issue, target: issueTarget });
  }, [replaceable, issue, issueTarget, opening]);

  const syncAgain = useCallback(() => {
    // A failure is told by the sync, as for every sync
    void syncNow().catch(() => undefined);
  }, [syncNow]);

  const chooseAnotherFolder = useCallback((): Promise<boolean> => {
    // Switched off meanwhile: nothing to choose, and the next sync takes the notice away
    if (!isFolderStorageOn()) {
      syncAgain();
      return Promise.resolve(false);
    }
    return chooseFolder();
  }, [syncAgain]);

  const onReplace = useCallback(async (): Promise<FolderReplaceResult | undefined> => {
    if (asked === null) return undefined;
    const result = await replaceFolderCopy({ kind: 'unreadable', ...asked.target });
    // Writes over the copy kept, taking the notice away; or, the copy
    // changed, tells what the folder holds now
    syncAgain();
    return result;
  }, [asked, replaceFolderCopy, syncAgain]);

  const askedOpening = asked?.opening;
  // Only the opening it belongs to: a replace that settles late never closes a later one
  const onClose = useCallback(() => {
    setAsked((current) => (current?.opening === askedOpening ? null : current));
  }, [askedOpening]);

  const noticeActions = useMemo<FolderSyncNoticeActions>(
    () => ({ chooseFolder: chooseAnotherFolder, replace: () => askReplace() }),
    [chooseAnotherFolder, askReplace]
  );
  const issueState = useMemo<FolderSyncIssueState>(() => ({ replaceable, askReplace }), [replaceable, askReplace]);

  return {
    confirmation: {
      key: opening,
      opened: asked !== null,
      warnOtherSetup: asked !== null && folderSyncIssueActions(asked.issue).replace === 'warn',
      onReplace,
      onClose,
    },
    noticeActions,
    issueState,
  };
}
