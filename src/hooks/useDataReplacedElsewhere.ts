/**
 * Reload what this tab shows when another tab of this browser replaces the
 * data (a folder copy loaded, a restore): the records now have new IDs
 */

import { useEffect, useLayoutEffect, useRef } from 'react';
import { onDataReplacedElsewhere } from '@data/db/dataReplacedEvents';

export function useDataReplacedElsewhere(onReplaced: () => void): void {
  // The latest callback, without listening again on every render
  const onReplacedRef = useRef(onReplaced);
  useLayoutEffect(() => {
    onReplacedRef.current = onReplaced;
  }, [onReplaced]);

  useEffect(() => onDataReplacedElsewhere(() => onReplacedRef.current()), []);
}
