import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useReplaceConfirm } from './useReplaceConfirm';

/** A replace that settles when told */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useReplaceConfirm', () => {
  it('runs the replace, saying so meanwhile, and gives its result', async () => {
    const { result } = renderHook(() => useReplaceConfirm());
    const replace = deferred<string>();

    let done!: Promise<{ value: string } | undefined>;
    act(() => {
      done = result.current.run(() => replace.promise);
    });
    expect(result.current.isReplacing).toBe(true);

    await act(async () => {
      replace.resolve('replaced');
      await expect(done).resolves.toEqual({ value: 'replaced' });
    });
    expect(result.current.isReplacing).toBe(false);
    expect(result.current.failed).toBe(false);
  });

  it('shows a failure, and gives nothing', async () => {
    const { result } = renderHook(() => useReplaceConfirm());

    await act(async () => {
      await expect(result.current.run(() => Promise.reject(new Error('Disk full')))).resolves.toBeUndefined();
    });

    expect(result.current.failed).toBe(true);
    expect(result.current.isReplacing).toBe(false);
  });

  it('starts afresh on reset', async () => {
    const { result } = renderHook(() => useReplaceConfirm());
    await act(async () => {
      await result.current.run(() => Promise.reject(new Error('Disk full')));
    });

    act(() => result.current.reset());

    expect(result.current.failed).toBe(false);
  });

  it('lets a replace from before a reset settle unseen', async () => {
    const { result } = renderHook(() => useReplaceConfirm());
    const succeeding = deferred<string>();
    const failing = deferred<string>();

    let first!: Promise<{ value: string } | undefined>;
    let second!: Promise<{ value: string } | undefined>;
    act(() => {
      first = result.current.run(() => succeeding.promise);
    });
    act(() => result.current.reset());
    act(() => {
      second = result.current.run(() => failing.promise);
    });
    act(() => result.current.reset());

    await act(async () => {
      succeeding.resolve('replaced');
      failing.reject(new Error('Disk full'));
      await expect(first).resolves.toBeUndefined();
      await expect(second).resolves.toBeUndefined();
    });
    expect(result.current.failed).toBe(false);
    expect(result.current.isReplacing).toBe(false);
  });
});
