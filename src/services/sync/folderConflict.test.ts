import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { encrypt } from '@data/encryption';
import { createCredentialsV2, type StoredCredentialsV2 } from '@data/encryption/keyWrapping';
import { backupFileName, backupKind, type FolderBackupStore } from './folderBackups';
import {
  backupOfFolderFile,
  canKeepFolderCopy,
  keepBrowserData,
  keepCurrentFolderCopy,
  keepFolderCopy,
  keepFolderFilesBeforeReplace,
} from './folderConflict';
import { isDamagedCopy, openDamagedCopy, openEnvelope, readEnvelopeHeader, sealEnvelope } from './folderEnvelope';
import { digestFolderData, folderCopyId, folderDataJson, sealFolderCopy, type FolderSyncData } from './folderSync';

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

  it('does not prune a protected backup when keeping the current copy', async () => {
    const { bytes } = await sealFolderCopy(DATA, key, LOCK);
    for (let minute = 1; minute <= 10; minute++) {
      backups.files.set(backupFileName(new Date(Date.UTC(2020, 0, 1, 9, minute))), new ArrayBuffer(1));
    }
    const oldest = backupFileName(new Date(Date.UTC(2020, 0, 1, 9, 1)));

    await keepCurrentFolderCopy({ key, backups, folder: { loadCurrent: async () => bytes }, protect: [oldest] });

    expect(backups.files.has(oldest)).toBe(true);
  });

  it('can keep the current copy only when there is one that the key opens', async () => {
    const { bytes } = await sealFolderCopy(DATA, key, LOCK);
    const otherKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const foreign = (await sealFolderCopy(DATA, otherKey, null)).bytes;

    expect(await canKeepFolderCopy({ key, folder: { loadCurrent: async () => bytes } })).toBe(true);
    expect(await canKeepFolderCopy({ key, folder: { loadCurrent: async () => null } })).toBe(false);
    expect(await canKeepFolderCopy({ key, folder: { loadCurrent: async () => foreign } })).toBe(false);
    expect(await canKeepFolderCopy({ key, folder: { loadCurrent: async () => new ArrayBuffer(8) } })).toBe(false);
    await expect(
      canKeepFolderCopy({ key, folder: { loadCurrent: async () => Promise.reject(new Error('gone')) } })
    ).rejects.toThrow();
  });
  describe('a folder file kept as a backup', () => {
    const text = (bytes: ArrayBuffer): string => new TextDecoder().decode(bytes);

    it('seals one the key opens again without its lock', async () => {
      const plain = JSON.stringify({ version: 3, exportedAt: '2024-01-01', data: DATA });
      const bytes = await sealEnvelope(new TextEncoder().encode(plain), key, LOCK);

      const kept = await backupOfFolderFile(bytes, key);

      expect(readEnvelopeHeader(kept)).toMatchObject({ lock: null });
      expect(text(kept)).not.toContain(LOCK.wrappedKey);
      expect(text((await openEnvelope(kept, key)).plain)).toBe(plain);
    });

    it('keeps a legacy file under another key as it lay, so its own setup can still restore it', async () => {
      const otherKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const legacy = await encrypt(new TextEncoder().encode('{"version":4}').buffer as ArrayBuffer, otherKey);

      expect(new Uint8Array(await backupOfFolderFile(legacy, key))).toEqual(new Uint8Array(legacy));
    });

    it('seals an envelope under another key whole under this key, its lock nowhere in plain text', async () => {
      const otherKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const foreign = (await sealFolderCopy(DATA, otherKey, LOCK)).bytes;

      const kept = await backupOfFolderFile(foreign, key);

      expect(isDamagedCopy(kept)).toBe(true);
      expect(text(kept)).not.toContain(LOCK.wrappedKey);
      expect(new Uint8Array(await openDamagedCopy(kept, key))).toEqual(new Uint8Array(foreign));
    });

    it('seals a file with a damaged header whole under this key', async () => {
      const damaged = new TextEncoder().encode('{"format":"hemoio-folder-copy","version":1}').buffer as ArrayBuffer;

      const kept = await backupOfFolderFile(damaged, key);

      expect(isDamagedCopy(kept)).toBe(true);
      expect(text(await openDamagedCopy(kept, key))).toBe('{"format":"hemoio-folder-copy","version":1}');
    });
  });

  describe('the folder files kept before a copy that cannot be read is replaced', () => {
    let otherKey: CryptoKey;
    let unreadable: ArrayBuffer;

    beforeEach(async () => {
      otherKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      // A legacy copy under another key: it cannot be read, and holds no lock
      unreadable = await encrypt(new TextEncoder().encode('{"version":4}').buffer as ArrayBuffer, otherKey);
    });

    const folderOf = (current: ArrayBuffer | null, previous: ArrayBuffer | null = null) => ({
      loadCurrent: async () => current,
      loadPrevious: async () => previous,
    });
    const keep = async (current: ArrayBuffer | null, previous: ArrayBuffer | null = null, fileId?: string) =>
      keepFolderFilesBeforeReplace({
        key,
        ownLock: LOCK,
        backups,
        folder: folderOf(current, previous),
        fileId: fileId ?? (await folderCopyId(current ?? new ArrayBuffer(0), null)),
      });

    it('keeps the file, and the previous copy beside it, as conflict backups', async () => {
      const previous = (await sealFolderCopy(DATA, key, LOCK)).bytes;

      expect(await keep(unreadable, previous)).toBe(true);

      const kept = [...backups.files.entries()];
      expect(kept).toHaveLength(2);
      expect(kept.every(([name]) => backupKind(name) === 'conflict')).toBe(true);
      const bodies = kept.map(([, bytes]) => new Uint8Array(bytes));
      expect(bodies).toContainEqual(new Uint8Array(unreadable));
      const resealed = kept.find(([, bytes]) => readEnvelopeHeader(bytes) !== null)![1];
      expect(readEnvelopeHeader(resealed)).toMatchObject({ lock: null });
      expect(new TextDecoder().decode(resealed)).not.toContain(LOCK.wrappedKey);
    });

    it('keeps a previous copy under another key sealed whole, its lock nowhere in plain text', async () => {
      const previous = (await sealFolderCopy(DATA, otherKey, LOCK)).bytes;

      await keep(unreadable, previous);

      const damaged = [...backups.files.values()].filter(isDamagedCopy);
      expect(damaged).toHaveLength(1);
      expect(new Uint8Array(await openDamagedCopy(damaged[0], key))).toEqual(new Uint8Array(previous));
    });

    it('lets neither backup prune the other', async () => {
      for (let minute = 1; minute <= 10; minute++) {
        backups.files.set(backupFileName(new Date(Date.UTC(2020, 0, 1, 9, minute))), new ArrayBuffer(1));
      }

      await keep(unreadable, (await sealFolderCopy(DATA, key, LOCK)).bytes);

      expect(backups.files.size).toBe(10);
      expect([...backups.files.values()].map((bytes) => new Uint8Array(bytes))).toContainEqual(
        new Uint8Array(unreadable)
      );
      expect([...backups.files.values()].filter((bytes) => readEnvelopeHeader(bytes) !== null)).toHaveLength(1);
    });

    it('keeps nothing when the file is no longer the one the user was asked about', async () => {
      expect(await keep(unreadable, null, 'sha256:another')).toBe(false);
      expect(backups.files.size).toBe(0);
    });

    it('keeps nothing for a copy the sync would not replace', async () => {
      const otherLock = (await createCredentialsV2('Another1!', 1000)).credentials;
      const anotherSetup = (await sealFolderCopy(DATA, otherKey, otherLock)).bytes;
      const readable = (await sealFolderCopy(DATA, key, LOCK)).bytes;

      expect(await keep(anotherSetup)).toBe(false);
      expect(await keep(readable)).toBe(false);
      expect(await keep(null)).toBe(false);
      expect(backups.files.size).toBe(0);
    });

    it('rejects when a backup cannot be saved', async () => {
      backups.failSaves = true;

      await expect(keep(unreadable)).rejects.toThrow('Disk full');
    });
  });
});
