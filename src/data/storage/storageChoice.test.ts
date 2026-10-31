import { describe, it, expect, vi, afterEach } from 'vitest';
import { isFileSystemAccessSupported } from '@/utils/fileSystemSupport';
import { isFolderStorageOn, STORAGE_PROVIDER_KEY } from './storageChoice';

vi.mock('@/utils/fileSystemSupport', () => ({
  isFileSystemAccessSupported: vi.fn(() => true),
}));

describe('isFolderStorageOn', () => {
  afterEach(() => {
    localStorage.clear();
    vi.mocked(isFileSystemAccessSupported).mockReturnValue(true);
  });

  it('is on when folder storage is chosen in a browser that has folders', () => {
    localStorage.setItem(STORAGE_PROVIDER_KEY, 'filesystem');

    expect(isFolderStorageOn()).toBe(true);
  });

  it('is off with browser storage, with no choice, or where folders are not supported', () => {
    expect(isFolderStorageOn()).toBe(false);
    localStorage.setItem(STORAGE_PROVIDER_KEY, 'local');
    expect(isFolderStorageOn()).toBe(false);

    localStorage.setItem(STORAGE_PROVIDER_KEY, 'filesystem');
    vi.mocked(isFileSystemAccessSupported).mockReturnValue(false);
    expect(isFolderStorageOn()).toBe(false);
  });
});
