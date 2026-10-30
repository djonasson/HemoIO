import { describe, it, expect, beforeEach } from 'vitest';
import { decrypt, encrypt } from '@data/encryption';
import {
  FOLDER_SYNC_FILE_VERSION,
  writeFolderCopy,
  type FolderSyncData,
} from './folderSync';
import type { StorageProvider } from '@/types';

const newKey = (): Promise<CryptoKey> =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);

/** A folder holding at most one copy, as the storage provider keeps it */
class MemoryStore implements StorageProvider {
  copy: ArrayBuffer | null = null;
  saves = 0;

  async exists(): Promise<boolean> {
    return this.copy !== null;
  }

  async load(): Promise<ArrayBuffer> {
    if (!this.copy) throw new Error('No backup data found');
    return this.copy;
  }

  async save(data: ArrayBuffer): Promise<void> {
    this.copy = data;
    this.saves++;
  }
}

const empty = (): FolderSyncData => ({
  labResults: [],
  testValues: [],
  userNotes: [],
  settings: undefined,
  preferences: undefined,
});

const withResults = (): FolderSyncData => ({
  ...empty(),
  labResults: [
    {
      id: 1,
      date: new Date('2024-01-15T10:00:00.000Z'),
      labName: 'Quest Diagnostics',
      createdAt: new Date('2024-01-15T10:00:00.000Z'),
      updatedAt: new Date('2024-01-15T10:00:00.000Z'),
    },
  ],
});

async function readCopy(store: MemoryStore, key: CryptoKey) {
  const plain = await decrypt(store.copy!, key);
  return JSON.parse(new TextDecoder().decode(plain));
}

describe('writeFolderCopy', () => {
  let key: CryptoKey;
  let store: MemoryStore;

  beforeEach(async () => {
    key = await newKey();
    store = new MemoryStore();
  });

  it('writes an encrypted copy, in the current format, when the folder holds none', async () => {
    const outcome = await writeFolderCopy(store, withResults(), key);

    expect(outcome).toEqual({ status: 'written' });
    const copy = await readCopy(store, key);
    expect(copy.version).toBe(FOLDER_SYNC_FILE_VERSION);
    expect(copy.version).toBe(2);
    expect(copy.data.labResults).toHaveLength(1);
    expect(typeof copy.exportedAt).toBe('string');
  });

  it('writes nothing readable without the key', async () => {
    await writeFolderCopy(store, withResults(), key);

    expect(new TextDecoder().decode(store.copy!)).not.toContain('Quest Diagnostics');
  });

  it('writes an empty state to a folder that holds no copy yet', async () => {
    expect(await writeFolderCopy(store, empty(), key)).toEqual({ status: 'written' });
  });

  it('never replaces a copy holding lab results with one that has none', async () => {
    await writeFolderCopy(store, withResults(), key);
    const before = store.copy;

    const outcome = await writeFolderCopy(store, empty(), key);

    expect(outcome).toEqual({ status: 'protected', reason: 'empty' });
    expect(store.copy).toBe(before);
  });

  it.each([
    ['test values', { testValues: [{ id: 1 }] }],
    ['notes', { userNotes: [{ id: 1 }] }],
  ])('counts a copy holding only %s as holding data', async (_label, records) => {
    await writeFolderCopy(store, { ...empty(), ...records } as FolderSyncData, key);

    expect(await writeFolderCopy(store, empty(), key)).toEqual({
      status: 'protected',
      reason: 'empty',
    });
  });

  it('does not count settings and preferences alone as data', async () => {
    const preferencesOnly = { ...empty(), preferences: { id: 1 } } as FolderSyncData;
    await writeFolderCopy(store, preferencesOnly, key);

    expect(await writeFolderCopy(store, empty(), key)).toEqual({ status: 'written' });
  });

  it('replaces a copy with lab results by one that also has lab results', async () => {
    await writeFolderCopy(store, withResults(), key);
    const more = withResults();
    more.labResults.push({ ...more.labResults[0], id: 2 });

    expect(await writeFolderCopy(store, more, key)).toEqual({ status: 'written' });
    expect((await readCopy(store, key)).data.labResults).toHaveLength(2);
  });

  it('does not write when nothing changed, so the previous copy is kept', async () => {
    await writeFolderCopy(store, withResults(), key);

    expect(await writeFolderCopy(store, withResults(), key)).toEqual({ status: 'unchanged' });
    expect(store.saves).toBe(1);
  });

  it('rewrites a copy in an older format even when the data is the same', async () => {
    const old = JSON.stringify({ version: 1, exportedAt: '2024-01-01', data: withResults() });
    store.copy = await encrypt(new TextEncoder().encode(old).buffer as ArrayBuffer, key);

    expect(await writeFolderCopy(store, withResults(), key)).toEqual({ status: 'written' });
  });

  it('never replaces a copy the key cannot open', async () => {
    await writeFolderCopy(store, withResults(), await newKey());
    const foreign = store.copy;

    const outcome = await writeFolderCopy(store, withResults(), key);

    expect(outcome).toEqual({ status: 'protected', reason: 'unreadable' });
    expect(store.copy).toBe(foreign);
  });

  it('never replaces a copy that is not a sync file', async () => {
    store.copy = await encrypt(new TextEncoder().encode('not json').buffer as ArrayBuffer, key);

    expect(await writeFolderCopy(store, withResults(), key)).toEqual({
      status: 'protected',
      reason: 'unreadable',
    });
  });

  it('writes over an empty file', async () => {
    store.copy = new ArrayBuffer(0);

    expect(await writeFolderCopy(store, empty(), key)).toEqual({ status: 'written' });
  });
});
