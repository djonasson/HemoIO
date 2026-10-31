import { describe, it, expect, vi } from 'vitest';
import { notifyFolderAccessChanged, onFolderAccessChanged } from './folderAccessEvents';

describe('folder access events', () => {
  it('tells every listener, until it unsubscribes', () => {
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = onFolderAccessChanged(first);
    const stopSecond = onFolderAccessChanged(second);

    notifyFolderAccessChanged();
    stopFirst();
    notifyFolderAccessChanged();
    stopSecond();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });
});
