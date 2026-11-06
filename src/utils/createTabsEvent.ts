/**
 * A notify/listen pair for one event, heard in this tab and in the other
 * tabs of this browser: in this tab on window (createWindowEvent), in the
 * others on a BroadcastChannel. The message carries nothing but that
 * something changed; each tab reads what it needs again.
 */

import { createWindowEvent } from './createWindowEvent';

interface ChangedMessage {
  type: 'changed';
}

function isChangedMessage(data: unknown): data is ChangedMessage {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'changed';
}

export interface TabsEvent {
  notify: () => void;
  /** Listen, in this tab or another; returns the function that stops listening */
  on: (listener: () => void) => () => void;
}

export function createTabsEvent(windowEventName: string, channelName: string): TabsEvent {
  const local = createWindowEvent(windowEventName);
  /** How many listen in this tab, and the channel open while any do */
  let listening = 0;
  /** One per tab: a channel never hears its own messages, so this tab hears none of its own */
  let channel: BroadcastChannel | null = null;

  return {
    notify: () => {
      local.notify();
      if (typeof BroadcastChannel === 'undefined') return;
      const message: ChangedMessage = { type: 'changed' };
      if (channel) {
        channel.postMessage(message);
        return;
      }
      const once = new BroadcastChannel(channelName);
      once.postMessage(message);
      once.close();
    },
    on: (listener) => {
      const stop = local.on(() => listener());
      listening++;
      if (!channel && typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(channelName);
        // Told again in this tab, where every listener hears it
        channel.onmessage = (event: MessageEvent) => {
          if (isChangedMessage(event.data)) local.notify();
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
    },
  };
}
