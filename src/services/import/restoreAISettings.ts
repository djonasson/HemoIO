/**
 * Apply the AI configuration contained in a backup: provider and model
 * choices from any backup, and the API key from encrypted backups only.
 */

import { modelForProvider } from '@services/ai';
import type { AIProviderType, Settings } from '@/types';
import type { ParsedBackupData } from './jsonImport';
import type { ParsedEncryptedBackupData } from './encryptedImport';

/** The app's AI settings setters */
export interface AISettingsTarget {
  setAiProvider(provider: AIProviderType): Promise<void>;
  setOpenaiModel(model: string): Promise<void>;
  setAnthropicModel(model: string): Promise<void>;
  setOllamaModel(model: string): Promise<void>;
  setApiKey(apiKey: string): Promise<void>;
}

/** What restoring a backup's AI configuration would change */
export interface BackupAISettingsSummary {
  provider: AIProviderType;
  model?: string;
  apiKeyLastFour?: string;
}

function aiSettingsOf(data: ParsedBackupData | ParsedEncryptedBackupData): {
  settings: Partial<Settings> | null;
  apiKey?: string;
} {
  const fullSettings = 'fullSettings' in data ? data.fullSettings : null;
  // Only encrypted backups may carry the key
  return { settings: fullSettings ?? data.settings, apiKey: fullSettings?.aiApiKey };
}

/**
 * Summarise a backup's AI configuration so the user can decide whether to
 * apply it: restoring it changes where lab reports are sent for analysis.
 */
export function describeBackupAISettings(
  data: ParsedBackupData | ParsedEncryptedBackupData
): BackupAISettingsSummary | null {
  const { settings, apiKey } = aiSettingsOf(data);
  if (!settings?.aiProvider) return null;
  return {
    provider: settings.aiProvider,
    model: modelForProvider(settings.aiProvider, settings),
    apiKeyLastFour: apiKey ? apiKey.slice(-4) : undefined,
  };
}

/**
 * Apply each AI setting in the backup. One that is not saved does not stop
 * the others; the first failure is passed on once all were tried.
 */
export async function restoreAISettings(
  data: ParsedBackupData | ParsedEncryptedBackupData,
  target: AISettingsTarget
): Promise<void> {
  const { settings, apiKey } = aiSettingsOf(data);
  if (!settings) return;

  const saves: Array<() => Promise<void>> = [];
  const { aiProvider, openaiModel, anthropicModel, ollamaModel } = settings;
  if (aiProvider) saves.push(() => target.setAiProvider(aiProvider));
  if (openaiModel) saves.push(() => target.setOpenaiModel(openaiModel));
  if (anthropicModel) saves.push(() => target.setAnthropicModel(anthropicModel));
  if (ollamaModel) saves.push(() => target.setOllamaModel(ollamaModel));
  if (apiKey) saves.push(() => target.setApiKey(apiKey));

  // One after another, as before: each is a write of its own
  const failures: unknown[] = [];
  for (const save of saves) {
    await save().catch((err: unknown) => failures.push(err));
  }
  if (failures.length > 0) throw failures[0];
}
