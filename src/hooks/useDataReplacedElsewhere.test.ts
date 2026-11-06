import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { DATA_CHANNEL_NAME } from '@data/db/dataReplacedEvents';
import { useDataReplacedElsewhere } from './useDataReplacedElsewhere';

let otherTab: BroadcastChannel | null = null;

describe('useDataReplacedElsewhere', () => {
  afterEach(() => {
    otherTab?.close();
    otherTab = null;
  });

  it('runs the latest callback when another tab replaces the data, and stops when unmounted', async () => {
    otherTab = new BroadcastChannel(DATA_CHANNEL_NAME);
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender, unmount } = renderHook(({ onReplaced }) => useDataReplacedElsewhere(onReplaced), {
      initialProps: { onReplaced: first },
    });
    rerender({ onReplaced: latest });

    otherTab.postMessage({ type: 'replaced' });
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1));
    expect(first).not.toHaveBeenCalled();

    unmount();
    otherTab.postMessage({ type: 'replaced' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(latest).toHaveBeenCalledTimes(1);
  });
});
