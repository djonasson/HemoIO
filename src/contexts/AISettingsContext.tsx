/**
 * AI Settings Context
 *
 * Provides access to AI provider and model settings stored in IndexedDB,
 * with automatic migration from localStorage for existing users.
 *
 * State lives in a single provider so a model chosen in Settings is used by
 * the import view, which stays mounted across navigation.
 */

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useEncryptedDb } from '@hooks/useEncryptedDb';
import { AISettingsContext, type UseAISettingsResult } from '@hooks/useAISettings';
import type { AIProviderType, Settings } from '@/types';

// Where the setup wizard and older versions kept these settings
const LEGACY_KEYS = {
  aiProvider: 'hemoio_ai_provider',
  ollamaModel: 'hemoio_ollama_model',
  openaiModel: 'hemoio_openai_model',
  anthropicModel: 'hemoio_anthropic_model',
} as const;

type AIFields = Pick<Settings, 'aiProvider' | 'ollamaModel' | 'openaiModel' | 'anthropicModel'>;

function readLegacySettings(): Partial<AIFields> {
  const legacy: Partial<AIFields> = {};
  for (const [field, key] of Object.entries(LEGACY_KEYS)) {
    const value = localStorage.getItem(key);
    if (value) Object.assign(legacy, { [field]: value });
  }
  return legacy;
}

function useAISettingsState(): UseAISettingsResult {
  const { db, isReady } = useEncryptedDb();
  const [aiProvider, setAiProviderState] = useState<AIProviderType>('openai');
  const [ollamaModel, setOllamaModelState] = useState<string | undefined>();
  const [openaiModel, setOpenaiModelState] = useState<string | undefined>();
  const [anthropicModel, setAnthropicModelState] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);

  // Load settings from IndexedDB with localStorage migration
  useEffect(() => {
    const show = (fields: Partial<AIFields>) => {
      if (fields.aiProvider) setAiProviderState(fields.aiProvider);
      setOllamaModelState(fields.ollamaModel);
      setOpenaiModelState(fields.openaiModel);
      setAnthropicModelState(fields.anthropicModel);
    };

    async function loadSettings() {
      const legacy = readLegacySettings();
      if (!db || !isReady) {
        // Before unlock, during the setup flow
        show(legacy);
        setIsLoading(false);
        return;
      }

      try {
        const settings = await db.getSettings();
        // Stored values win; localStorage only fills what was never saved
        const fields: AIFields = {
          aiProvider: settings?.aiProvider ?? legacy.aiProvider ?? 'openai',
          ollamaModel: settings?.ollamaModel ?? legacy.ollamaModel,
          openaiModel: settings?.openaiModel ?? legacy.openaiModel,
          anthropicModel: settings?.anthropicModel ?? legacy.anthropicModel,
        };
        show(fields);

        if (Object.keys(legacy).length > 0) {
          await db.updateSettings(fields);
          Object.values(LEGACY_KEYS).forEach((key) => localStorage.removeItem(key));
        }
      } catch (err) {
        console.error('Failed to load AI settings:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadSettings();
  }, [db, isReady]);

  const save = useCallback(
    async (changes: Partial<AIFields>, what: string) => {
      if (!db || !isReady) return;
      try {
        await db.updateSettings(changes);
      } catch (err) {
        console.error(`Failed to save ${what}:`, err);
      }
    },
    [db, isReady]
  );

  const setAiProvider = useCallback(
    async (provider: AIProviderType) => {
      setAiProviderState(provider);
      await save({ aiProvider: provider }, 'AI provider');
    },
    [save]
  );

  const setOllamaModel = useCallback(
    async (model: string) => {
      setOllamaModelState(model);
      await save({ ollamaModel: model }, 'Ollama model');
    },
    [save]
  );

  const setOpenaiModel = useCallback(
    async (model: string) => {
      setOpenaiModelState(model);
      await save({ openaiModel: model }, 'OpenAI model');
    },
    [save]
  );

  const setAnthropicModel = useCallback(
    async (model: string) => {
      setAnthropicModelState(model);
      await save({ anthropicModel: model }, 'Anthropic model');
    },
    [save]
  );

  return useMemo(
    () => ({
      aiProvider,
      ollamaModel,
      openaiModel,
      anthropicModel,
      isLoading,
      setAiProvider,
      setOllamaModel,
      setOpenaiModel,
      setAnthropicModel,
    }),
    [
      aiProvider,
      ollamaModel,
      openaiModel,
      anthropicModel,
      isLoading,
      setAiProvider,
      setOllamaModel,
      setOpenaiModel,
      setAnthropicModel,
    ]
  );
}

interface AISettingsProviderProps {
  children: ReactNode;
}

export function AISettingsProvider({ children }: AISettingsProviderProps): ReactNode {
  const value = useAISettingsState();
  return <AISettingsContext.Provider value={value}>{children}</AISettingsContext.Provider>;
}
