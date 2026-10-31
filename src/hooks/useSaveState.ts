/**
 * The state of a save made from a place that shows its own failure, such as
 * a note editor or a confirmation dialog
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { notifySaveFailed } from '@components/common/notifySaveFailed';

export interface SaveState {
  /** Whether a save from the place as now open is under way */
  isSaving: boolean;
  /** Why the last save failed, to show in place; null when it did not */
  error: unknown;
  /** Run a save; resolves to whether it was saved while its place is still open */
  run: (save: () => Promise<void>) => Promise<boolean>;
  /** The place is closed: forget its save, and notify a failure still to come */
  clear: () => void;
}

/**
 * A failure is shown in place while the place is open. One that comes after
 * it was closed or removed is notified instead: a save never fails unseen.
 * A place opened again starts afresh, whatever an earlier save still does.
 *
 * @param title - What was not saved, for the notification, e.g. "Note not saved"
 */
export function useSaveState(title: string): SaveState {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const mounted = useRef(true);
  // Each opening of the place; a save belongs to the one it was made from
  const opening = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (save: () => Promise<void>): Promise<boolean> => {
      const from = opening.current;
      const open = (): boolean => mounted.current && opening.current === from;
      setIsSaving(true);
      setError(null);
      try {
        await save();
        return open();
      } catch (err) {
        if (open()) setError(err);
        else notifySaveFailed(title, err);
        return false;
      } finally {
        if (open()) setIsSaving(false);
      }
    },
    [title]
  );

  const clear = useCallback(() => {
    opening.current += 1;
    setIsSaving(false);
    setError(null);
  }, []);

  return { isSaving, error, run, clear };
}
