import { useEffect, useRef, useState } from 'react';

/** How far, in CSS pixels, the page must be pulled down from its top to refresh */
export const PULL_DISTANCE = 80;

/** Where a pull is: none, pulled not yet far enough, or far enough to refresh on release */
export type PullState = 'idle' | 'pulling' | 'ready';

/**
 * Pull the page down from its top on a touch screen to refresh: `onRefresh`
 * runs on release once the pull went PULL_DISTANCE down. The browser's own
 * pull-to-reload is turned off in index.html (overscroll-behavior), as a
 * reload locks HemoIO.
 */
export function usePullToRefresh(onRefresh: () => void, enabled: boolean): PullState {
  const [state, setState] = useState<PullState>('idle');
  const latest = useRef(onRefresh);
  useEffect(() => {
    latest.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) return;
    let startY: number | undefined;
    let ready = false;

    const onStart = (event: TouchEvent): void => {
      // Only a pull that starts at the top of the page, with one finger
      startY = window.scrollY <= 0 && event.touches.length === 1 ? event.touches[0].clientY : undefined;
      ready = false;
    };
    const onMove = (event: TouchEvent): void => {
      if (startY === undefined) return;
      const pulled = event.touches[0].clientY - startY;
      if (pulled <= 0) {
        startY = undefined;
        setState('idle');
        return;
      }
      ready = pulled >= PULL_DISTANCE;
      setState(ready ? 'ready' : 'pulling');
    };
    const onEnd = (): void => {
      if (startY !== undefined && ready) latest.current();
      startY = undefined;
      ready = false;
      setState('idle');
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [enabled]);

  return enabled ? state : 'idle';
}
