/**
 * The state of a "Replace folder copy" confirmation: whether the replace
 * runs, and whether it failed. Mounted only while the confirmation is open,
 * so a confirmation closed or opened again starts afresh, and a replace
 * still running from before it then settles unseen: it neither shows a
 * failure nor closes the confirmation open now.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseReplaceConfirmResult {
  isReplacing: boolean;
  /** The last replace failed: nothing was changed */
  failed: boolean;
  /**
   * Run the replace. Resolves its result once done, undefined when it
   * failed (shown as `failed`) or when the confirmation closed meanwhile.
   */
  run: <T>(replace: () => Promise<T>) => Promise<{ value: T } | undefined>;
}

export function useReplaceConfirm(): UseReplaceConfirmResult {
  const [isReplacing, setIsReplacing] = useState(false);
  const [failed, setFailed] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(async <T,>(replace: () => Promise<T>): Promise<{ value: T } | undefined> => {
    setIsReplacing(true);
    setFailed(false);
    let value: T;
    try {
      value = await replace();
    } catch {
      // Not shown: the reason could name the folder, and nothing was chosen
      if (mountedRef.current) {
        setIsReplacing(false);
        setFailed(true);
      }
      return undefined;
    }
    if (!mountedRef.current) return undefined;
    setIsReplacing(false);
    return { value };
  }, []);

  return { isReplacing, failed, run };
}
