/**
 * Apply the AI configuration contained in a backup: provider and model
 * choices from any backup, and the API key from encrypted backups only.
 */

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

export async function restoreAISettings(
  data: ParsedBackupData | ParsedEncryptedBackupData,
  target: AISettingsTarget
): Promise<void> {
  const fullSettings = 'fullSettings' in data ? data.fullSettings : null;
  const settings: Partial<Settings> | null = fullSettings ?? data.settings;
  if (!settings) return;

  if (settings.aiProvider) await target.setAiProvider(settings.aiProvider);
  if (settings.openaiModel) await target.setOpenaiModel(settings.openaiModel);
  if (settings.anthropicModel) await target.setAnthropicModel(settings.anthropicModel);
  if (settings.ollamaModel) await target.setOllamaModel(settings.ollamaModel);
  // Only encrypted backups may carry the key
  if (fullSettings?.aiApiKey) await target.setApiKey(fullSettings.aiApiKey);
}
