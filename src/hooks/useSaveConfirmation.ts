/**
 * A short "saved" confirmation, shown once a save has finished
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const SHOWN_FOR_MS = 2000;

export interface SaveConfirmation {
  /** Whether to show the confirmation */
  saved: boolean;
  /** Show it (again, for the full time, when called while it shows) */
  confirm: () => void;
  /** Hide it, as when a later save fails: it would read as if that one was saved */
  clear: () => void;
}

export function useSaveConfirmation(): SaveConfirmation {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const confirm = useCallback(() => {
    clearTimeout(timer.current);
    setSaved(true);
    timer.current = setTimeout(() => setSaved(false), SHOWN_FOR_MS);
  }, []);

  const clear = useCallback(() => {
    clearTimeout(timer.current);
    setSaved(false);
  }, []);

  return { saved, confirm, clear };
}
