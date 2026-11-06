/**
 * Set-aside changes: records moved aside, saved to a file, returned or
 * deleted. The database and the parts of the app that show or wait for
 * set-aside records (the banner, folder sync) are apart; this tells them to
 * count again.
 */

import { createWindowEvent } from '@/utils/createWindowEvent';
import type { SealedTable } from './index';

export interface SetAsideChange {
  /** Tables a row was just moved aside from; [] for other changes */
  movedAside: SealedTable[];
}

const setAsideChanged = createWindowEvent<SetAsideChange>('hemoio:set-aside-changed');

export function notifySetAsideChanged(change: SetAsideChange = { movedAside: [] }): void {
  setAsideChanged.notify(change);
}

/** Listen for set-aside changes; returns the function that stops listening */
export const onSetAsideChanged = setAsideChanged.on;
