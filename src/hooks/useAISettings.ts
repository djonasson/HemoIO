/**
 * Hook for managing AI settings from IndexedDB
 *
 * Provides access to AI provider and model settings with automatic
 * migration from localStorage for existing users.
 */

import { useState, useEffect, useCallback } from 'react';
import { useEncryptedDb } from './useEncryptedDb';
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

/**
 * Hook that provides AI settings from IndexedDB with localStorage migration
 */
export function useAISettings(): UseAISettingsResult {
  const { db, isReady } = useEncryptedDb();
  const [aiProvider, setAiProviderState] = useState<AIProviderType>('openai');
  const [ollamaModel, setOllamaModelState] = useState<string | undefined>();
  const [openaiModel, setOpenaiModelState] = useState<string | undefined>();
  const [anthropicModel, setAnthropicModelState] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);

  // Load settings from IndexedDB with localStorage migration
  useEffect(() => {
    async function loadSettings() {
      if (!db || !isReady) {
        // If db not ready, try localStorage as fallback (for initial setup flow)
        const lsProvider = localStorage.getItem('hemoio_ai_provider') as AIProviderType | null;
        const lsOllamaModel = localStorage.getItem('hemoio_ollama_model');
        const lsOpenaiModel = localStorage.getItem('hemoio_openai_model');
        const lsAnthropicModel = localStorage.getItem('hemoio_anthropic_model');

        if (lsProvider) setAiProviderState(lsProvider);
        if (lsOllamaModel) setOllamaModelState(lsOllamaModel);
        if (lsOpenaiModel) setOpenaiModelState(lsOpenaiModel);
        if (lsAnthropicModel) setAnthropicModelState(lsAnthropicModel);
        setIsLoading(false);
        return;
      }

      try {
        const settings = await db.getSettings();

        // Check for localStorage values to migrate
        const lsProvider = localStorage.getItem('hemoio_ai_provider') as AIProviderType | null;
        const lsOllamaModel = localStorage.getItem('hemoio_ollama_model');
        const lsOpenaiModel = localStorage.getItem('hemoio_openai_model');
        const lsAnthropicModel = localStorage.getItem('hemoio_anthropic_model');

        // Use IndexedDB values if available, otherwise fall back to localStorage for migration
        const provider = settings?.aiProvider ?? lsProvider ?? 'openai';
        const ollama = settings?.ollamaModel ?? lsOllamaModel ?? undefined;
        const openai = settings?.openaiModel ?? lsOpenaiModel ?? undefined;
        const anthropic = settings?.anthropicModel ?? lsAnthropicModel ?? undefined;

        setAiProviderState(provider);
        setOllamaModelState(ollama);
        setOpenaiModelState(openai);
        setAnthropicModelState(anthropic);

        // Migrate localStorage to IndexedDB if needed
        if (lsProvider || lsOllamaModel || lsOpenaiModel || lsAnthropicModel) {
          await db.saveSettings({
            storageProvider: settings?.storageProvider ?? 'local',
            aiProvider: provider,
            ollamaModel: ollama,
            openaiModel: openai,
            anthropicModel: anthropic,
            language: settings?.language ?? 'en',
          });
          // Clean up localStorage after migration
          localStorage.removeItem('hemoio_ai_provider');
          localStorage.removeItem('hemoio_ollama_model');
          localStorage.removeItem('hemoio_openai_model');
          localStorage.removeItem('hemoio_anthropic_model');
        }
      } catch (err) {
        console.error('Failed to load AI settings:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadSettings();
  }, [db, isReady]);

  // Update AI provider
  const setAiProvider = useCallback(
    async (provider: AIProviderType) => {
      setAiProviderState(provider);
      if (db && isReady) {
        try {
          const settings = await db.getSettings();
          await db.saveSettings({
            storageProvider: settings?.storageProvider ?? 'local',
            aiProvider: provider,
            ollamaModel: settings?.ollamaModel,
            openaiModel: settings?.openaiModel,
            anthropicModel: settings?.anthropicModel,
            language: settings?.language ?? 'en',
          });
        } catch (err) {
          console.error('Failed to save AI provider:', err);
        }
      }
    },
    [db, isReady]
  );

  // Update Ollama model
  const setOllamaModel = useCallback(
    async (model: string) => {
      setOllamaModelState(model);
      if (db && isReady) {
        try {
          const settings = await db.getSettings();
          await db.saveSettings({
            storageProvider: settings?.storageProvider ?? 'local',
            aiProvider: settings?.aiProvider ?? 'openai',
            ollamaModel: model,
            openaiModel: settings?.openaiModel,
            anthropicModel: settings?.anthropicModel,
            language: settings?.language ?? 'en',
          });
        } catch (err) {
          console.error('Failed to save Ollama model:', err);
        }
      }
    },
    [db, isReady]
  );

  // Update OpenAI model
  const setOpenaiModel = useCallback(
    async (model: string) => {
      setOpenaiModelState(model);
      if (db && isReady) {
        try {
          const settings = await db.getSettings();
          await db.saveSettings({
            storageProvider: settings?.storageProvider ?? 'local',
            aiProvider: settings?.aiProvider ?? 'openai',
            ollamaModel: settings?.ollamaModel,
            openaiModel: model,
            anthropicModel: settings?.anthropicModel,
            language: settings?.language ?? 'en',
          });
        } catch (err) {
          console.error('Failed to save OpenAI model:', err);
        }
      }
    },
    [db, isReady]
  );

  // Update Anthropic model
  const setAnthropicModel = useCallback(
    async (model: string) => {
      setAnthropicModelState(model);
      if (db && isReady) {
        try {
          const settings = await db.getSettings();
          await db.saveSettings({
            storageProvider: settings?.storageProvider ?? 'local',
            aiProvider: settings?.aiProvider ?? 'openai',
            ollamaModel: settings?.ollamaModel,
            openaiModel: settings?.openaiModel,
            anthropicModel: model,
            language: settings?.language ?? 'en',
          });
        } catch (err) {
          console.error('Failed to save Anthropic model:', err);
        }
      }
    },
    [db, isReady]
  );

  return {
    aiProvider,
    ollamaModel,
    openaiModel,
    anthropicModel,
    isLoading,
    setAiProvider,
    setOllamaModel,
    setOpenaiModel,
    setAnthropicModel,
  };
}
