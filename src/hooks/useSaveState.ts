/**
 * The state of a save made from a place that shows its own failure, such as
 * a note editor or a confirmation dialog
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { notifySaveFailed } from '@components/common/notifySaveFailed';

export interface SaveState {
  isSaving: boolean;
  /** Why the last save failed, to show in place; null when it did not */
  error: unknown;
  /** Run a save; resolves to whether it was saved */
  run: (save: () => Promise<void>) => Promise<boolean>;
  /** The place is closed: forget the failure, and notify one still to come */
  clear: () => void;
}

/**
 * A failure is shown in place while the place is open. One that comes after
 * it was closed or removed is notified instead: a save never fails unseen.
 *
 * @param title - What was not saved, for the notification, e.g. "Note not saved"
 */
export function useSaveState(title: string): SaveState {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const mounted = useRef(true);
  // Whether the place that shows a failure is open
  const watching = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (save: () => Promise<void>): Promise<boolean> => {
      watching.current = true;
      setIsSaving(true);
      setError(null);
      try {
        await save();
        return true;
      } catch (err) {
        if (mounted.current && watching.current) setError(err);
        else notifySaveFailed(title, err);
        return false;
      } finally {
        if (mounted.current) setIsSaving(false);
      }
    },
    [title]
  );

  const clear = useCallback(() => {
    watching.current = false;
    setError(null);
  }, []);

  return { isSaving, error, run, clear };
}
