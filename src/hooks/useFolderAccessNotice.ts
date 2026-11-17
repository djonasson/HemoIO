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
 * Looks when HemoIO is unlocked, whenever folder access changes (granted
 * here or in Settings, another folder chosen, folder storage switched), and
 * when HemoIO is looked at again, as after allowing the folder in the
 * browser's site settings: the notice stays until access is given, or is
 * dismissed. Access given, the restore check and the sync start over at
 * once, as they do on every change of folder access.
 */
export function useFolderAccessNotice(): void {
  const [problem, setProblem] = useState<FolderAccessProblem | null>(null);
  // Set while unlocked: the notice looks again with it after its buttons
  const lookRef = useRef<() => void>(() => {});
  const lookAgain = useCallback(() => lookRef.current(), []);

  useEffect(() => {
    let latest = 0;
    let closed = false;
    const look = (): void => {
      const asked = ++latest;
      folderAccessProblem()
        // The folder cannot be looked at: no question to ask about it
        .catch(() => null)
        .then((next) => {
          if (!closed && asked === latest) setProblem(next);
        });
    };
    lookRef.current = look;
    look();
    const stop = onFolderAccessChanged(look);
    const lookWhenShown = (): void => {
      if (document.visibilityState === 'visible') look();
    };
    window.addEventListener('focus', look);
    document.addEventListener('visibilitychange', lookWhenShown);
    return () => {
      closed = true;
      stop();
      window.removeEventListener('focus', look);
      document.removeEventListener('visibilitychange', lookWhenShown);
    };
  }, []);

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
        onLookAgain: lookAgain,
      }),
      color: 'yellow',
    });
    return () => {
      notifications.hide(FOLDER_ACCESS_NOTICE_ID);
    };
  }, [problem, lookAgain]);
}
