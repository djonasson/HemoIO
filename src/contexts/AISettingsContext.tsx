/**
 * AI Settings Context
 *
 * Provides access to AI provider and model settings stored in IndexedDB,
 * with automatic migration from localStorage for existing users.
 *
 * State lives in a single provider so a model chosen in Settings is used by
 * the import view, which stays mounted across navigation.
 */

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
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
  // The values shown, and the values stored: a failed save shows the stored
  // one again, as the value shown before it may not have been saved either
  const shown = useRef<Partial<AIFields>>({ aiProvider: 'openai' });
  const stored = useRef<Partial<AIFields>>({ aiProvider: 'openai' });

  // Load settings from IndexedDB with localStorage migration
  useEffect(() => {
    const show = (fields: Partial<AIFields>) => {
      shown.current = { ...fields, aiProvider: fields.aiProvider ?? shown.current.aiProvider };
      stored.current = shown.current;
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

  /**
   * Show a change at once, then save it. A failed save puts the stored
   * value back, unless a newer change replaced it already, and rejects so
   * the caller can tell the user.
   */
  const change = useCallback(
    async <F extends keyof AIFields>(
      field: F,
      value: AIFields[F],
      setState: (value: AIFields[F]) => void
    ): Promise<void> => {
      shown.current = { ...shown.current, [field]: value };
      setState(value);
      try {
        // Before unlock there is nowhere to save it: what is shown is all there is
        if (db && isReady) await db.updateSettings({ [field]: value });
        stored.current = { ...stored.current, [field]: value };
      } catch (err) {
        if (shown.current[field] === value) {
          const before = stored.current[field] as AIFields[F];
          shown.current = { ...shown.current, [field]: before };
          setState(before);
        }
        throw err;
      }
    },
    [db, isReady]
  );

  const setAiProvider = useCallback(
    (provider: AIProviderType) =>
      change('aiProvider', provider, (value) => setAiProviderState(value ?? 'openai')),
    [change]
  );

  const setOllamaModel = useCallback(
    (model: string) => change('ollamaModel', model, setOllamaModelState),
    [change]
  );

  const setOpenaiModel = useCallback(
    (model: string) => change('openaiModel', model, setOpenaiModelState),
    [change]
  );

  const setAnthropicModel = useCallback(
    (model: string) => change('anthropicModel', model, setAnthropicModelState),
    [change]
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
