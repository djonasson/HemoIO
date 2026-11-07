import { describe, it, expect, vi } from 'vitest';
import { createCredentialsV2 } from '@data/encryption/keyWrapping';
import { FOLDER_LOCK_FORMAT, keepLockFile, readLockFile, saveLockFile, type FolderLockStore } from './folderLockFile';

const encode = (value: unknown): ArrayBuffer =>
  new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).buffer as ArrayBuffer;

/** A folder holding the lock file's bytes, or none */
function folderWith(initial: ArrayBuffer | null) {
  let bytes = initial;
  const store = {
    loadLock: vi.fn(async () => bytes),
    saveLock: vi.fn(async (next: ArrayBuffer) => {
      bytes = next;
    }),
  } satisfies FolderLockStore;
  return { store, read: () => bytes };
}

describe('folder lock file', () => {
  it('keeps the lock, which reads back as it was', async () => {
    const { credentials } = await createCredentialsV2('Passw0rd!', 1000);
    const { store, read } = folderWith(null);

    await keepLockFile(store, credentials);

    expect(readLockFile(read())).toEqual(credentials);
    expect(JSON.parse(new TextDecoder().decode(read()!))).toEqual({
      format: FOLDER_LOCK_FORMAT,
      version: 1,
      lock: credentials,
    });
  });

  it('writes only the lock fields HemoIO knows', async () => {
    const { credentials } = await createCredentialsV2('Passw0rd!', 1000);
    const { store, read } = folderWith(null);

    await keepLockFile(store, { ...credentials, extra: 'dropped' } as typeof credentials);

    expect(JSON.parse(new TextDecoder().decode(read()!)).lock).toEqual(credentials);
  });

  it('leaves a lock file that already holds the lock untouched', async () => {
    const { credentials } = await createCredentialsV2('Passw0rd!', 1000);
    const { store } = folderWith(null);
    await keepLockFile(store, credentials);
    store.saveLock.mockClear();

    await keepLockFile(store, credentials);

    expect(store.saveLock).not.toHaveBeenCalled();
  });

  it('replaces the lock it holds with the current one: only one lock is ever kept', async () => {
    const old = await createCredentialsV2('Old-Passw0rd!', 1000);
    const next = await createCredentialsV2('New-Passw0rd!', 1000);
    const { store, read } = folderWith(null);
    await keepLockFile(store, old.credentials);

    await keepLockFile(store, next.credentials);

    expect(readLockFile(read())).toEqual(next.credentials);
  });

  it('never puts back an older lock over a later one another computer wrote', async () => {
    const older = await createCredentialsV2('Old-Passw0rd!', 1000);
    const later = await createCredentialsV2('New-Passw0rd!', 1000);
    const olderLock = { ...older.credentials, changedAt: '2026-11-05T09:00:00.000Z' };
    const laterLock = { ...later.credentials, changedAt: '2026-11-06T09:00:00.000Z' };
    const { store, read } = folderWith(null);
    await keepLockFile(store, laterLock);
    store.saveLock.mockClear();

    await keepLockFile(store, olderLock);
    // A lock from before changes were dated counts as the oldest
    await keepLockFile(store, { ...older.credentials, changedAt: undefined });

    expect(store.saveLock).not.toHaveBeenCalled();
    expect(readLockFile(read())).toEqual(laterLock);
  });

  it('saving writes the lock over whatever the file holds, a later lock too', async () => {
    const older = await createCredentialsV2('Old-Passw0rd!', 1000);
    const later = await createCredentialsV2('New-Passw0rd!', 1000);
    const olderLock = { ...older.credentials, changedAt: '2026-11-05T09:00:00.000Z' };
    const { store, read } = folderWith(null);
    await keepLockFile(store, { ...later.credentials, changedAt: '2026-11-06T09:00:00.000Z' });

    await saveLockFile(store, olderLock);

    expect(readLockFile(read())).toEqual(olderLock);
  });

  it('writes the lock when the file cannot be read, and rejects when it cannot be written', async () => {
    const { credentials } = await createCredentialsV2('Passw0rd!', 1000);
    const { store, read } = folderWith(null);
    store.loadLock.mockRejectedValueOnce(new Error('busy'));

    await keepLockFile(store, credentials);
    expect(readLockFile(read())).toEqual(credentials);

    store.loadLock.mockResolvedValueOnce(null);
    store.saveLock.mockRejectedValueOnce(new Error('read-only'));
    await expect(keepLockFile(store, credentials)).rejects.toThrow();
  });

  it('reads anything but a valid lock file as no lock', async () => {
    const { credentials } = await createCredentialsV2('Passw0rd!', 1000);

    expect(readLockFile(null)).toBeNull();
    expect(readLockFile(encode('not json'))).toBeNull();
    expect(readLockFile(encode(null))).toBeNull();
    expect(readLockFile(encode({ format: 'other', version: 1, lock: credentials }))).toBeNull();
    expect(readLockFile(encode({ format: FOLDER_LOCK_FORMAT, version: 2, lock: credentials }))).toBeNull();
    expect(readLockFile(encode({ format: FOLDER_LOCK_FORMAT, version: 1, lock: { version: 1 } }))).toBeNull();
    // A planted lock that would keep unlocking busy is refused, as everywhere
    expect(
      readLockFile(encode({ format: FOLDER_LOCK_FORMAT, version: 1, lock: { ...credentials, iterations: 1e10 } }))
    ).toBeNull();
  });
});
