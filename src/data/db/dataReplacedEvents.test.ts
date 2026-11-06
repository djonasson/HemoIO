import { describe, it, expect, vi, afterEach } from 'vitest';
import { DATA_CHANNEL_NAME, announceDataReplaced, onDataReplacedElsewhere } from './dataReplacedEvents';

/** Another tab of this browser, on the same channel */
let otherTab: BroadcastChannel | null = null;

function openOtherTab(): { tab: BroadcastChannel; received: unknown[] } {
  const received: unknown[] = [];
  otherTab = new BroadcastChannel(DATA_CHANNEL_NAME);
  otherTab.onmessage = (event: MessageEvent) => received.push(event.data);
  return { tab: otherTab, received };
}

/** Lets messages already posted arrive */
const delivered = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

describe('dataReplacedEvents', () => {
  afterEach(() => {
    otherTab?.close();
    otherTab = null;
  });

  it("tells other tabs that this tab's data was replaced, and nothing more", async () => {
    const { received } = openOtherTab();

    announceDataReplaced();
    await delivered();

    expect(received).toEqual([{ type: 'replaced' }]);
  });

  it('hears another tab replace its data, until it stops listening', async () => {
    const { tab } = openOtherTab();
    const listener = vi.fn();
    const stop = onDataReplacedElsewhere(listener);

    tab.postMessage({ type: 'replaced' });
    await delivered();
    expect(listener).toHaveBeenCalledTimes(1);

    stop();
    tab.postMessage({ type: 'replaced' });
    await delivered();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('never hears its own announcement, nor a message of another kind', async () => {
    const { tab } = openOtherTab();
    const listener = vi.fn();
    const stop = onDataReplacedElsewhere(listener);

    announceDataReplaced();
    tab.postMessage({ type: 'something-else' });
    tab.postMessage(null);
    await delivered();

    expect(listener).not.toHaveBeenCalled();
    stop();
  });
});
