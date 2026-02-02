import { describe, it, expect, beforeEach } from 'vitest';
import {
  getStorageProvider,
  clearProviderCache,
  isProviderAvailable,
  getAvailableProviders,
  getStorageProviderInfo,
} from './StorageProviderFactory';
import { LocalStorageProvider } from './LocalStorageProvider';

describe('StorageProviderFactory', () => {
  beforeEach(() => {
    clearProviderCache();
  });

  describe('getStorageProvider', () => {
    it('returns LocalStorageProvider for "local" type', () => {
      const provider = getStorageProvider('local');
      expect(provider).toBeInstanceOf(LocalStorageProvider);
    });

    it('caches provider instances', () => {
      const provider1 = getStorageProvider('local');
      const provider2 = getStorageProvider('local');
      expect(provider1).toBe(provider2);
    });

    it('throws error for unimplemented providers', () => {
      expect(() => getStorageProvider('dropbox')).toThrow(
        'Dropbox storage is not yet implemented'
      );
      expect(() => getStorageProvider('googledrive')).toThrow(
        'Google Drive storage is not yet implemented'
      );
    });
  });

  describe('clearProviderCache', () => {
    it('clears cached providers', () => {
      const provider1 = getStorageProvider('local');
      clearProviderCache();
      const provider2 = getStorageProvider('local');

      // After clearing, should get a new instance
      expect(provider1).not.toBe(provider2);
    });
  });

  describe('isProviderAvailable', () => {
    it('returns true for local storage', () => {
      expect(isProviderAvailable('local')).toBe(true);
    });

    it('returns false for unimplemented providers', () => {
      expect(isProviderAvailable('dropbox')).toBe(false);
      expect(isProviderAvailable('googledrive')).toBe(false);
    });
  });

  describe('getAvailableProviders', () => {
    it('returns only implemented providers', () => {
      const providers = getAvailableProviders();
      expect(providers).toContain('local');
      expect(providers).not.toContain('dropbox');
      expect(providers).not.toContain('googledrive');
    });
  });

  describe('getStorageProviderInfo', () => {
    it('returns info for all providers', () => {
      const info = getStorageProviderInfo();

      expect(info.length).toBe(3);
      expect(info.map((i) => i.type)).toContain('local');
      expect(info.map((i) => i.type)).toContain('dropbox');
      expect(info.map((i) => i.type)).toContain('googledrive');
    });

    it('marks local as available', () => {
      const info = getStorageProviderInfo();
      const local = info.find((i) => i.type === 'local');

      expect(local?.available).toBe(true);
      expect(local?.name).toBe('Local Storage');
    });

    it('marks cloud providers as unavailable', () => {
      const info = getStorageProviderInfo();
      const dropbox = info.find((i) => i.type === 'dropbox');
      const gdrive = info.find((i) => i.type === 'googledrive');

      expect(dropbox?.available).toBe(false);
      expect(gdrive?.available).toBe(false);
    });

    it('includes descriptions', () => {
      const info = getStorageProviderInfo();

      for (const provider of info) {
        expect(provider.description).toBeTruthy();
      }
    });
  });
});
