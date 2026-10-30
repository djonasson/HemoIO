/**
 * A short "saved" confirmation, shown once a save has finished
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const SHOWN_FOR_MS = 2000;

/**
 * @returns Whether to show the confirmation, and a function that shows it
 *   (again, for the full time, when called while it shows)
 */
export function useSaveConfirmation(): { saved: boolean; confirm: () => void } {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const confirm = useCallback(() => {
    clearTimeout(timer.current);
    setSaved(true);
    timer.current = setTimeout(() => setSaved(false), SHOWN_FOR_MS);
  }, []);

  return { saved, confirm };
}
