import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useFolderRefresh } from './useFolderRefresh';

describe('useFolderRefresh', () => {
  it('says it is refreshing until the sync has settled', async () => {
    let finish: () => void = () => undefined;
    const syncNow = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useFolderRefresh(syncNow));
    act(() => result.current.refresh());
    expect(syncNow).toHaveBeenCalledOnce();
    expect(result.current.refreshing).toBe(true);
    act(() => finish());
    await waitFor(() => expect(result.current.refreshing).toBe(false));
  });

  it('stops refreshing when the sync fails, leaving the telling to the folder notice', async () => {
    const { result } = renderHook(() => useFolderRefresh(() => Promise.reject(new Error('unreadable'))));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.refreshing).toBe(false));
  });
});
