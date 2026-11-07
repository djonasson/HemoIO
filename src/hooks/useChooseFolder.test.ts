import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useChooseFolder } from './useChooseFolder';

describe('useChooseFolder', () => {
  it('shows the picker straight from the click', () => {
    const chooseFolder = vi.fn(async () => true);
    const { result } = renderHook(() => useChooseFolder(chooseFolder));

    act(() => result.current.choose());

    expect(chooseFolder).toHaveBeenCalledTimes(1);
    expect(result.current.failed).toBe(false);
  });

  it('says when the folder could not be chosen, and forgets it on reset', async () => {
    const { result } = renderHook(() => useChooseFolder(vi.fn(async () => Promise.reject(new Error('No access')))));

    act(() => result.current.choose());
    await waitFor(() => expect(result.current.failed).toBe(true));

    act(() => result.current.reset());
    expect(result.current.failed).toBe(false);
  });

  it('forgets an earlier failure when choosing again', async () => {
    const chooseFolder = vi.fn<() => Promise<boolean>>().mockRejectedValueOnce(new Error('No access'));
    chooseFolder.mockResolvedValue(false);
    const { result } = renderHook(() => useChooseFolder(chooseFolder));
    act(() => result.current.choose());
    await waitFor(() => expect(result.current.failed).toBe(true));

    act(() => result.current.choose());

    expect(result.current.failed).toBe(false);
  });
});
