import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { PULL_DISTANCE, usePullToRefresh } from './usePullToRefresh';

function touch(type: string, clientY?: number): void {
  const event = new Event(type) as Event & { touches: { clientY: number }[] };
  Object.defineProperty(event, 'touches', { value: clientY === undefined ? [] : [{ clientY }] });
  act(() => {
    window.dispatchEvent(event);
  });
}

function pull(from: number, to: number): void {
  touch('touchstart', from);
  touch('touchmove', to);
  touch('touchend');
}

describe('usePullToRefresh', () => {
  afterEach(() => {
    window.scrollY = 0;
  });

  it('refreshes once a pull from the top of the page goes far enough', () => {
    const onRefresh = vi.fn();
    renderHook(() => usePullToRefresh(onRefresh, true));
    pull(100, 100 + PULL_DISTANCE);
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('does not refresh on a short pull', () => {
    const onRefresh = vi.fn();
    renderHook(() => usePullToRefresh(onRefresh, true));
    pull(100, 100 + PULL_DISTANCE - 1);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('does not refresh on a pull that starts further down the page', () => {
    const onRefresh = vi.fn();
    renderHook(() => usePullToRefresh(onRefresh, true));
    window.scrollY = 200;
    pull(100, 100 + PULL_DISTANCE * 2);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('does not refresh on a push up', () => {
    const onRefresh = vi.fn();
    renderHook(() => usePullToRefresh(onRefresh, true));
    pull(300, 300 - PULL_DISTANCE * 2);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('says whether the pull is far enough while pulling', () => {
    const { result } = renderHook(() => usePullToRefresh(vi.fn(), true));
    touch('touchstart', 100);
    touch('touchmove', 120);
    expect(result.current).toBe('pulling');
    touch('touchmove', 100 + PULL_DISTANCE);
    expect(result.current).toBe('ready');
    touch('touchend');
    expect(result.current).toBe('idle');
  });

  it('does nothing when off', () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePullToRefresh(onRefresh, false));
    pull(100, 100 + PULL_DISTANCE * 2);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(result.current).toBe('idle');
  });
});
