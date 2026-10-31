import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { SaveError } from '@data/db/saveError';
import { notifySaveFailed } from '@components/common/notifySaveFailed';
import { useSaveState } from './useSaveState';

vi.mock('@components/common/notifySaveFailed', () => ({ notifySaveFailed: vi.fn() }));

function deferred(): { promise: Promise<void>; fail: (err: unknown) => void } {
  let fail!: (err: unknown) => void;
  const promise = new Promise<void>((_, reject) => (fail = reject));
  return { promise, fail };
}

describe('useSaveState', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is saving until the save settles, and resolves to whether it was saved', async () => {
    const { result } = renderHook(() => useSaveState('Note not saved'));
    let finish!: () => void;
    let running!: Promise<boolean>;

    act(() => {
      running = result.current.run(() => new Promise<void>((resolve) => (finish = resolve)));
    });
    expect(result.current.isSaving).toBe(true);
    await act(async () => {
      finish();
      expect(await running).toBe(true);
    });

    expect(result.current.isSaving).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('keeps the failure to show where the save was made', async () => {
    const { result } = renderHook(() => useSaveState('Note not saved'));
    const failure = new SaveError('quota');

    await act(async () => {
      expect(await result.current.run(() => Promise.reject(failure))).toBe(false);
    });

    expect(result.current.error).toBe(failure);
    expect(notifySaveFailed).not.toHaveBeenCalled();
  });

  it('notifies a failure that comes after its place was closed', async () => {
    const { result } = renderHook(() => useSaveState('Note not saved'));
    const save = deferred();

    let running!: Promise<boolean>;
    act(() => {
      running = result.current.run(() => save.promise);
    });
    act(() => result.current.clear());
    await act(async () => {
      save.fail(new SaveError('timeout'));
      await running;
    });

    expect(result.current.error).toBeNull();
    expect(notifySaveFailed).toHaveBeenCalledWith('Note not saved', expect.any(SaveError));
  });

  it('notifies a failure that comes after its place was removed', async () => {
    const { result, unmount } = renderHook(() => useSaveState('Note not deleted'));
    const save = deferred();

    let running!: Promise<boolean>;
    act(() => {
      running = result.current.run(() => save.promise);
    });
    unmount();
    save.fail(new SaveError('timeout'));
    await running;

    expect(notifySaveFailed).toHaveBeenCalledWith('Note not deleted', expect.any(SaveError));
  });

  it('is not saving once its place was closed, so a new one starts afresh', async () => {
    const { result } = renderHook(() => useSaveState('Note not saved'));
    let finish!: () => void;
    let running!: Promise<boolean>;
    act(() => {
      running = result.current.run(() => new Promise<void>((resolve) => (finish = resolve)));
    });

    act(() => result.current.clear());
    expect(result.current.isSaving).toBe(false);

    await act(async () => {
      finish();
      // Saved, but its place is gone: nothing there to close
      expect(await running).toBe(false);
    });
    expect(result.current.isSaving).toBe(false);
  });
});
