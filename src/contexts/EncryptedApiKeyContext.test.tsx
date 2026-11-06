/**
 * Tests for EncryptedApiKeyProvider and useEncryptedApiKey
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useEncryptedApiKey } from '@hooks/useEncryptedApiKey';
import { EncryptedApiKeyProvider } from './EncryptedApiKeyContext';

// Mock the auth context
const mockEncryptionKey = {} as CryptoKey;
vi.mock('./useAuth', () => ({
  useAuth: vi.fn(() => ({
    encryptionKey: mockEncryptionKey,
    status: 'unlocked',
  })),
}));

// Mock encryption functions
vi.mock('@data/encryption', () => ({
  encryptString: vi.fn((text: string) => Promise.resolve(`encrypted:${text}`)),
  // Only what this key encrypted opens: anything else was sealed under another key
  decryptString: vi.fn((text: string) =>
    text.startsWith('encrypted:')
      ? Promise.resolve(text.replace('encrypted:', ''))
      : Promise.reject(new Error(`Could not decrypt ${text}`))
  ),
}));

const ENCRYPTED_KEY = 'hemoio_ai_api_key_encrypted';
const LEGACY_KEY = 'hemoio_ai_api_key';

describe('useEncryptedApiKey', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('initial state', () => {
    it('should report no API key when storage is empty', async () => {
      const { result } = renderHook(() => useEncryptedApiKey(), { wrapper: EncryptedApiKeyProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasApiKey).toBe(false);
      expect(result.current.apiKeyLastFour).toBeUndefined();
    });

    it('should detect existing encrypted API key', async () => {
      localStorage.setItem(ENCRYPTED_KEY, 'encrypted:sk-test-api-key-1234');

      const { result } = renderHook(() => useEncryptedApiKey(), { wrapper: EncryptedApiKeyProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasApiKey).toBe(true);
      expect(result.current.apiKeyLastFour).toBe('1234');
    });

    it('an API key the session key cannot decrypt is unset and removed', async () => {
      localStorage.setItem(ENCRYPTED_KEY, 'sealed-under-another-key');
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => useEncryptedApiKey(), { wrapper: EncryptedApiKeyProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasApiKey).toBe(false);
      expect(result.current.apiKeyLastFour).toBeUndefined();
      expect(localStorage.getItem(ENCRYPTED_KEY)).toBeNull();
    });

    it('should migrate legacy plaintext API key', async () => {
      localStorage.setItem(LEGACY_KEY, 'sk-legacy-api-key-5678');

      const { result } = renderHook(() => useEncryptedApiKey(), { wrapper: EncryptedApiKeyProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should have migrated
      expect(result.current.hasApiKey).toBe(true);
      expect(result.current.apiKeyLastFour).toBe('5678');

      // Legacy key should be removed
      expect(localStorage.getItem(LEGACY_KEY)).toBeNull();

      // Encrypted key should be set
      expect(localStorage.getItem(ENCRYPTED_KEY)).toBe(
        'encrypted:sk-legacy-api-key-5678'
      );
    });
  });

  describe('setApiKey', () => {
    it('should encrypt and store API key', async () => {
      const { result } = renderHook(() => useEncryptedApiKey(), { wrapper: EncryptedApiKeyProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.setApiKey('sk-new-api-key-9999');
      });

      expect(result.current.hasApiKey).toBe(true);
      expect(result.current.apiKeyLastFour).toBe('9999');
      expect(localStorage.getItem(ENCRYPTED_KEY)).toBe(
        'encrypted:sk-new-api-key-9999'
      );
    });

    it('should remove legacy key when setting new key', async () => {
      localStorage.setItem(LEGACY_KEY, 'old-plaintext-key');

      const { result } = renderHook(() => useEncryptedApiKey(), { wrapper: EncryptedApiKeyProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.setApiKey('sk-new-key-1111');
      });

      expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    });
  });

  describe('getApiKey', () => {
    it('should decrypt and return API key', async () => {
      localStorage.setItem(ENCRYPTED_KEY, 'encrypted:sk-secret-key-abcd');

      const { result } = renderHook(() => useEncryptedApiKey(), { wrapper: EncryptedApiKeyProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let apiKey: string | null = null;
      await act(async () => {
        apiKey = await result.current.getApiKey();
      });

      expect(apiKey).toBe('sk-secret-key-abcd');
    });

    it('should return null when no key exists', async () => {
      const { result } = renderHook(() => useEncryptedApiKey(), { wrapper: EncryptedApiKeyProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let apiKey: string | null = 'not-null';
      await act(async () => {
        apiKey = await result.current.getApiKey();
      });

      expect(apiKey).toBeNull();
    });
  });

  describe('removeApiKey', () => {
    it('should remove stored API key', async () => {
      localStorage.setItem(ENCRYPTED_KEY, 'encrypted:sk-to-remove');

      const { result } = renderHook(() => useEncryptedApiKey(), { wrapper: EncryptedApiKeyProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasApiKey).toBe(true);

      act(() => {
        result.current.removeApiKey();
      });

      expect(result.current.hasApiKey).toBe(false);
      expect(result.current.apiKeyLastFour).toBeUndefined();
      expect(localStorage.getItem(ENCRYPTED_KEY)).toBeNull();
    });

    it('should also remove legacy key if present', async () => {
      localStorage.setItem(LEGACY_KEY, 'old-key');
      localStorage.setItem(ENCRYPTED_KEY, 'encrypted:new-key');

      const { result } = renderHook(() => useEncryptedApiKey(), { wrapper: EncryptedApiKeyProvider });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.removeApiKey();
      });

      expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
      expect(localStorage.getItem(ENCRYPTED_KEY)).toBeNull();
    });
  });

  describe('errors', () => {
    it('errors are logged without detail', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      localStorage.setItem(ENCRYPTED_KEY, 'sealed-under-another-key');
      const { result } = renderHook(() => useEncryptedApiKey(), { wrapper: EncryptedApiKeyProvider });
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Stored again after the check, as another tab could
      localStorage.setItem(ENCRYPTED_KEY, 'sealed-under-another-key');
      await act(async () => {
        expect(await result.current.getApiKey()).toBeNull();
      });
      const { encryptString } = await import('@data/encryption');
      vi.mocked(encryptString).mockRejectedValueOnce(new Error('sk-secret-key'));
      await act(async () => {
        await expect(result.current.setApiKey('sk-secret-key')).rejects.toThrow();
      });

      expect(error.mock.calls).toEqual([
        ['Could not read the stored API key'],
        ['Could not decrypt the stored API key'],
        ['Could not encrypt the API key'],
      ]);
      expect(JSON.stringify(error.mock.calls)).not.toMatch(/sealed-under|sk-secret/);
    });
  });

  describe('shared state', () => {
    it('should expose a key saved by one consumer to every other consumer', async () => {
      const { result } = renderHook(
        () => ({ settings: useEncryptedApiKey(), importView: useEncryptedApiKey() }),
        { wrapper: EncryptedApiKeyProvider }
      );

      await waitFor(() => {
        expect(result.current.importView.isLoading).toBe(false);
      });
      expect(result.current.importView.hasApiKey).toBe(false);

      await act(async () => {
        await result.current.settings.setApiKey('sk-ant-test-key-1234');
      });

      expect(result.current.importView.hasApiKey).toBe(true);
      expect(result.current.importView.apiKeyLastFour).toBe('1234');
    });
  });
});
