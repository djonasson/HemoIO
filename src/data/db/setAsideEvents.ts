/**
 * Set-aside changes: records moved aside, saved to a file, returned or
 * deleted. The database and the parts of the app that show or wait for
 * set-aside records (the banner, folder sync) are apart; this tells them to
 * count again.
 *
 * Other tabs of this browser share the database, so they are told too, on a
 * BroadcastChannel (P43): a download or delete in one tab ends the pause in
 * every tab. The message carries nothing but that the rows changed; another
 * tab hears it as a change with nothing moved aside there.
 */

import { createWindowEvent } from '@/utils/createWindowEvent';
import type { SealedTable } from './index';

export interface SetAsideChange {
  /** Tables a row was just moved aside from; [] for other changes */
  movedAside: SealedTable[];
}

export const SET_ASIDE_CHANNEL_NAME = 'hemoio-set-aside';

interface SetAsideChangedMessage {
  type: 'changed';
}

const setAsideChanged = createWindowEvent<SetAsideChange>('hemoio:set-aside-changed');

/** How many listen in this tab, and the channel open while any do */
let listening = 0;
/** One per tab: a channel never hears its own messages, so this tab hears none of its own */
let channel: BroadcastChannel | null = null;

function isChangedMessage(data: unknown): data is SetAsideChangedMessage {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'changed';
}

export function notifySetAsideChanged(change: SetAsideChange = { movedAside: [] }): void {
  setAsideChanged.notify(change);
  if (typeof BroadcastChannel === 'undefined') return;
  const message: SetAsideChangedMessage = { type: 'changed' };
  if (channel) {
    channel.postMessage(message);
    return;
  }
  const once = new BroadcastChannel(SET_ASIDE_CHANNEL_NAME);
  once.postMessage(message);
  once.close();
}

/** Listen for set-aside changes, in this tab or another; returns the function that stops listening */
export function onSetAsideChanged(listener: (change: SetAsideChange) => void): () => void {
  const stop = setAsideChanged.on(listener);
  listening++;
  if (!channel && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(SET_ASIDE_CHANNEL_NAME);
    // Told again in this tab, where every listener hears it
    channel.onmessage = (event: MessageEvent) => {
      if (isChangedMessage(event.data)) setAsideChanged.notify({ movedAside: [] });
    };
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    stop();
    listening--;
    if (listening === 0 && channel) {
      channel.close();
      channel = null;
    }
  };
}
