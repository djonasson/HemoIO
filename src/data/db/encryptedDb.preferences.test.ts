import { describe, it, expect } from 'vitest';
import { openTestDb } from './testDb';
import type { EncryptedDb } from './encryptedDb';

async function openDb(): Promise<EncryptedDb> {
  return (await openTestDb()).db;
}

describe('EncryptedDb.updatePreferences', () => {
  it('creates the record with defaults when there is none', async () => {
    const db = await openDb();
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
    const db = await openDb();
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
    const db = await openDb();
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
