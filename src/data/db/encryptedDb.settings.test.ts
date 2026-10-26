import { describe, it, expect } from 'vitest';
import { openTestDb } from './testDb';

describe('EncryptedDb.updateSettings', () => {
  it('creates the record with defaults when there is none', async () => {
    const { db } = await openTestDb();
    await db.updateSettings({ anthropicModel: 'claude-x' });

    expect(await db.getSettings()).toEqual(
      expect.objectContaining({
        storageProvider: 'local',
        aiProvider: 'openai',
        language: 'en',
        anthropicModel: 'claude-x',
      })
    );
  });

  it('changes only the fields it is given', async () => {
    const { db } = await openTestDb();
    await db.saveSettings({
      storageProvider: 'local',
      aiProvider: 'anthropic',
      language: 'it',
      aiApiKey: 'secret-key',
      openaiModel: 'gpt-x',
    });

    await db.updateSettings({ anthropicModel: 'claude-x' });

    expect(await db.getSettings()).toEqual(
      expect.objectContaining({
        aiProvider: 'anthropic',
        language: 'it',
        aiApiKey: 'secret-key',
        openaiModel: 'gpt-x',
        anthropicModel: 'claude-x',
      })
    );
  });

  it('keeps concurrent updates to different fields', async () => {
    const { db } = await openTestDb();
    await Promise.all([
      db.updateSettings({ aiProvider: 'ollama' }),
      db.updateSettings({ ollamaModel: 'llama' }),
      db.updateSettings({ openaiModel: 'gpt-x' }),
    ]);

    expect(await db.getSettings()).toEqual(
      expect.objectContaining({ aiProvider: 'ollama', ollamaModel: 'llama', openaiModel: 'gpt-x' })
    );
  });

  it('stores the API key encrypted', async () => {
    const { db, database } = await openTestDb();
    await db.updateSettings({ aiApiKey: 'secret-key' });

    const stored = await database.settings.toCollection().first();
    expect(stored?.aiApiKey).not.toBe('secret-key');
    expect((await db.getSettings())?.aiApiKey).toBe('secret-key');
  });
});
