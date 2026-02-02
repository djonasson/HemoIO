/**
 * Tests for useEncryptedApiKey hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useEncryptedApiKey } from './useEncryptedApiKey';

// Mock the auth context
const mockEncryptionKey = {} as CryptoKey;
vi.mock('@contexts/useAuth', () => ({
  useAuth: vi.fn(() => ({
    encryptionKey: mockEncryptionKey,
    status: 'unlocked',
  })),
}));

// Mock encryption functions
vi.mock('@data/encryption', () => ({
  encryptString: vi.fn((text: string) => Promise.resolve(`encrypted:${text}`)),
  decryptString: vi.fn((text: string) =>
    Promise.resolve(text.replace('encrypted:', ''))
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
      const { result } = renderHook(() => useEncryptedApiKey());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasApiKey).toBe(false);
      expect(result.current.apiKeyLastFour).toBeUndefined();
    });

    it('should detect existing encrypted API key', async () => {
      localStorage.setItem(ENCRYPTED_KEY, 'encrypted:sk-test-api-key-1234');

      const { result } = renderHook(() => useEncryptedApiKey());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasApiKey).toBe(true);
      expect(result.current.apiKeyLastFour).toBe('1234');
    });

    it('should migrate legacy plaintext API key', async () => {
      localStorage.setItem(LEGACY_KEY, 'sk-legacy-api-key-5678');

      const { result } = renderHook(() => useEncryptedApiKey());

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
      const { result } = renderHook(() => useEncryptedApiKey());

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

      const { result } = renderHook(() => useEncryptedApiKey());

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

      const { result } = renderHook(() => useEncryptedApiKey());

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
      const { result } = renderHook(() => useEncryptedApiKey());

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

      const { result } = renderHook(() => useEncryptedApiKey());

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

      const { result } = renderHook(() => useEncryptedApiKey());

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
});
