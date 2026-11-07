import { describe, it, expect, vi, afterEach } from 'vitest';
import { SET_ASIDE_CHANNEL_NAME, notifySetAsideChanged, onSetAsideChanged } from './setAsideEvents';

/** Another tab of this browser, on the same channel */
let otherTab: BroadcastChannel | null = null;

/** Lets messages already posted arrive */
const delivered = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

describe('set-aside events', () => {
  it('tells every listener what changed, until it unsubscribes', () => {
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = onSetAsideChanged(first);
    const stopSecond = onSetAsideChanged(second);

    notifySetAsideChanged({ movedAside: ['labResults'] });
    stopFirst();
    notifySetAsideChanged();
    stopSecond();

    expect(first.mock.calls).toEqual([[{ movedAside: ['labResults'] }]]);
    expect(second.mock.calls).toEqual([[{ movedAside: ['labResults'] }], [{ movedAside: [] }]]);
  });

  describe('across the tabs of this browser (P43)', () => {
    afterEach(() => {
      otherTab?.close();
      otherTab = null;
    });

    it('tells the other tabs that the set-aside rows changed, and nothing more', async () => {
      const received: unknown[] = [];
      otherTab = new BroadcastChannel(SET_ASIDE_CHANNEL_NAME);
      otherTab.onmessage = (event: MessageEvent) => received.push(event.data);

      notifySetAsideChanged({ movedAside: ['labResults'] });
      await delivered();

      expect(received).toEqual([{ type: 'changed' }]);
    });

    it('hears another tab, as a change with nothing moved aside here, and not its own once more', async () => {
      otherTab = new BroadcastChannel(SET_ASIDE_CHANNEL_NAME);
      const listener = vi.fn();
      const stop = onSetAsideChanged(listener);

      otherTab.postMessage({ type: 'changed' });
      notifySetAsideChanged({ movedAside: ['testValues'] });
      await delivered();
      stop();

      expect(listener.mock.calls).toEqual([[{ movedAside: ['testValues'] }], [{ movedAside: [] }]]);
    });
  });
});
