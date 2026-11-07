/**
 * "Choose another folder", where a folder copy cannot be read: the picker,
 * shown straight from the click, and whether choosing failed.
 */

import { useCallback, useState } from 'react';
import { chooseFolder } from '@data/storage/chooseFolder';

export interface UseChooseFolderResult {
  /** Call straight from the click: the picker needs its user activation */
  choose: () => void;
  /** The folder could not be chosen: nothing was changed */
  failed: boolean;
  /** Forget a failure: for a new question */
  reset: () => void;
}

/**
 * A folder chosen is looked at afresh by the sync and the restore question,
 * which closes what offered it. `onFolderStorageOff`: folder storage was
 * switched off meanwhile, so there is no folder to choose; the caller looks
 * again (a recheck, or a sync), which takes the question away.
 */
export function useChooseFolder(onFolderStorageOff: () => void): UseChooseFolderResult {
  const [failed, setFailed] = useState(false);
  const choose = useCallback(() => {
    setFailed(false);
    // Nothing awaited first: the picker needs the click's user activation
    chooseFolder().then(
      (choice) => {
        if (choice === 'off') onFolderStorageOff();
      },
      () => setFailed(true)
    );
  }, [onFolderStorageOff]);
  const reset = useCallback(() => setFailed(false), []);
  return { choose, failed, reset };
}
