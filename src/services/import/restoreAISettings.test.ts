import { describe, it, expect, vi } from 'vitest';
import { restoreAISettings, type AISettingsTarget } from './restoreAISettings';
import type { ParsedBackupData } from './jsonImport';
import type { ParsedEncryptedBackupData } from './encryptedImport';

function target(): AISettingsTarget & Record<string, ReturnType<typeof vi.fn>> {
  return {
    setAiProvider: vi.fn().mockResolvedValue(undefined),
    setOpenaiModel: vi.fn().mockResolvedValue(undefined),
    setAnthropicModel: vi.fn().mockResolvedValue(undefined),
    setOllamaModel: vi.fn().mockResolvedValue(undefined),
    setApiKey: vi.fn().mockResolvedValue(undefined),
  };
}

const base: ParsedBackupData = {
  labResults: [],
  testValues: [],
  userNotes: [],
  settings: null,
  userPreferences: null,
  schemaVersion: 2,
  exportedAt: new Date(),
};

describe('restoreAISettings', () => {
  it('restores provider and models from a standard backup, never a key', async () => {
    const t = target();

    await restoreAISettings(
      { ...base, settings: { aiProvider: 'anthropic', anthropicModel: 'claude-x' } },
      t
    );

    expect(t.setAiProvider).toHaveBeenCalledWith('anthropic');
    expect(t.setAnthropicModel).toHaveBeenCalledWith('claude-x');
    expect(t.setOpenaiModel).not.toHaveBeenCalled();
    expect(t.setApiKey).not.toHaveBeenCalled();
  });

  it('restores the API key and settings from an encrypted backup', async () => {
    const t = target();
    const encrypted: ParsedEncryptedBackupData = {
      ...base,
      wasEncrypted: true,
      fullSettings: {
        storageProvider: 'local',
        aiProvider: 'openai',
        aiApiKey: 'sk-secret',
        openaiModel: 'gpt-y',
        language: 'en',
      },
    };

    await restoreAISettings(encrypted, t);

    expect(t.setAiProvider).toHaveBeenCalledWith('openai');
    expect(t.setOpenaiModel).toHaveBeenCalledWith('gpt-y');
    expect(t.setApiKey).toHaveBeenCalledWith('sk-secret');
  });

  it('changes nothing when the backup has no settings', async () => {
    const t = target();

    await restoreAISettings(base, t);

    Object.values(t).forEach((fn) => expect(fn).not.toHaveBeenCalled());
  });
});
