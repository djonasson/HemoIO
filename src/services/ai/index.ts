/**
 * AI Services Module
 *
 * Provides AI-powered lab report analysis capabilities through
 * multiple provider implementations (OpenAI, Anthropic, Ollama).
 */

// Types
export type {
  AIProvider,
  AIProviderConfig,
  AIProviderType,
  OllamaConfig,
  AnalysisOptions,
  LabReportAnalysisResult,
  ExtractedBiomarker,
} from './types';

// Error classes
export { AIAnalysisError, AIConfigurationError } from './types';

// Provider Factory
export {
  getAIProvider,
  clearProviderCache,
  getAvailableProviders,
  validateApiKeyFormat,
  testProviderConnection,
  providerRequiresApiKey,
} from './AIProviderFactory';
export type { ProviderInfo } from './AIProviderFactory';

// Providers
export { OpenAIProvider } from './OpenAIProvider';
export { AnthropicProvider } from './AnthropicProvider';
export { OllamaProvider } from './OllamaProvider';

// Ollama utilities
export {
  isOllamaRunning,
  getAvailableModels as getOllamaModels,
  getModelNames as getOllamaModelNames,
  getRecommendedModels as getOllamaRecommendedModels,
  selectBestTextModel,
  selectBestVisionModel,
  isVisionModel,
  formatModelSize,
  OLLAMA_DEFAULTS,
  RANKED_TEXT_MODELS,
  VISION_MODELS,
} from './ollamaUtils';
export type { OllamaModelInfo, OllamaTagsResponse } from './ollamaUtils';

// OpenAI utilities
export {
  getOpenAIModels,
  getDefaultOpenAIModels,
  testOpenAIApiKey,
} from './openaiUtils';
export type { OpenAIModelInfo } from './openaiUtils';

// Anthropic utilities
export {
  getAnthropicModels,
  getDefaultAnthropicModels,
  testAnthropicApiKey,
} from './anthropicUtils';
export type { AnthropicModelInfo } from './anthropicUtils';

// Prompts (for advanced use cases)
export {
  LAB_REPORT_SYSTEM_PROMPT,
  ENHANCED_SYSTEM_PROMPT,
  createAnalysisPrompt,
  RESPONSE_SCHEMA,
  BIOMARKER_CONTEXT,
} from './prompts';
