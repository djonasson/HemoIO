/**
 * Hook for whether a box's content is wider than the box
 */

import { useCallback, useState } from 'react';

/**
 * Whether the element the returned ref is set on has content wider than
 * itself, kept up to date as either is resized. A scroll box uses it to be
 * focusable, and so scrollable by keyboard, only while there is anything to
 * scroll.
 */
export function useOverflowsX<T extends HTMLElement>(): [
  ref: (element: T | null) => void,
  overflows: boolean,
] {
  const [overflows, setOverflows] = useState(false);

  const ref = useCallback((element: T | null) => {
    if (!element) return;
    const measure = () => setOverflows(element.scrollWidth > element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of Array.from(element.children)) observer.observe(child);
    // React 19 runs a ref callback's cleanup when the element goes
    return () => observer.disconnect();
  }, []);

  return [ref, overflows];
}
