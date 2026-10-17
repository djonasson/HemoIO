/**
 * Hook for managing the encrypted AI provider API key
 *
 * Must be used within an EncryptedApiKeyProvider so all consumers share one state.
 */

import { createContext, useContext } from 'react';

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

export const EncryptedApiKeyContext = createContext<UseEncryptedApiKeyResult | null>(null);

export function useEncryptedApiKey(): UseEncryptedApiKeyResult {
  const context = useContext(EncryptedApiKeyContext);
  if (!context) {
    throw new Error('useEncryptedApiKey must be used within an EncryptedApiKeyProvider');
  }
  return context;
}
