/**
 * Reload what this tab shows when the data is replaced (a folder copy
 * loaded, a restore): the records now have new IDs
 */

import { useEffect, useLayoutEffect, useRef } from 'react';
import { onDataReplaced, onDataReplacedElsewhere } from '@data/db/dataReplacedEvents';

function useListener(listen: (listener: () => void) => () => void, onReplaced: () => void): void {
  // The latest callback, without listening again on every render
  const onReplacedRef = useRef(onReplaced);
  useLayoutEffect(() => {
    onReplacedRef.current = onReplaced;
  }, [onReplaced]);

  useEffect(() => listen(() => onReplacedRef.current()), [listen]);
}

/** When another tab of this browser replaces the data */
export function useDataReplacedElsewhere(onReplaced: () => void): void {
  useListener(onDataReplacedElsewhere, onReplaced);
}

/** When this tab or another replaces the data */
export function useDataReplaced(onReplaced: () => void): void {
  useListener(onDataReplaced, onReplaced);
}
