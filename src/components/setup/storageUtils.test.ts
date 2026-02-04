import { describe, it, expect } from 'vitest';
import { isStorageStepValid } from './storageUtils';

describe('isStorageStepValid', () => {
  describe('local storage', () => {
    it('returns true for local storage without directory', () => {
      expect(isStorageStepValid('local')).toBe(true);
    });

    it('returns true for local storage with null directory', () => {
      expect(isStorageStepValid('local', null)).toBe(true);
    });

    it('returns true for local storage with directory (ignored)', () => {
      expect(isStorageStepValid('local', 'SomeFolder')).toBe(true);
    });
  });

  describe('filesystem storage', () => {
    it('returns false when no directory is selected', () => {
      expect(isStorageStepValid('filesystem')).toBe(false);
    });

    it('returns false when directory is null', () => {
      expect(isStorageStepValid('filesystem', null)).toBe(false);
    });

    it('returns false when directory is undefined', () => {
      expect(isStorageStepValid('filesystem', undefined)).toBe(false);
    });

    it('returns false when directory is empty string', () => {
      expect(isStorageStepValid('filesystem', '')).toBe(false);
    });

    it('returns true when directory is selected', () => {
      expect(isStorageStepValid('filesystem', 'MyFolder')).toBe(true);
    });
  });

  describe('unsupported storage types', () => {
    it('returns false for dropbox', () => {
      expect(isStorageStepValid('dropbox')).toBe(false);
    });

    it('returns false for googledrive', () => {
      expect(isStorageStepValid('googledrive')).toBe(false);
    });
  });
});
