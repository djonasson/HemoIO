import { useEffect, useState } from 'react';

/** How far, in CSS pixels, the page must be pulled down from its top to refresh */
export const PULL_DISTANCE = 80;

/** Where a pull is: none, pulled not yet far enough, or far enough to refresh on release */
export type PullState = 'idle' | 'pulling' | 'ready';

/**
 * Pull the page down from its top on a touch screen to refresh: `onRefresh`
 * (kept stable by the caller) runs on release once the pull went
 * PULL_DISTANCE down. The browser's own pull-to-reload is turned off in
 * index.html (overscroll-behavior), as a reload locks HemoIO.
 */
export function usePullToRefresh(onRefresh: () => void, enabled: boolean): PullState {
  const [state, setState] = useState<PullState>('idle');

  useEffect(() => {
    if (!enabled) return;
    // Where the pull began, while one is under way, and how far it went
    let startY: number | undefined;
    let pulled = 0;

    const stop = (): void => {
      if (startY !== undefined) setState('idle');
      startY = undefined;
      pulled = 0;
    };
    const onStart = (event: TouchEvent): void => {
      // Only a pull that starts at the top of the page, with one finger
      if (window.scrollY <= 0 && event.touches.length === 1) startY = event.touches[0].clientY;
    };
    const onMove = (event: TouchEvent): void => {
      if (startY === undefined) return;
      pulled = event.touches[0].clientY - startY;
      if (pulled <= 0) return stop();
      setState(pulled >= PULL_DISTANCE ? 'ready' : 'pulling');
    };
    const onEnd = (): void => {
      if (startY !== undefined && pulled >= PULL_DISTANCE) onRefresh();
      stop();
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', stop);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', stop);
    };
  }, [enabled, onRefresh]);

  return enabled ? state : 'idle';
}
