import type { AIProviderType } from '@/types';

/**
 * Check if AI provider requires an API key
 */
function providerRequiresApiKey(provider: AIProviderType): boolean {
  return provider !== 'ollama';
}

export function isAIConfigStepValid(
  aiProvider: AIProviderType | null,
  apiKey: string
): boolean {
  // Step is always valid - AI is optional
  // If a provider is selected that requires an API key, check that one is provided
  if (aiProvider && providerRequiresApiKey(aiProvider)) {
    return apiKey.trim().length > 0;
  }
  return true;
}

export function isAIConfigured(
  aiProvider: AIProviderType | null,
  apiKey: string
): boolean {
  if (aiProvider === null) {
    return false;
  }
  // Ollama doesn't require an API key
  if (!providerRequiresApiKey(aiProvider)) {
    return true;
  }
  return apiKey.trim().length > 0;
}
