import { describe, it, expect, vi } from 'vitest';
import { readEnvelopeHeader, openEnvelope, sealEnvelope } from './folderEnvelope';
import {
  MAX_FOLDER_BACKUPS,
  backupDate,
  backupFileName,
  backupKind,
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
    const names = times.map((date) => backupFileName(date));

    expect([...names].sort()).toEqual(
      [...times].sort((a, b) => a.getTime() - b.getTime()).map((date) => backupFileName(date))
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

    const name = await keepFolderBackup(store, bytes(7), { kind: 'conflict', at: at(15) });

    expect(name).toBe('hemoio-backup-20261106T101500123Z.encrypted');
    expect(new Uint8Array(store.files.get(name)!)).toEqual(new Uint8Array([7]));
  });

  it('keeps the 10 newest', async () => {
    expect(MAX_FOLDER_BACKUPS).toBe(10);
    const store = new MemoryBackups();
    store.files.set('notes.txt', bytes(0));
    for (let minute = 0; minute < 11; minute++) {
      await keepFolderBackup(store, bytes(minute), { kind: 'conflict', at: at(minute) });
    }

    const names = (await store.listBackups()).filter((name) => backupDate(name) !== null);
    expect(names).toHaveLength(10);
    expect(names).not.toContain(backupFileName(at(0)));
    expect(names).toContain(backupFileName(at(10)));
    // Other files in the folder are not backups, and are left alone
    expect(store.files.has('notes.txt')).toBe(true);
  });

  it('never deletes the backup just saved, even one dated before the others (a clock behind)', async () => {
    const store = new MemoryBackups();
    for (let minute = 1; minute <= 10; minute++) {
      await keepFolderBackup(store, bytes(minute), { kind: 'conflict', at: at(minute) });
    }

    const name = await keepFolderBackup(store, bytes(0), { kind: 'conflict', at: at(0) });

    expect(store.files.size).toBe(10);
    expect(store.files.has(name)).toBe(true);
    // The oldest of the others makes room
    expect(store.files.has(backupFileName(at(1)))).toBe(false);
  });

  it('never deletes a protected backup, even the oldest of the kind', async () => {
    const store = new MemoryBackups();
    for (let minute = 1; minute <= 10; minute++) {
      await keepFolderBackup(store, bytes(minute), { kind: 'conflict', at: at(minute) });
    }
    const protectedName = backupFileName(at(1));

    await keepFolderBackup(store, bytes(11), { kind: 'conflict', at: at(11), protect: [protectedName] });

    expect(store.files.has(protectedName)).toBe(true);
    expect(store.files.has(backupFileName(at(11)))).toBe(true);
    // Up to 11 for now: the next save prunes down once nothing is protected
    expect(store.files.size).toBe(11);
  });

  it('names each kind apart, and reads both back', () => {
    const date = new Date('2026-11-06T10:15:00.123Z');

    expect(backupFileName(date, 'before-load')).toBe('hemoio-autobackup-20261106T101500123Z.encrypted');
    expect(backupKind(backupFileName(date))).toBe('conflict');
    expect(backupKind(backupFileName(date, 'before-load'))).toBe('before-load');
    expect(backupDate(backupFileName(date, 'before-load'))).toEqual(date);
    expect(backupKind('hemoio-data.encrypted')).toBeNull();
  });

  it('each kind keeps its own 10 newest', async () => {
    const store = new MemoryBackups();
    for (let minute = 0; minute < 10; minute++) {
      await keepFolderBackup(store, bytes(minute), { kind: 'conflict', at: at(minute) });
    }
    // Routine loads, later than every conflict backup, push none of them out
    for (let minute = 20; minute < 32; minute++) {
      await keepFolderBackup(store, bytes(minute), { kind: 'before-load', at: at(minute) });
    }

    const names = [...store.files.keys()];
    expect(names.filter((name) => backupKind(name) === 'conflict')).toHaveLength(10);
    expect(names.filter((name) => backupKind(name) === 'before-load')).toHaveLength(10);
    expect(store.files.has(backupFileName(at(20), 'before-load'))).toBe(false);
  });

  it('never overwrites a backup made the same millisecond', async () => {
    const store = new MemoryBackups();

    const first = await keepFolderBackup(store, bytes(1), { kind: 'conflict', at: at(5) });
    const second = await keepFolderBackup(store, bytes(2), { kind: 'conflict', at: at(5) });

    expect(second).not.toBe(first);
    expect(store.files.size).toBe(2);
    expect(backupDate(second)!.getTime()).toBeGreaterThan(backupDate(first)!.getTime());
  });

  it('a failed save deletes nothing', async () => {
    const store = new MemoryBackups();
    for (let minute = 0; minute < 10; minute++) {
      await keepFolderBackup(store, bytes(minute), { kind: 'conflict', at: at(minute) });
    }
    const before = [...store.files.keys()];
    store.failSaves = true;
    const deleteBackup = vi.spyOn(store, 'deleteBackup');

    await expect(keepFolderBackup(store, bytes(11), { kind: 'conflict', at: at(11) })).rejects.toThrow('Disk full');

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
