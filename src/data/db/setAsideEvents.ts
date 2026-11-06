/**
 * Set-aside changes: records moved aside, saved to a file, returned or
 * deleted. The database and the parts of the app that show or wait for
 * set-aside records (the banner, folder sync) are apart; this tells them to
 * count again.
 */

import type { SealedTable } from './index';

const SET_ASIDE_CHANGED = 'hemoio:set-aside-changed';

export interface SetAsideChange {
  /** Tables a row was just moved aside from; [] for other changes */
  movedAside: SealedTable[];
}

export function notifySetAsideChanged(change: SetAsideChange = { movedAside: [] }): void {
  window.dispatchEvent(new CustomEvent<SetAsideChange>(SET_ASIDE_CHANGED, { detail: change }));
}

/** Listen for set-aside changes; returns the function that stops listening */
export function onSetAsideChanged(listener: (change: SetAsideChange) => void): () => void {
  const handle = (event: Event): void => listener((event as CustomEvent<SetAsideChange>).detail);
  window.addEventListener(SET_ASIDE_CHANGED, handle);
  return () => window.removeEventListener(SET_ASIDE_CHANGED, handle);
}
