import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSaveConfirmation } from './useSaveConfirmation';

afterEach(() => {
  vi.useRealTimers();
});

describe('useSaveConfirmation', () => {
  it('shows for two seconds from the last confirmation', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSaveConfirmation());

    act(() => result.current.confirm());
    act(() => vi.advanceTimersByTime(1500));
    act(() => result.current.confirm());
    act(() => vi.advanceTimersByTime(1500));
    expect(result.current.saved).toBe(true);

    act(() => vi.advanceTimersByTime(500));
    expect(result.current.saved).toBe(false);
  });

  it('hides at once when a later save fails', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSaveConfirmation());

    act(() => result.current.confirm());
    act(() => result.current.clear());

    expect(result.current.saved).toBe(false);
  });

  it('leaves no timer behind once unmounted', () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useSaveConfirmation());

    act(() => result.current.confirm());
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
