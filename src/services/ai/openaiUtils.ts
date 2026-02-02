/**
 * OpenAI Utility Functions
 *
 * Helper functions for OpenAI model detection and configuration.
 */

/**
 * OpenAI model information from the API
 */
export interface OpenAIModelInfo {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

/**
 * Response from /v1/models endpoint
 */
interface OpenAIModelsResponse {
  data: OpenAIModelInfo[];
  object: string;
}

/**
 * Models suitable for lab report analysis (chat completion models)
 * These are the model prefixes we want to show to users
 */
const CHAT_MODEL_PREFIXES = [
  'gpt-4o',
  'gpt-4-turbo',
  'gpt-4',
  'gpt-3.5-turbo',
  'o1',
  'o3',
];

/**
 * Models to exclude (snapshots, fine-tunes, deprecated)
 */
const EXCLUDED_PATTERNS = [
  /realtime/i,
  /audio/i,
  /whisper/i,
  /tts/i,
  /dall-e/i,
  /embedding/i,
  /davinci/i,
  /curie/i,
  /babbage/i,
  /ada/i,
  /moderation/i,
  /instruct/i,
  /-\d{4}$/, // Date-specific snapshots like gpt-4-0613
  /\d{4}-\d{2}-\d{2}$/, // Full date snapshots
];

/**
 * Model display names and sorting priority
 */
const MODEL_DISPLAY_INFO: Record<string, { label: string; priority: number }> = {
  'gpt-4o': { label: 'GPT-4o (Best quality)', priority: 1 },
  'gpt-4o-mini': { label: 'GPT-4o Mini (Faster, cheaper)', priority: 2 },
  'o1': { label: 'o1 (Advanced reasoning)', priority: 3 },
  'o1-mini': { label: 'o1 Mini (Fast reasoning)', priority: 4 },
  'o1-preview': { label: 'o1 Preview', priority: 5 },
  'o3-mini': { label: 'o3 Mini (Latest reasoning)', priority: 6 },
  'gpt-4-turbo': { label: 'GPT-4 Turbo', priority: 10 },
  'gpt-4-turbo-preview': { label: 'GPT-4 Turbo Preview', priority: 11 },
  'gpt-4': { label: 'GPT-4', priority: 20 },
  'gpt-3.5-turbo': { label: 'GPT-3.5 Turbo (Fastest, cheapest)', priority: 30 },
};

/**
 * Check if a model is suitable for chat completion / lab report analysis
 */
function isChatModel(modelId: string): boolean {
  // Must start with one of the chat model prefixes
  const hasValidPrefix = CHAT_MODEL_PREFIXES.some(prefix =>
    modelId.startsWith(prefix)
  );

  if (!hasValidPrefix) return false;

  // Must not match any excluded patterns
  const isExcluded = EXCLUDED_PATTERNS.some(pattern =>
    pattern.test(modelId)
  );

  return !isExcluded;
}

/**
 * Get display info for a model
 */
function getModelDisplayInfo(modelId: string): { label: string; priority: number } {
  // Check for exact match first
  if (MODEL_DISPLAY_INFO[modelId]) {
    return MODEL_DISPLAY_INFO[modelId];
  }

  // Check for prefix match (for variants like gpt-4o-2024-05-13)
  for (const [key, info] of Object.entries(MODEL_DISPLAY_INFO)) {
    if (modelId.startsWith(key) && modelId !== key) {
      return { label: `${info.label.split(' (')[0]} (${modelId})`, priority: info.priority + 0.5 };
    }
  }

  // Default: use the model ID as the label
  return { label: modelId, priority: 100 };
}

/**
 * Fetch available models from OpenAI API
 *
 * @param apiKey - OpenAI API key
 * @param baseUrl - Optional base URL (default: https://api.openai.com/v1)
 * @param timeout - Request timeout in milliseconds
 * @returns Array of model info objects suitable for chat completion
 */
export async function getOpenAIModels(
  apiKey: string,
  baseUrl: string = 'https://api.openai.com/v1',
  timeout: number = 10000
): Promise<Array<{ value: string; label: string }>> {
  if (!apiKey) {
    return [];
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn('Failed to fetch OpenAI models:', response.status);
      return getDefaultOpenAIModels();
    }

    const data = await response.json() as OpenAIModelsResponse;

    // Filter to chat models and add display info
    const chatModels = data.data
      .filter(model => isChatModel(model.id))
      .map(model => ({
        value: model.id,
        ...getModelDisplayInfo(model.id),
      }))
      .sort((a, b) => a.priority - b.priority)
      .map(({ value, label }) => ({ value, label }));

    // If we got models, return them; otherwise return defaults
    return chatModels.length > 0 ? chatModels : getDefaultOpenAIModels();
  } catch (error) {
    console.warn('Error fetching OpenAI models:', error);
    return getDefaultOpenAIModels();
  }
}

/**
 * Get default OpenAI models (fallback when API call fails)
 */
export function getDefaultOpenAIModels(): Array<{ value: string; label: string }> {
  return [
    { value: 'gpt-4o', label: 'GPT-4o (Best quality)' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Faster, cheaper)' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'gpt-4', label: 'GPT-4' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Fastest, cheapest)' },
  ];
}

/**
 * Test if an OpenAI API key is valid by making a models request
 *
 * @param apiKey - OpenAI API key to test
 * @param baseUrl - Optional base URL
 * @returns true if the API key is valid
 */
export async function testOpenAIApiKey(
  apiKey: string,
  baseUrl: string = 'https://api.openai.com/v1'
): Promise<boolean> {
  if (!apiKey) return false;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}
