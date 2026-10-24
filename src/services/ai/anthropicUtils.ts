/**
 * Anthropic Utility Functions
 *
 * Helper functions for Anthropic model detection and configuration.
 */

/** Headers every Anthropic API request from the browser needs */
export const ANTHROPIC_API_HEADERS = {
  'anthropic-version': '2023-06-01',
  // Required for CORS: Anthropic rejects browser-origin requests without this opt-in
  'anthropic-dangerous-direct-browser-access': 'true',
};

// Session cache for models (persists until page refresh)
let cachedModels: Array<{ value: string; label: string }> | null = null;
let cachedApiKey: string | null = null;

/**
 * Clear the models cache (useful for testing)
 */
export function clearAnthropicModelsCache(): void {
  cachedModels = null;
  cachedApiKey = null;
}

/**
 * Anthropic model information from the API
 */
export interface AnthropicModelInfo {
  id: string;
  type: string;
  display_name: string;
  created_at: string;
}

/**
 * Response from /v1/models endpoint
 */
interface AnthropicModelsResponse {
  data: AnthropicModelInfo[];
  has_more: boolean;
  first_id: string | null;
  last_id: string | null;
}

/**
 * Models to exclude (deprecated, not suitable for chat)
 */
const EXCLUDED_PATTERNS = [
  /instant/i,  // Legacy instant models
];

/**
 * Check if a model is suitable for lab report analysis
 */
function isChatModel(modelId: string): boolean {
  // Must start with claude
  if (!modelId.startsWith('claude')) return false;

  // Must not match any excluded patterns
  const isExcluded = EXCLUDED_PATTERNS.some(pattern =>
    pattern.test(modelId)
  );

  return !isExcluded;
}

/**
 * Fetch available models from Anthropic API
 *
 * @param apiKey - Anthropic API key
 * @param timeout - Request timeout in milliseconds
 * @returns Array of model info objects suitable for chat completion
 */
export async function getAnthropicModels(
  apiKey: string,
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

    const response = await fetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        ...ANTHROPIC_API_HEADERS,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn('Failed to fetch Anthropic models:', response.status);
      return [];
    }

    const data = await response.json() as AnthropicModelsResponse;

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
    console.warn('Error fetching Anthropic models:', error);
    return [];
  }
}

/**
 * @deprecated Use getAnthropicModels with API key instead. This only exists for backward compatibility.
 */
export function getDefaultAnthropicModels(): Array<{ value: string; label: string }> {
  return [];
}

