import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { clearStoredData, countStoredRows } from '@data/db/storedRows';
import { installFakeWebLocks } from '@/test/fakeWebLocks';
import { useExistingBrowserData } from './useExistingBrowserData';

vi.mock('@data/db/storedRows', () => ({
  countStoredRows: vi.fn(),
  clearStoredData: vi.fn(),
}));

describe('useExistingBrowserData', () => {
  beforeEach(() => {
    vi.mocked(countStoredRows).mockReset();
    vi.mocked(clearStoredData).mockReset();
    localStorage.clear();
  });

  it('is null while counting, then the number of stored rows', async () => {
    vi.mocked(countStoredRows).mockResolvedValue(4);

    const { result } = renderHook(() => useExistingBrowserData());

    expect(result.current.rows).toBeNull();
    await waitFor(() => expect(result.current.rows).toBe(4));
  });

  it('clears the stored data and then counts none', async () => {
    vi.mocked(countStoredRows).mockResolvedValue(4);
    vi.mocked(clearStoredData).mockResolvedValue();
    const { result } = renderHook(() => useExistingBrowserData());
    await waitFor(() => expect(result.current.rows).toBe(4));

    let cleared: boolean | undefined;
    await act(async () => {
      cleared = await result.current.clear();
    });

    expect(cleared).toBe(true);
    expect(clearStoredData).toHaveBeenCalledTimes(1);
    expect(result.current.rows).toBe(0);
  });

  it('clears under the setup lock', async () => {
    const locks = installFakeWebLocks();
    try {
      vi.mocked(countStoredRows).mockResolvedValue(4);
      let heldWhileClearing: string | null = null;
      vi.mocked(clearStoredData).mockImplementation(async () => {
        heldWhileClearing = locks.held();
      });
      const { result } = renderHook(() => useExistingBrowserData());
      await waitFor(() => expect(result.current.rows).toBe(4));

      await act(() => result.current.clear());

      expect(heldWhileClearing).toBe('hemoio-setup');
    } finally {
      locks.uninstall();
    }
  });

  it('clears nothing once another tab has finished setup', async () => {
    vi.mocked(countStoredRows).mockResolvedValue(4);
    const { result } = renderHook(() => useExistingBrowserData());
    await waitFor(() => expect(result.current.rows).toBe(4));
    // Saved by the other tab's setup while this one confirmed
    localStorage.setItem('hemoio_credentials', JSON.stringify({ version: 2 }));

    let cleared: boolean | undefined;
    await act(async () => {
      cleared = await result.current.clear();
    });

    expect(cleared).toBe(false);
    expect(clearStoredData).not.toHaveBeenCalled();
    expect(result.current.rows).toBe(4);
  });

  it('keeps the count when clearing fails, and passes the failure on', async () => {
    vi.mocked(countStoredRows).mockResolvedValue(4);
    vi.mocked(clearStoredData).mockRejectedValue(new Error('blocked'));
    const { result } = renderHook(() => useExistingBrowserData());
    await waitFor(() => expect(result.current.rows).toBe(4));

    await act(() => expect(result.current.clear()).rejects.toThrow('blocked'));

    expect(result.current.rows).toBe(4);
  });

  it('counts none when the rows cannot be counted, with a fixed message', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(countStoredRows).mockRejectedValue(new Error('detail that could name data'));

    const { result } = renderHook(() => useExistingBrowserData());

    await waitFor(() => expect(result.current.rows).toBe(0));
    expect(error).toHaveBeenCalledWith('Could not count the data stored in this browser');
    error.mockRestore();
  });
});
