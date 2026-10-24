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

async function openDb(name: string): Promise<EncryptedDb> {
  const database = new HemoIODatabase(name);
  opened.push(database);
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  return new EncryptedDb(key, database);
}

describe('EncryptedDb.updatePreferences', () => {
  it('creates the record with defaults when there is none', async () => {
    const db = await openDb('prefs-test-1');
    await db.updatePreferences(() => ({ unitPreferences: { glucose: 'mmol/L' } }));

    expect(await db.getPreferences()).toEqual(
      expect.objectContaining({
        unitPreferences: { glucose: 'mmol/L' },
        personalTargets: {},
        theme: 'system',
        dateFormat: 'MM/DD/YYYY',
      })
    );
  });

  it('changes only the fields it returns', async () => {
    const db = await openDb('prefs-test-2');
    await db.savePreferences({
      unitPreferences: {},
      personalTargets: { glucose: { high: 90 } },
      theme: 'dark',
      dateFormat: 'YYYY-MM-DD',
      acknowledgedAlerts: { glucose: '2024-01-01T00:00:00.000Z' },
    });

    await db.updatePreferences((current) => ({
      unitPreferences: { ...current?.unitPreferences, glucose: 'mmol/L' },
    }));

    expect(await db.getPreferences()).toEqual(
      expect.objectContaining({
        unitPreferences: { glucose: 'mmol/L' },
        personalTargets: { glucose: { high: 90 } },
        theme: 'dark',
        acknowledgedAlerts: { glucose: '2024-01-01T00:00:00.000Z' },
      })
    );
  });

  it('keeps both of two updates made at the same time', async () => {
    const db = await openDb('prefs-test-3');
    await Promise.all([
      db.updatePreferences((c) => ({
        unitPreferences: { ...c?.unitPreferences, glucose: 'mmol/L' },
      })),
      db.updatePreferences((c) => ({
        unitPreferences: { ...c?.unitPreferences, hemoglobin: 'g/L' },
      })),
    ]);

    expect((await db.getPreferences())?.unitPreferences).toEqual({
      glucose: 'mmol/L',
      hemoglobin: 'g/L',
    });
  });
});
