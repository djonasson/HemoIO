import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { notifyFolderAccessChanged } from '@data/storage/folderAccessEvents';
import { STORAGE_PROVIDER_KEY } from '@data/storage/storageChoice';
import { useFolderStorageOn } from './useFolderStorageOn';

vi.mock('@/utils/fileSystemSupport', () => ({
  isFileSystemAccessSupported: () => true,
}));

describe('useFolderStorageOn', () => {
  afterEach(() => localStorage.clear());

  it('follows folder storage being switched on and off', () => {
    localStorage.setItem(STORAGE_PROVIDER_KEY, 'local');
    const { result } = renderHook(() => useFolderStorageOn());
    expect(result.current).toBe(false);

    act(() => {
      localStorage.setItem(STORAGE_PROVIDER_KEY, 'filesystem');
      notifyFolderAccessChanged();
    });
    expect(result.current).toBe(true);

    act(() => {
      localStorage.setItem(STORAGE_PROVIDER_KEY, 'local');
      notifyFolderAccessChanged();
    });
    expect(result.current).toBe(false);
  });
});
