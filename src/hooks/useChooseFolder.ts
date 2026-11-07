/**
 * "Choose another folder", where a folder copy cannot be read: the picker,
 * shown straight from the click, and whether choosing failed.
 */

import { useCallback, useState } from 'react';

export interface UseChooseFolderResult {
  /** Call straight from the click: the picker needs its user activation */
  choose: () => void;
  /** The folder could not be chosen: nothing was changed */
  failed: boolean;
  /** Forget a failure: for a new question */
  reset: () => void;
}

/**
 * `chooseFolder` shows the picker (chooseFolder in the data layer, or a
 * wrapper of it); it resolves whether a folder was chosen, and rejects when
 * the folder could not be chosen. A folder chosen is looked at afresh by the
 * sync and the restore question, which closes what offered it.
 */
export function useChooseFolder(chooseFolder: () => Promise<boolean>): UseChooseFolderResult {
  const [failed, setFailed] = useState(false);
  const choose = useCallback(() => {
    setFailed(false);
    // Nothing awaited first: the picker needs the click's user activation
    chooseFolder().catch(() => setFailed(true));
  }, [chooseFolder]);
  const reset = useCallback(() => setFailed(false), []);
  return { choose, failed, reset };
}
