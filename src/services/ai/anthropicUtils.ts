/**
 * Anthropic Utility Functions
 *
 * Helper functions for Anthropic model detection and configuration.
 */

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
        'anthropic-version': '2023-06-01',
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

/**
 * Test if an Anthropic API key is valid by making a models request
 *
 * @param apiKey - Anthropic API key to test
 * @returns true if the API key is valid
 */
export async function testAnthropicApiKey(apiKey: string): Promise<boolean> {
  if (!apiKey) return false;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}
