/**
 * AI Provider Factory
 *
 * Factory for creating and managing AI provider instances.
 */

/**
 * AI Provider Factory
 *
 * Factory for creating and managing AI provider instances.
 */
import { type AIProvider, type AIProviderConfig, type AIProviderType, type OllamaConfig } from './types';
import { OpenAIProvider } from './OpenAIProvider';
import { AnthropicProvider } from './AnthropicProvider';
import { OllamaProvider } from './OllamaProvider';

/**
 * Cache of provider instances
 */
const providerCache = new Map<string, AIProvider>();

/**
 * Create a cache key for a provider configuration
 */
function createCacheKey(type: AIProviderType, config: AIProviderConfig): string {
  // Ollama doesn't use API keys, so use baseUrl instead
  if (type === 'ollama') {
    const ollamaConfig = config as OllamaConfig;
    return `${type}:${ollamaConfig.baseUrl || 'localhost'}:${config.model || 'default'}`;
  }
  return `${type}:${config.apiKey || ''}:${config.model || 'default'}`;
}

/**
 * Get or create an AI provider instance
 *
 * @param type - Provider type ('openai' or 'anthropic')
 * @param config - Provider configuration
 * @returns AI provider instance
 */
export function getAIProvider(
  type: AIProviderType,
  config: AIProviderConfig
): AIProvider {
  const cacheKey = createCacheKey(type, config);

  // Return cached instance if available
  const cached = providerCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Create new provider
  let provider: AIProvider;

  switch (type) {
    case 'openai':
      provider = new OpenAIProvider(config);
      break;
    case 'anthropic':
      provider = new AnthropicProvider(config);
      break;
    case 'ollama':
      provider = new OllamaProvider(config as OllamaConfig);
      break;
    default:
      throw new Error(`Unknown AI provider type: ${type}`);
  }

  // Cache and return
  providerCache.set(cacheKey, provider);
  return provider;
}

/**
 * Clear the provider cache
 *
 * Useful when API keys change or for testing
 */
export function clearProviderCache(): void {
  providerCache.clear();
}

/**
 * Get information about available providers
 *
 * @returns Array of provider info objects
 */
/**
 * Provider information object
 */
export interface ProviderInfo {
  type: AIProviderType;
  name: string;
  description: string;
  requiresApiKey: boolean;
  isLocal: boolean;
}

export function getAvailableProviders(): ProviderInfo[] {
  return [
    {
      type: 'openai',
      name: 'OpenAI',
      description: 'GPT-5 and reasoning models for lab report analysis',
      requiresApiKey: true,
      isLocal: false,
    },
    {
      type: 'anthropic',
      name: 'Anthropic Claude',
      description: 'Claude models for accurate medical data extraction',
      requiresApiKey: true,
      isLocal: false,
    },
    {
      type: 'ollama',
      name: 'Ollama (Local)',
      description: 'Run AI models locally for complete privacy. No API key required.',
      requiresApiKey: false,
      isLocal: true,
    },
  ];
}

/**
 * Validate an API key format for a specific provider
 *
 * @param type - Provider type
 * @param apiKey - API key to validate
 * @returns true if the key format appears valid
 */
export function validateApiKeyFormat(
  type: AIProviderType,
  apiKey: string
): boolean {
  // Ollama doesn't require an API key
  if (type === 'ollama') {
    return true;
  }

  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }

  switch (type) {
    case 'openai':
      // OpenAI keys start with 'sk-'
      return apiKey.startsWith('sk-') && apiKey.length > 20;
    case 'anthropic':
      // Anthropic keys start with 'sk-ant-'
      return apiKey.startsWith('sk-ant-') && apiKey.length > 20;
    default:
      return false;
  }
}

/**
 * Check if a provider requires an API key
 *
 * @param type - Provider type
 * @returns true if the provider requires an API key
 */
export function providerRequiresApiKey(type: AIProviderType): boolean {
  return type !== 'ollama';
}

/** The model chosen in settings for a provider */
export function modelForProvider(
  provider: AIProviderType,
  models: { ollamaModel?: string; openaiModel?: string; anthropicModel?: string }
): string | undefined {
  const byProvider: Record<AIProviderType, string | undefined> = {
    ollama: models.ollamaModel,
    openai: models.openaiModel,
    anthropic: models.anthropicModel,
  };
  return byProvider[provider];
}

/**
 * Test connection to a provider
 *
 * @param type - Provider type
 * @param config - Provider configuration
 * @returns true if connection successful
 */
export async function testProviderConnection(
  type: AIProviderType,
  config: AIProviderConfig
): Promise<boolean> {
  try {
    const provider = getAIProvider(type, config);
    return await provider.testConnection();
  } catch {
    return false;
  }
}
