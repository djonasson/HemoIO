import { describe, it, expect, vi, afterEach } from 'vitest';
import { isFileSystemAccessSupported } from './fileSystemSupport';

describe('isFileSystemAccessSupported', () => {
  const originalShowDirectoryPicker = window.showDirectoryPicker;

  afterEach(() => {
    // Restore original
    if (originalShowDirectoryPicker) {
      window.showDirectoryPicker = originalShowDirectoryPicker;
    } else {
      // @ts-expect-error - Cleaning up mock
      delete window.showDirectoryPicker;
    }
  });

  it('returns true when showDirectoryPicker is available', () => {
    window.showDirectoryPicker = vi.fn();
    expect(isFileSystemAccessSupported()).toBe(true);
  });

  it('returns false when showDirectoryPicker is not available', () => {
    // @ts-expect-error - Removing for test
    delete window.showDirectoryPicker;
    expect(isFileSystemAccessSupported()).toBe(false);
  });

  it('returns false when showDirectoryPicker is not a function', () => {
    // @ts-expect-error - Testing invalid value
    window.showDirectoryPicker = 'not a function';
    expect(isFileSystemAccessSupported()).toBe(false);
  });
});
