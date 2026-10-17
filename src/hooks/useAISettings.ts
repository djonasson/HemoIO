/**
 * Hook for reading and updating AI provider and model settings
 *
 * Must be used within an AISettingsProvider so all consumers share one state.
 */

import { createContext, useContext } from 'react';
import type { AIProviderType } from '@/types';

export interface UseAISettingsResult {
  /** Current AI provider */
  aiProvider: AIProviderType;
  /** Selected Ollama model */
  ollamaModel: string | undefined;
  /** Selected OpenAI model */
  openaiModel: string | undefined;
  /** Selected Anthropic model */
  anthropicModel: string | undefined;
  /** Whether settings are still loading */
  isLoading: boolean;
  /** Update AI provider */
  setAiProvider: (provider: AIProviderType) => Promise<void>;
  /** Update Ollama model */
  setOllamaModel: (model: string) => Promise<void>;
  /** Update OpenAI model */
  setOpenaiModel: (model: string) => Promise<void>;
  /** Update Anthropic model */
  setAnthropicModel: (model: string) => Promise<void>;
}

export const AISettingsContext = createContext<UseAISettingsResult | null>(null);

export function useAISettings(): UseAISettingsResult {
  const context = useContext(AISettingsContext);
  if (!context) {
    throw new Error('useAISettings must be used within an AISettingsProvider');
  }
  return context;
}
