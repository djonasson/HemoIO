/**
 * Tests for useNavigation: the open view, what it focuses on, and visits
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useNavigation } from './useNavigation';

describe('useNavigation', () => {
  const scrollTo = vi.fn();

  beforeEach(() => {
    // jsdom does not implement scrolling
    vi.spyOn(window, 'scrollTo').mockImplementation(scrollTo);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    scrollTo.mockReset();
  });

  it('opens on the timeline, focused on nothing', () => {
    const { result } = renderHook(() => useNavigation());

    expect(result.current.view).toBe('timeline');
    expect(result.current.focus).toBeNull();
  });

  it('opens a view focused on what a link points at', () => {
    const { result } = renderHook(() => useNavigation());

    act(() => result.current.go({ view: 'dictionary', biomarkerKey: 'glucose' }));

    expect(result.current.view).toBe('dictionary');
    expect(result.current.focus).toEqual({ view: 'dictionary', biomarkerKey: 'glucose' });
  });

  it('drops the focus on a move from the menu', () => {
    const { result } = renderHook(() => useNavigation());
    act(() => result.current.go({ view: 'trends', biomarkerKey: 'glucose' }));

    act(() => result.current.go('trends'));

    expect(result.current.view).toBe('trends');
    expect(result.current.focus).toBeNull();
  });

  it('opens every view it moves to at the top', () => {
    const { result } = renderHook(() => useNavigation());
    scrollTo.mockClear();

    act(() => result.current.go('settings'));
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
    scrollTo.mockClear();

    act(() => result.current.go({ view: 'trends', biomarkerKey: 'glucose' }));
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
  });

  it('starts Timeline, Trends and Biomarkers fresh when chosen while open', () => {
    const { result } = renderHook(() => useNavigation());
    for (const view of ['timeline', 'trends', 'dictionary'] as const) {
      act(() => result.current.go(view));
      const visit = result.current.visit;
      scrollTo.mockClear();

      act(() => result.current.go(view));

      expect(result.current.visit).not.toBe(visit);
      expect(scrollTo).toHaveBeenCalledWith(0, 0);
    }
  });

  it('leaves a view that keeps its state as it is when chosen while open', () => {
    const { result } = renderHook(() => useNavigation());
    act(() => result.current.go('settings'));
    const visit = result.current.visit;
    scrollTo.mockClear();

    act(() => result.current.go('settings'));

    expect(result.current.visit).toBe(visit);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
