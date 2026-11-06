/**
 * Data replaced in another tab of this browser
 *
 * Loading a folder copy, or restoring one or a backup, replaces every lab
 * record under new IDs. The tab that did it reloads what it shows; other
 * open tabs of this browser would keep the old IDs, so a note saved there
 * would lose its link and an edit would fail. They are told on a
 * BroadcastChannel, and reload their data from the database. The message
 * says only that the data was replaced: it carries no data.
 */

export const DATA_CHANNEL_NAME = 'hemoio-data';

interface DataReplacedMessage {
  type: 'replaced';
}

const listeners = new Set<() => void>();
/** Open while this tab listens; a channel never hears its own messages */
let channel: BroadcastChannel | null = null;

function isReplacedMessage(data: unknown): data is DataReplacedMessage {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'replaced';
}

/** Tell the other tabs of this browser that this tab replaced the data */
export function announceDataReplaced(): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const message: DataReplacedMessage = { type: 'replaced' };
  // From the channel this tab listens on, so it does not hear itself
  if (channel) {
    channel.postMessage(message);
    return;
  }
  const once = new BroadcastChannel(DATA_CHANNEL_NAME);
  once.postMessage(message);
  once.close();
}

/** Listen for another tab replacing the data; returns the function that stops listening */
export function onDataReplacedElsewhere(listener: () => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => undefined;
  if (!channel) {
    channel = new BroadcastChannel(DATA_CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent) => {
      if (isReplacedMessage(event.data)) listeners.forEach((each) => each());
    };
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && channel) {
      channel.close();
      channel = null;
    }
  };
}
