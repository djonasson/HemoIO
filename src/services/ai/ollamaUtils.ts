/**
 * Ollama Utility Functions
 *
 * Helper functions for Ollama model detection, ranking, and configuration.
 */

/**
 * Default Ollama configuration values
 */
export const OLLAMA_DEFAULTS = {
  baseUrl: 'http://localhost:11434',
  timeout: 120000, // 2 minutes for local processing
  temperature: 0.1,
  maxTokens: 4096,
} as const;

/**
 * Information about an Ollama model
 */
export interface OllamaModelInfo {
  name: string;
  modifiedAt: string;
  size: number;
  digest: string;
  details?: {
    format: string;
    family: string;
    families?: string[];
    parameterSize: string;
    quantizationLevel: string;
  };
}

/**
 * Response from /api/tags endpoint
 */
export interface OllamaTagsResponse {
  models: OllamaModelInfo[];
}

/**
 * Ranked text models for lab report analysis (in order of preference)
 * These models are good at structured data extraction and instruction following.
 */
export const RANKED_TEXT_MODELS = [
  'llama3.2:8b',
  'llama3.1:8b',
  'qwen2.5:7b',
  'mistral:7b',
  'llama3.2:3b',
  'llama3.1:3b',
  'mixtral:8x7b',
  'llama2:13b',
  'llama2:7b',
] as const;

/**
 * Known vision-capable models for image analysis
 */
export const VISION_MODELS = [
  'llama3.2-vision:11b',
  'llama3.2-vision:90b',
  'llava:13b',
  'llava:34b',
  'llava-llama3:8b',
  'bakllava:7b',
  'moondream:1.8b',
] as const;

/**
 * Check if a model name indicates vision capability
 */
export function isVisionModel(modelName: string): boolean {
  const lowerName = modelName.toLowerCase();
  return (
    VISION_MODELS.some((vm) => lowerName.startsWith(vm.split(':')[0])) ||
    lowerName.includes('vision') ||
    lowerName.includes('llava')
  );
}

/**
 * Check if Ollama is running at the specified URL
 *
 * @param baseUrl - Ollama base URL (default: http://localhost:11434)
 * @param timeout - Request timeout in milliseconds
 * @returns true if Ollama is running and accessible
 */
export async function isOllamaRunning(
  baseUrl: string = OLLAMA_DEFAULTS.baseUrl,
  timeout: number = 5000
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get list of available models from Ollama
 *
 * @param baseUrl - Ollama base URL
 * @param timeout - Request timeout in milliseconds
 * @returns Array of model info objects, or empty array if unavailable
 */
export async function getAvailableModels(
  baseUrl: string = OLLAMA_DEFAULTS.baseUrl,
  timeout: number = 5000
): Promise<OllamaModelInfo[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as OllamaTagsResponse;
    return data.models || [];
  } catch {
    return [];
  }
}

/**
 * Get just the model names from Ollama
 *
 * @param baseUrl - Ollama base URL
 * @param timeout - Request timeout in milliseconds
 * @returns Array of model names
 */
export async function getModelNames(
  baseUrl: string = OLLAMA_DEFAULTS.baseUrl,
  timeout: number = 5000
): Promise<string[]> {
  const models = await getAvailableModels(baseUrl, timeout);
  return models.map((m) => m.name);
}

/**
 * Select the best text model from available models
 *
 * @param availableModels - List of available model names
 * @returns Best model name or undefined if none available
 */
export function selectBestTextModel(
  availableModels: string[]
): string | undefined {
  // Check ranked models in order of preference
  for (const rankedModel of RANKED_TEXT_MODELS) {
    // Match either exact name or with different tag
    const matchingModel = availableModels.find((m) => {
      const baseName = rankedModel.split(':')[0];
      return m === rankedModel || m.startsWith(`${baseName}:`);
    });
    if (matchingModel) {
      return matchingModel;
    }
  }

  // If no ranked model found, return first available non-vision model
  const textModels = availableModels.filter((m) => !isVisionModel(m));
  return textModels[0];
}

/**
 * Select the best vision model from available models
 *
 * @param availableModels - List of available model names
 * @returns Best vision model name or undefined if none available
 */
export function selectBestVisionModel(
  availableModels: string[]
): string | undefined {
  // Check ranked vision models in order of preference
  for (const visionModel of VISION_MODELS) {
    const matchingModel = availableModels.find((m) => {
      const baseName = visionModel.split(':')[0];
      return m === visionModel || m.startsWith(`${baseName}:`);
    });
    if (matchingModel) {
      return matchingModel;
    }
  }

  // Check for any model that looks like a vision model
  return availableModels.find((m) => isVisionModel(m));
}

/**
 * Get recommended models based on what's available
 *
 * @param baseUrl - Ollama base URL
 * @returns Object with recommended text and vision models
 */
export async function getRecommendedModels(
  baseUrl: string = OLLAMA_DEFAULTS.baseUrl
): Promise<{
  textModel: string | undefined;
  visionModel: string | undefined;
  hasVisionCapability: boolean;
  availableModels: string[];
}> {
  const availableModels = await getModelNames(baseUrl);

  const textModel = selectBestTextModel(availableModels);
  const visionModel = selectBestVisionModel(availableModels);

  return {
    textModel,
    visionModel,
    hasVisionCapability: visionModel !== undefined,
    availableModels,
  };
}

/**
 * Format model size for display (bytes to human-readable)
 *
 * @param bytes - Size in bytes
 * @returns Human-readable size string
 */
export function formatModelSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Parse Ollama error response
 *
 * @param response - Fetch response object
 * @returns Error message string
 */
export async function parseOllamaError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (typeof data === 'object' && data !== null && 'error' in data) {
      return String(data.error);
    }
  } catch {
    // Fall through to default message
  }

  return `HTTP ${response.status}: ${response.statusText}`;
}
