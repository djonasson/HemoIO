import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { createCredentialsV2, type StoredCredentialsV2 } from '@data/encryption/keyWrapping';
import { backupKind, type FolderBackupStore } from './folderBackups';
import { keepBrowserData, keepCurrentFolderCopy, keepFolderCopy } from './folderConflict';
import { openEnvelope, readEnvelopeHeader } from './folderEnvelope';
import { digestFolderData, folderDataJson, sealFolderCopy, type FolderSyncData } from './folderSync';

class MemoryBackups implements FolderBackupStore {
  files = new Map<string, ArrayBuffer>();
  failSaves = false;
  async listBackups(): Promise<string[]> {
    return [...this.files.keys()];
  }
  async saveBackup(name: string, bytes: ArrayBuffer): Promise<void> {
    if (this.failSaves) throw new Error('Disk full');
    this.files.set(name, bytes);
  }
  async loadBackup(name: string): Promise<ArrayBuffer> {
    return this.files.get(name)!;
  }
  async deleteBackup(name: string): Promise<void> {
    this.files.delete(name);
  }
}

const DATA: FolderSyncData = {
  labResults: [
    {
      id: 1,
      date: new Date('2024-01-15T10:00:00.000Z'),
      labName: 'Quest Diagnostics',
      createdAt: new Date('2024-01-15T10:00:00.000Z'),
      updatedAt: new Date('2024-01-15T10:00:00.000Z'),
    },
  ],
  testValues: [],
  userNotes: [],
  settings: undefined,
  preferences: undefined,
};

let LOCK: StoredCredentialsV2;
beforeAll(async () => {
  LOCK = (await createCredentialsV2('Passw0rd!', 1000)).credentials;
});

describe('keeping the side about to be replaced', () => {
  let key: CryptoKey;
  let backups: MemoryBackups;
  const db = { exportAllData: vi.fn(async () => DATA) };

  beforeEach(async () => {
    key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    backups = new MemoryBackups();
  });

  const only = (): ArrayBuffer => {
    expect(backups.files.size).toBe(1);
    return [...backups.files.values()][0];
  };

  it("keeps this browser's data, of the kind asked, without a lock", async () => {
    expect(await keepBrowserData({ db, key, backups }, { kind: 'before-load' })).toBe(true);

    const [name] = backups.files.keys();
    expect(backupKind(name)).toBe('before-load');
    expect(readEnvelopeHeader(only())).toMatchObject({ lock: null });
    const body = JSON.parse(new TextDecoder().decode((await openEnvelope(only(), key)).plain));
    expect(body.data.labResults[0].labName).toBe('Quest Diagnostics');
  });

  it('keeps nothing when the data changed since the digest it was given', async () => {
    const digest = await digestFolderData(folderDataJson(DATA));

    expect(await keepBrowserData({ db, key, backups }, { kind: 'before-load', unchangedSince: digest })).toBe(true);
    expect(await keepBrowserData({ db, key, backups }, { kind: 'before-load', unchangedSince: 'other' })).toBe(false);
    expect(backups.files.size).toBe(1);
  });

  it('rejects when the backup cannot be saved', async () => {
    backups.failSaves = true;

    await expect(keepBrowserData({ db, key, backups }, { kind: 'conflict' })).rejects.toThrow('Disk full');
  });

  it('keeps a folder copy as a conflict backup, its content unchanged, without its lock', async () => {
    const { bytes, revision } = await sealFolderCopy(DATA, key, LOCK);

    await keepFolderCopy({ key, backups }, bytes);

    const [name] = backups.files.keys();
    expect(backupKind(name)).toBe('conflict');
    expect(readEnvelopeHeader(only())).toMatchObject({ lock: null });
    expect(new TextDecoder().decode(only())).not.toContain(LOCK.wrappedKey);
    expect(JSON.parse(new TextDecoder().decode((await openEnvelope(only(), key)).plain)).revision).toBe(revision);
  });

  it('keeps the copy now in the folder, and nothing when there is none', async () => {
    const { bytes } = await sealFolderCopy(DATA, key, LOCK);

    expect(await keepCurrentFolderCopy({ key, backups, folder: { loadCurrent: async () => null } })).toBeNull();
    expect(backups.files.size).toBe(0);
    expect(await keepCurrentFolderCopy({ key, backups, folder: { loadCurrent: async () => bytes } })).toBe(bytes);
    expect(readEnvelopeHeader(only())).toMatchObject({ lock: null });
  });
});
