import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { chooseFolder } from '@data/storage/chooseFolder';
import { useChooseFolder } from './useChooseFolder';

vi.mock('@data/storage/chooseFolder', () => ({
  chooseFolder: vi.fn(),
}));

describe('useChooseFolder', () => {
  beforeEach(() => {
    vi.mocked(chooseFolder).mockReset();
  });

  it('shows the picker straight from the click', async () => {
    vi.mocked(chooseFolder).mockResolvedValue('chosen');
    const onOff = vi.fn();
    const { result } = renderHook(() => useChooseFolder(onOff));

    act(() => result.current.choose());

    expect(chooseFolder).toHaveBeenCalledTimes(1);
    expect(result.current.failed).toBe(false);
    await act(async () => {});
    expect(onOff).not.toHaveBeenCalled();
  });

  it('tells the caller when folder storage was switched off meanwhile', async () => {
    vi.mocked(chooseFolder).mockResolvedValue('off');
    const onOff = vi.fn();
    const { result } = renderHook(() => useChooseFolder(onOff));

    act(() => result.current.choose());

    await waitFor(() => expect(onOff).toHaveBeenCalledTimes(1));
    expect(result.current.failed).toBe(false);
  });

  it('says when the folder could not be chosen, and forgets it on reset', async () => {
    vi.mocked(chooseFolder).mockRejectedValue(new Error('No access'));
    const { result } = renderHook(() => useChooseFolder(vi.fn()));

    act(() => result.current.choose());
    await waitFor(() => expect(result.current.failed).toBe(true));

    act(() => result.current.reset());
    expect(result.current.failed).toBe(false);
  });

  it('forgets an earlier failure when choosing again', async () => {
    vi.mocked(chooseFolder).mockRejectedValueOnce(new Error('No access')).mockResolvedValue('cancelled');
    const { result } = renderHook(() => useChooseFolder(vi.fn()));
    act(() => result.current.choose());
    await waitFor(() => expect(result.current.failed).toBe(true));

    act(() => result.current.choose());

    expect(result.current.failed).toBe(false);
    await act(async () => {});
  });
});
