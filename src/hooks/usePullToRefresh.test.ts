import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { PULL_DISTANCE, usePullToRefresh } from './usePullToRefresh';

function touch(type: string, clientY?: number, target: EventTarget = window): void {
  const event = new Event(type, { bubbles: true }) as Event & { touches: { clientY: number }[] };
  Object.defineProperty(event, 'touches', { value: clientY === undefined ? [] : [{ clientY }] });
  act(() => {
    target.dispatchEvent(event);
  });
}

function pull(from: number, to: number, target?: EventTarget): void {
  touch('touchstart', from, target);
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
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePullToRefresh(onRefresh, true));
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

  it('does not refresh on a pull in a dialog, on a locked page, or in an area scrolled down', () => {
    const onRefresh = vi.fn();
    renderHook(() => usePullToRefresh(onRefresh, true));
    const dialog = document.body.appendChild(document.createElement('div'));
    dialog.setAttribute('role', 'dialog');
    pull(100, 100 + PULL_DISTANCE * 2, dialog.appendChild(document.createElement('p')));
    const list = document.body.appendChild(document.createElement('div'));
    list.scrollTop = 50;
    Object.defineProperty(list, 'scrollTop', { value: 50 });
    pull(100, 100 + PULL_DISTANCE * 2, list.appendChild(document.createElement('p')));
    document.body.setAttribute('data-scroll-locked', '1');
    pull(100, 100 + PULL_DISTANCE * 2);
    document.body.removeAttribute('data-scroll-locked');
    expect(onRefresh).not.toHaveBeenCalled();
    dialog.remove();
    list.remove();
  });

  it('forgets a pull under way when turned off', () => {
    const onRefresh = vi.fn();
    const { result, rerender } = renderHook(({ on }) => usePullToRefresh(onRefresh, on), { initialProps: { on: true } });
    touch('touchstart', 100);
    touch('touchmove', 100 + PULL_DISTANCE);
    rerender({ on: false });
    rerender({ on: true });
    expect(result.current).toBe('idle');
  });
});
