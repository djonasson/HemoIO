import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import Dexie from 'dexie';
import { HemoIODatabase } from './index';
import { EncryptedDb } from './encryptedDb';

const opened: HemoIODatabase[] = [];
afterEach(async () => {
  // Close first: deleting an open database makes Dexie warn
  await Promise.all(
    opened.splice(0).map((database) => {
      database.close();
      return Dexie.delete(database.name);
    })
  );
});

async function openDb(name: string): Promise<{ db: EncryptedDb; database: HemoIODatabase }> {
  const database = new HemoIODatabase(name);
  opened.push(database);
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  return { db: new EncryptedDb(key, database), database };
}

describe('EncryptedDb.updateSettings', () => {
  it('creates the record with defaults when there is none', async () => {
    const { db } = await openDb('settings-test-1');
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
    const { db } = await openDb('settings-test-2');
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
    const { db } = await openDb('settings-test-3');
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
    const { db, database } = await openDb('settings-test-4');
    await db.updateSettings({ aiApiKey: 'secret-key' });

    const stored = await database.settings.toCollection().first();
    expect(stored?.aiApiKey).not.toBe('secret-key');
    expect((await db.getSettings())?.aiApiKey).toBe('secret-key');
  });
});
