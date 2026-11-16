/**
 * Tells the user when HemoIO needs their permission to use the folder again,
 * as browsers ask after they were reopened, with the button that asks for it:
 * until then nothing is read from the folder or saved to it
 */

import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { showPersistentNotice } from '@components/common/showPersistentNotice';
import { FolderAccessNoticeBody } from '@components/storage/FolderAccessNoticeBody';
import { currentFolder } from '@data/storage/StorageProviderFactory';
import { onFolderAccessChanged } from '@data/storage/folderAccessEvents';
import { isFolderStorageOn } from '@data/storage/storageChoice';

export const FOLDER_ACCESS_NOTICE_ID = 'folder-access';

/** 'needed': the browser asks for permission; 'blocked': it no longer asks */
type FolderAccessProblem = 'needed' | 'blocked';

async function folderAccessProblem(): Promise<FolderAccessProblem | null> {
  if (!isFolderStorageOn()) return null;
  const state = await currentFolder().getPermissionState();
  return state === 'prompt' ? 'needed' : state === 'denied' ? 'blocked' : null;
}

/**
 * Looks when HemoIO is unlocked, and again whenever folder access changes
 * (granted here or in Settings, another folder chosen, folder storage
 * switched): the notice stays until access is given, or is dismissed.
 * `onGranted`: access was given from the notice, so the folder is used at once.
 */
export function useFolderAccessNotice(onGranted: () => void): void {
  const [problem, setProblem] = useState<FolderAccessProblem | null>(null);
  const [looks, setLooks] = useState(0);
  const lookAgain = useCallback(() => setLooks((n) => n + 1), []);

  useEffect(() => {
    let latest = 0;
    let closed = false;
    const look = (): void => {
      const asked = ++latest;
      folderAccessProblem().then(
        (next) => {
          if (!closed && asked === latest) setProblem(next);
        },
        // The folder cannot be looked at: no question to ask about it
        () => {
          if (!closed && asked === latest) setProblem(null);
        }
      );
    };
    look();
    const stop = onFolderAccessChanged(look);
    return () => {
      closed = true;
      stop();
    };
  }, [looks]);

  // Each notice shown gets a body of its own, so a refusal shown in the last does not carry over
  const shownRef = useRef(0);
  useEffect(() => {
    if (!problem) return;
    shownRef.current += 1;
    showPersistentNotice({
      id: FOLDER_ACCESS_NOTICE_ID,
      title: problem === 'needed' ? 'Folder access needed' : 'Folder access blocked',
      message: createElement(FolderAccessNoticeBody, {
        key: `${problem}-${shownRef.current}`,
        blocked: problem === 'blocked',
        onGranted,
        onFolderStorageOff: lookAgain,
      }),
      color: 'yellow',
    });
    return () => {
      notifications.hide(FOLDER_ACCESS_NOTICE_ID);
    };
  }, [problem, onGranted, lookAgain]);
}
