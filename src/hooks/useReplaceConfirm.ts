/**
 * The state of a "Replace folder copy" confirmation: whether the replace
 * runs, and whether it failed. A confirmation closed or opened again starts
 * afresh (reset), and a replace still running from before it then settles
 * unseen: it neither shows a failure nor closes the confirmation open now.
 */

import { useCallback, useRef, useState } from 'react';

export interface UseReplaceConfirmResult {
  isReplacing: boolean;
  /** The last replace failed: nothing was changed */
  failed: boolean;
  /** Start afresh: on opening or closing the confirmation */
  reset: () => void;
  /**
   * Run the replace. Resolves its result once done, undefined when it
   * failed (shown as `failed`) or when the confirmation was reset meanwhile.
   */
  run: <T>(replace: () => Promise<T>) => Promise<{ value: T } | undefined>;
}

export function useReplaceConfirm(): UseReplaceConfirmResult {
  const [isReplacing, setIsReplacing] = useState(false);
  const [failed, setFailed] = useState(false);
  // Which opening of the confirmation a replace belongs to
  const openingRef = useRef(0);

  const reset = useCallback(() => {
    openingRef.current += 1;
    setIsReplacing(false);
    setFailed(false);
  }, []);

  const run = useCallback(async <T,>(replace: () => Promise<T>): Promise<{ value: T } | undefined> => {
    const opening = openingRef.current;
    setIsReplacing(true);
    setFailed(false);
    let value: T;
    try {
      value = await replace();
    } catch {
      // Not shown: the reason could name the folder, and nothing was chosen
      if (opening === openingRef.current) {
        setIsReplacing(false);
        setFailed(true);
      }
      return undefined;
    }
    if (opening !== openingRef.current) return undefined;
    setIsReplacing(false);
    return { value };
  }, []);

  return { isReplacing, failed, reset, run };
}
