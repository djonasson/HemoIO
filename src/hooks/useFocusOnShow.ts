/**
 * Moves focus to an element each time `shown` becomes a new value other
 * than null or false: a screen reader user is taken to what just appeared
 * (an error, say), which needs tabIndex -1 if it is not focusable
 */

import { useEffect, useRef, type RefObject } from 'react';

export function useFocusOnShow<T extends HTMLElement>(shown: unknown): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (shown !== null && shown !== undefined && shown !== false && shown !== '') ref.current?.focus();
  }, [shown]);
  return ref;
}
