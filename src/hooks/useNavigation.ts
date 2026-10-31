/**
 * Hook for the app's open view and what it focuses on
 *
 * A move is a menu choice or a link from one view to another. Each move to
 * another view, and each move to a view that starts fresh, is a new visit:
 * the view opens at the top, and a view keyed by the visit is built anew.
 */

import { useCallback, useLayoutEffect, useState } from 'react';

export type AppView =
  | 'timeline'
  | 'import'
  | 'trends'
  | 'alerts'
  | 'notes'
  | 'dictionary'
  | 'settings';

/** What a view opens on when another view links to it */
export type ViewFocus =
  | {
      view: 'trends';
      biomarkerKey: string;
      /** Date of the data point to highlight, if any */
      date?: Date;
    }
  | { view: 'timeline'; labResultId: number }
  | { view: 'dictionary'; biomarkerKey: string };

/** Where a move goes: a view, or a view focused on something */
export type Destination = AppView | ViewFocus;

/**
 * Views that start fresh on every move to them, even from themselves. The
 * others keep what the user has entered (an import, a setting being edited),
 * so choosing them while open changes nothing.
 */
const STARTS_FRESH: ReadonlySet<AppView> = new Set(['timeline', 'trends', 'dictionary']);

function viewOf(to: Destination): AppView {
  return typeof to === 'string' ? to : to.view;
}

interface NavState {
  to: Destination;
  visit: number;
}

export interface UseNavigationResult {
  view: AppView;
  focus: ViewFocus | null;
  /** Changes with every visit; key a view by it to build it anew */
  visit: number;
  go: (to: Destination) => void;
}

export function useNavigation(): UseNavigationResult {
  const [{ to, visit }, setNav] = useState<NavState>({ to: 'timeline', visit: 0 });

  // A visit opens at the top, not at the last view's scroll
  useLayoutEffect(() => window.scrollTo(0, 0), [visit]);

  const go = useCallback(
    (destination: Destination) =>
      setNav((prev) => {
        const view = viewOf(destination);
        if (view === viewOf(prev.to) && !STARTS_FRESH.has(view)) return prev;
        return { to: destination, visit: prev.visit + 1 };
      }),
    []
  );

  return { view: viewOf(to), focus: typeof to === 'string' ? null : to, visit, go };
}
