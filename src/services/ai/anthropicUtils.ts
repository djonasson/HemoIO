/**
 * Anthropic Utility Functions
 *
 * Helper functions for Anthropic model detection and configuration.
 */

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
 * Model display names and sorting priority
 */
const MODEL_DISPLAY_INFO: Record<string, { label: string; priority: number }> = {
  'claude-sonnet-4-20250514': { label: 'Claude Sonnet 4 (Balanced)', priority: 1 },
  'claude-opus-4-20250514': { label: 'Claude Opus 4 (Most capable)', priority: 2 },
  'claude-3-7-sonnet-20250219': { label: 'Claude 3.7 Sonnet', priority: 3 },
  'claude-3-5-sonnet-20241022': { label: 'Claude 3.5 Sonnet (Oct 2024)', priority: 4 },
  'claude-3-5-sonnet-20240620': { label: 'Claude 3.5 Sonnet (Jun 2024)', priority: 5 },
  'claude-3-5-haiku-20241022': { label: 'Claude 3.5 Haiku (Fastest)', priority: 6 },
  'claude-3-opus-20240229': { label: 'Claude 3 Opus', priority: 10 },
  'claude-3-sonnet-20240229': { label: 'Claude 3 Sonnet', priority: 11 },
  'claude-3-haiku-20240307': { label: 'Claude 3 Haiku', priority: 12 },
};

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
 * Get display info for a model
 */
function getModelDisplayInfo(model: AnthropicModelInfo): { label: string; priority: number } {
  // Check for exact match first
  if (MODEL_DISPLAY_INFO[model.id]) {
    return MODEL_DISPLAY_INFO[model.id];
  }

  // Use display_name from API if available
  if (model.display_name) {
    // Determine priority based on model type
    let priority = 100;
    if (model.id.includes('opus')) priority = 50;
    else if (model.id.includes('sonnet')) priority = 60;
    else if (model.id.includes('haiku')) priority = 70;

    return { label: model.display_name, priority };
  }

  // Default: use the model ID as the label
  return { label: model.id, priority: 100 };
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
      return getDefaultAnthropicModels();
    }

    const data = await response.json() as AnthropicModelsResponse;

    // Filter to chat models and add display info
    const chatModels = data.data
      .filter(model => isChatModel(model.id))
      .map(model => ({
        value: model.id,
        ...getModelDisplayInfo(model),
      }))
      .sort((a, b) => a.priority - b.priority)
      .map(({ value, label }) => ({ value, label }));

    // If we got models, return them; otherwise return defaults
    return chatModels.length > 0 ? chatModels : getDefaultAnthropicModels();
  } catch (error) {
    console.warn('Error fetching Anthropic models:', error);
    return getDefaultAnthropicModels();
  }
}

/**
 * Get default Anthropic models (fallback when API call fails)
 */
export function getDefaultAnthropicModels(): Array<{ value: string; label: string }> {
  return [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (Balanced)' },
    { value: 'claude-opus-4-20250514', label: 'Claude Opus 4 (Most capable)' },
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Latest)' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (Fastest)' },
    { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
  ];
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
