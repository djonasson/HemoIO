/**
 * useEncryptedApiKey Hook
 *
 * Provides secure encrypted storage for AI provider API keys.
 * Keys are encrypted with AES-GCM using the user's session encryption key.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@contexts/useAuth';
import { encryptString, decryptString } from '@data/encryption';

const ENCRYPTED_API_KEY_STORAGE_KEY = 'hemoio_ai_api_key_encrypted';
const LEGACY_API_KEY_STORAGE_KEY = 'hemoio_ai_api_key';

export interface UseEncryptedApiKeyResult {
  /** Whether the hook is ready (encryption key available) */
  isReady: boolean;
  /** Whether an API key is stored */
  hasApiKey: boolean;
  /** Last 4 characters of the API key (for display) */
  apiKeyLastFour: string | undefined;
  /** Whether a key operation is in progress */
  isLoading: boolean;
  /** Get the decrypted API key */
  getApiKey: () => Promise<string | null>;
  /** Save an API key (encrypts before storing) */
  setApiKey: (apiKey: string) => Promise<void>;
  /** Remove the stored API key */
  removeApiKey: () => void;
}

/**
 * Hook for managing encrypted API key storage
 */
export function useEncryptedApiKey(): UseEncryptedApiKeyResult {
  const { encryptionKey, status } = useAuth();
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeyLastFour, setApiKeyLastFour] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);

  const isReady = status === 'unlocked' && encryptionKey !== null;

  // Check for existing API key on mount and when encryption key becomes available
  useEffect(() => {
    if (!isReady) {
      setIsLoading(true);
      return;
    }

    const checkExistingKey = async () => {
      setIsLoading(true);
      try {
        // First check for encrypted key
        const encryptedKey = localStorage.getItem(ENCRYPTED_API_KEY_STORAGE_KEY);
        if (encryptedKey) {
          // Decrypt to get last 4 chars
          const decrypted = await decryptString(encryptedKey, encryptionKey!);
          setHasApiKey(true);
          setApiKeyLastFour(decrypted.slice(-4));
          setIsLoading(false);
          return;
        }

        // Check for legacy plaintext key and migrate it
        const legacyKey = localStorage.getItem(LEGACY_API_KEY_STORAGE_KEY);
        if (legacyKey) {
          // Migrate: encrypt and store, then remove plaintext
          const encrypted = await encryptString(legacyKey, encryptionKey!);
          localStorage.setItem(ENCRYPTED_API_KEY_STORAGE_KEY, encrypted);
          localStorage.removeItem(LEGACY_API_KEY_STORAGE_KEY);
          setHasApiKey(true);
          setApiKeyLastFour(legacyKey.slice(-4));
          setIsLoading(false);
          return;
        }

        // No key found
        setHasApiKey(false);
        setApiKeyLastFour(undefined);
      } catch (error) {
        console.error('Error checking API key:', error);
        setHasApiKey(false);
        setApiKeyLastFour(undefined);
      } finally {
        setIsLoading(false);
      }
    };

    checkExistingKey();
  }, [isReady, encryptionKey]);

  // Get the decrypted API key
  const getApiKey = useCallback(async (): Promise<string | null> => {
    if (!isReady || !encryptionKey) {
      return null;
    }

    try {
      const encryptedKey = localStorage.getItem(ENCRYPTED_API_KEY_STORAGE_KEY);
      if (!encryptedKey) {
        return null;
      }

      return await decryptString(encryptedKey, encryptionKey);
    } catch (error) {
      console.error('Error decrypting API key:', error);
      return null;
    }
  }, [isReady, encryptionKey]);

  // Save an API key (encrypts before storing)
  const setApiKey = useCallback(
    async (apiKey: string): Promise<void> => {
      if (!isReady || !encryptionKey) {
        throw new Error('Encryption key not available');
      }

      try {
        const encrypted = await encryptString(apiKey, encryptionKey);
        localStorage.setItem(ENCRYPTED_API_KEY_STORAGE_KEY, encrypted);

        // Remove legacy key if it exists
        localStorage.removeItem(LEGACY_API_KEY_STORAGE_KEY);

        setHasApiKey(true);
        setApiKeyLastFour(apiKey.slice(-4));
      } catch (error) {
        console.error('Error encrypting API key:', error);
        throw error;
      }
    },
    [isReady, encryptionKey]
  );

  // Remove the stored API key
  const removeApiKey = useCallback(() => {
    localStorage.removeItem(ENCRYPTED_API_KEY_STORAGE_KEY);
    localStorage.removeItem(LEGACY_API_KEY_STORAGE_KEY);
    setHasApiKey(false);
    setApiKeyLastFour(undefined);
  }, []);

  return {
    isReady,
    hasApiKey,
    apiKeyLastFour,
    isLoading,
    getApiKey,
    setApiKey,
    removeApiKey,
  };
}
