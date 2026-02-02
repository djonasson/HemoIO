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
  defaultModel: string;
  models: Array<{ id: string; name: string }>;
  requiresApiKey: boolean;
  isLocal: boolean;
}

export function getAvailableProviders(): ProviderInfo[] {
  return [
    {
      type: 'openai',
      name: 'OpenAI',
      description: 'GPT-4 and GPT-3.5 models for lab report analysis',
      defaultModel: 'gpt-4o-mini',
      models: [
        { id: 'gpt-4o', name: 'GPT-4o (Recommended)' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Faster, cheaper)' },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo (Budget)' },
      ],
      requiresApiKey: true,
      isLocal: false,
    },
    {
      type: 'anthropic',
      name: 'Anthropic Claude',
      description: 'Claude models for accurate medical data extraction',
      defaultModel: 'claude-sonnet-4-20250514',
      models: [
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4 (Recommended)' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
        { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku (Fast, budget)' },
      ],
      requiresApiKey: true,
      isLocal: false,
    },
    {
      type: 'ollama',
      name: 'Ollama (Local)',
      description: 'Run AI models locally for complete privacy. No API key required.',
      defaultModel: 'llama3.2:8b',
      models: [
        { id: 'llama3.2:8b', name: 'Llama 3.2 8B (Recommended)' },
        { id: 'llama3.1:8b', name: 'Llama 3.1 8B' },
        { id: 'qwen2.5:7b', name: 'Qwen 2.5 7B' },
        { id: 'mistral:7b', name: 'Mistral 7B' },
        { id: 'llava:13b', name: 'LLaVA 13B (Vision)' },
      ],
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
