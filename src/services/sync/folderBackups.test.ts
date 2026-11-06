import { describe, it, expect, vi } from 'vitest';
import { readEnvelopeHeader, openEnvelope, sealEnvelope } from './folderEnvelope';
import {
  MAX_FOLDER_BACKUPS,
  backupDate,
  backupFileName,
  keepFolderBackup,
  sealedForBackup,
  type FolderBackupStore,
} from './folderBackups';
import { createCredentialsV2 } from '@data/encryption/keyWrapping';

/** The folder's backups, as the storage provider keeps them */
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
    const bytes = this.files.get(name);
    if (!bytes) throw new Error('No such backup');
    return bytes;
  }

  async deleteBackup(name: string): Promise<void> {
    this.files.delete(name);
  }
}

const bytes = (value: number): ArrayBuffer => new Uint8Array([value]).buffer;
const at = (minute: number): Date => new Date(Date.UTC(2026, 10, 6, 10, minute, 0, 123));

describe('folder backups', () => {
  it('names a backup by its time, in UTC to the millisecond', () => {
    expect(backupFileName(new Date('2026-11-06T10:15:00.123Z'))).toBe(
      'hemoio-backup-20261106T101500123Z.encrypted'
    );
  });

  it('names sort by time', () => {
    const times = [
      '2026-11-06T10:15:00.123Z',
      '2025-01-31T23:59:59.999Z',
      '2026-11-06T10:15:00.124Z',
      '2026-02-01T00:00:00.000Z',
    ].map((iso) => new Date(iso));
    const names = times.map(backupFileName);

    expect([...names].sort()).toEqual(
      [...times].sort((a, b) => a.getTime() - b.getTime()).map(backupFileName)
    );
  });

  it('backupDate reads the name back', () => {
    const date = new Date('2026-11-06T10:15:00.123Z');

    expect(backupDate(backupFileName(date))).toEqual(date);
    expect(backupDate('hemoio-data.encrypted')).toBeNull();
    expect(backupDate('hemoio-backup-20261306T101500123Z.encrypted')).toBeNull();
    expect(backupDate('hemoio-backup-20261106T101500123Z.encrypted.tmp')).toBeNull();
  });

  it('keeps a backup under its dated name', async () => {
    const store = new MemoryBackups();

    const name = await keepFolderBackup(store, bytes(7), at(15));

    expect(name).toBe('hemoio-backup-20261106T101500123Z.encrypted');
    expect(new Uint8Array(store.files.get(name)!)).toEqual(new Uint8Array([7]));
  });

  it('keeps the 10 newest', async () => {
    expect(MAX_FOLDER_BACKUPS).toBe(10);
    const store = new MemoryBackups();
    store.files.set('notes.txt', bytes(0));
    for (let minute = 0; minute < 11; minute++) {
      await keepFolderBackup(store, bytes(minute), at(minute));
    }

    const names = (await store.listBackups()).filter((name) => backupDate(name) !== null);
    expect(names).toHaveLength(10);
    expect(names).not.toContain(backupFileName(at(0)));
    expect(names).toContain(backupFileName(at(10)));
    // Other files in the folder are not backups, and are left alone
    expect(store.files.has('notes.txt')).toBe(true);
  });

  it('keeps an older backup saved after newer ones only when it is among the newest', async () => {
    const store = new MemoryBackups();
    for (let minute = 1; minute <= 10; minute++) {
      await keepFolderBackup(store, bytes(minute), at(minute));
    }

    await keepFolderBackup(store, bytes(0), at(0));

    expect(store.files.size).toBe(10);
    expect(store.files.has(backupFileName(at(0)))).toBe(false);
  });

  it('never overwrites a backup made the same millisecond', async () => {
    const store = new MemoryBackups();

    const first = await keepFolderBackup(store, bytes(1), at(5));
    const second = await keepFolderBackup(store, bytes(2), at(5));

    expect(second).not.toBe(first);
    expect(store.files.size).toBe(2);
    expect(backupDate(second)!.getTime()).toBeGreaterThan(backupDate(first)!.getTime());
  });

  it('a failed save deletes nothing', async () => {
    const store = new MemoryBackups();
    for (let minute = 0; minute < 10; minute++) {
      await keepFolderBackup(store, bytes(minute), at(minute));
    }
    const before = [...store.files.keys()];
    store.failSaves = true;
    const deleteBackup = vi.spyOn(store, 'deleteBackup');

    await expect(keepFolderBackup(store, bytes(11), at(11))).rejects.toThrow('Disk full');

    expect(deleteBackup).not.toHaveBeenCalled();
    expect([...store.files.keys()]).toEqual(before);
  });

  it('a folder copy kept as a backup is sealed again without its lock, with the same content', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const lock = (await createCredentialsV2('Passw0rd!', 1000)).credentials;
    const plain = new TextEncoder().encode('{"version":4,"revision":"r1","data":{}}');
    const folderBytes = await sealEnvelope(plain, key, lock);

    const backup = await sealedForBackup(folderBytes, key);

    expect(readEnvelopeHeader(backup)).toMatchObject({ lock: null });
    expect(new TextDecoder().decode(backup)).not.toContain(lock.wrappedKey);
    expect(new TextDecoder().decode((await openEnvelope(backup, key)).plain)).toBe(
      new TextDecoder().decode(plain)
    );
  });
});
