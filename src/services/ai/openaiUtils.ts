/**
 * OpenAI Utility Functions
 *
 * Helper functions for OpenAI model detection and configuration.
 */

// Session cache for models (persists until page refresh)
let cachedModels: Array<{ value: string; label: string }> | null = null;
let cachedApiKey: string | null = null;

/**
 * Clear the models cache (useful for testing)
 */
export function clearOpenAIModelsCache(): void {
  cachedModels = null;
  cachedApiKey = null;
}

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
 * Models to exclude (not suitable for chat/text analysis)
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
  /transcribe/i,
  /sora/i,
  /image/i,
  /search/i,
  /codex/i,
];

/**
 * Check if a model is suitable for chat completion / lab report analysis
 */
function isChatModel(modelId: string): boolean {
  // Must be a GPT or o-series model
  const isGptOrO = modelId.startsWith('gpt-') || modelId.startsWith('o1') || modelId.startsWith('o3') || modelId.startsWith('o4') || modelId === 'chatgpt-4o-latest';

  if (!isGptOrO) return false;

  // Must not match any excluded patterns
  const isExcluded = EXCLUDED_PATTERNS.some(pattern =>
    pattern.test(modelId)
  );

  return !isExcluded;
}

/**
 * Fetch available models from OpenAI API
 *
 * @param apiKey - OpenAI API key
 * @param baseUrl - Optional base URL (default: https://api.openai.com/v1)
 * @param timeout - Request timeout in milliseconds
 * @returns Array of model info objects suitable for chat completion, or empty array on failure
 */
export async function getOpenAIModels(
  apiKey: string,
  baseUrl: string = 'https://api.openai.com/v1',
  timeout: number = 10000
): Promise<Array<{ value: string; label: string }>> {
  if (!apiKey) {
    return [];
  }

  // Return cached models if available and API key hasn't changed
  if (cachedModels && cachedApiKey === apiKey) {
    return cachedModels;
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
      return [];
    }

    const data = await response.json() as OpenAIModelsResponse;

    // Filter to chat models and sort alphabetically
    const chatModels = data.data
      .filter(model => isChatModel(model.id))
      .map(model => ({
        value: model.id,
        label: model.id,
      }))
      .sort((a, b) => a.value.localeCompare(b.value));

    // Cache the result for the session
    cachedModels = chatModels;
    cachedApiKey = apiKey;

    return chatModels;
  } catch (error) {
    console.warn('Error fetching OpenAI models:', error);
    return [];
  }
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

/**
 * @deprecated Use getOpenAIModels with API key instead. This only exists for backward compatibility.
 */
export function getDefaultOpenAIModels(): Array<{ value: string; label: string }> {
  return [];
}
