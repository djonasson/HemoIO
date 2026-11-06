import { describe, it, expect, beforeEach, vi } from 'vitest';
import { decrypt, encrypt } from '@data/encryption';
import {
  FOLDER_SYNC_FILE_VERSION,
  writeFolderCopy,
  type FolderCopyStore,
  type FolderSyncData,
} from './folderSync';

const newKey = (): Promise<CryptoKey> =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);

/** A folder holding the copy and the previous copy, as the storage provider keeps them */
class MemoryStore implements FolderCopyStore {
  copy: ArrayBuffer | null = null;
  previous: ArrayBuffer | null = null;
  saves = 0;

  async loadCurrent(): Promise<ArrayBuffer | null> {
    return this.copy;
  }

  async loadPrevious(): Promise<ArrayBuffer | null> {
    return this.previous;
  }

  async save(data: ArrayBuffer, previous?: ArrayBuffer): Promise<void> {
    if (previous) this.previous = previous;
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

const result = (id: number) => ({
  id,
  date: new Date('2024-01-15T10:00:00.000Z'),
  labName: 'Quest Diagnostics',
  createdAt: new Date('2024-01-15T10:00:00.000Z'),
  updatedAt: new Date('2024-01-15T10:00:00.000Z'),
});

/** Data holding `count` lab results */
const withResults = (count = 1): FolderSyncData => ({
  ...empty(),
  labResults: Array.from({ length: count }, (_, i) => result(i + 1)),
});

const sealed = async (file: unknown, key: CryptoKey): Promise<ArrayBuffer> =>
  encrypt(new TextEncoder().encode(JSON.stringify(file)).buffer as ArrayBuffer, key);

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
    // The backup schema's version, so a restore accepts it
    expect(copy.version).toBe(4);
    expect(copy.data.labResults).toHaveLength(1);
    expect(typeof copy.exportedAt).toBe('string');
  });

  it('unsaved set-aside records protect the folder copy without reading it', async () => {
    await writeFolderCopy(store, withResults(), key);
    const before = store.copy;
    const loadCurrent = vi.spyOn(store, 'loadCurrent');

    const outcome = await writeFolderCopy(store, withResults(2), key, { setAsideUnsaved: 2 });

    expect(outcome).toEqual({ status: 'protected', reason: 'set-aside' });
    expect(loadCurrent).not.toHaveBeenCalled();
    expect(store.copy).toBe(before);
    expect(store.saves).toBe(1);
  });

  it('writes again once no set-aside record is unsaved', async () => {
    expect(await writeFolderCopy(store, withResults(), key, { setAsideUnsaved: 0 })).toEqual({
      status: 'written',
    });
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

    expect(await writeFolderCopy(store, withResults(2), key)).toEqual({ status: 'written' });
    expect((await readCopy(store, key)).data.labResults).toHaveLength(2);
  });

  it('does not write when nothing changed, so the previous copy is kept', async () => {
    await writeFolderCopy(store, withResults(), key);

    expect(await writeFolderCopy(store, withResults(), key)).toEqual({ status: 'unchanged' });
    expect(store.saves).toBe(1);
  });

  it('never replaces a copy saved before tests were identified by LOINC', async () => {
    store.copy = await sealed({ version: 3, exportedAt: '2024-01-01', data: withResults() }, key);
    const before = store.copy;

    expect(await writeFolderCopy(store, withResults(2), key)).toEqual({
      status: 'protected',
      reason: 'before-loinc',
    });
    expect(store.copy).toBe(before);
    expect(store.saves).toBe(0);
  });

  it('never replaces a pre-LOINC copy, even one without health data', async () => {
    store.copy = await sealed({ version: 1, exportedAt: '2024-01-01', data: empty() }, key);

    expect(await writeFolderCopy(store, withResults(), key)).toEqual({
      status: 'protected',
      reason: 'before-loinc',
    });
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

  it('never replaces a copy saved by a newer version of HemoIO', async () => {
    const newer = { version: FOLDER_SYNC_FILE_VERSION + 1, exportedAt: '2030-01-01', data: withResults() };
    store.copy = await sealed(newer, key);
    const before = store.copy;

    expect(await writeFolderCopy(store, withResults(2), key)).toEqual({
      status: 'protected',
      reason: 'newer',
    });
    expect(store.copy).toBe(before);
  });

  it('reports a newer copy as newer even when its data is laid out differently', async () => {
    store.copy = await sealed(
      { version: FOLDER_SYNC_FILE_VERSION + 1, exportedAt: '2030-01-01', records: { all: [] } },
      key
    );

    expect(await writeFolderCopy(store, withResults(), key)).toEqual({
      status: 'protected',
      reason: 'newer',
    });
  });

  describe('the previous copy', () => {
    it('is not kept when the folder held no copy', async () => {
      await writeFolderCopy(store, withResults(), key);

      expect(store.previous).toBeNull();
    });

    it('is the copy a write replaced', async () => {
      await writeFolderCopy(store, withResults(1), key);
      const replaced = store.copy;

      await writeFolderCopy(store, withResults(2), key);

      expect(store.previous).toBe(replaced);
    });

    it('moves on as the data grows', async () => {
      await writeFolderCopy(store, withResults(1), key);
      await writeFolderCopy(store, withResults(2), key);
      const replaced = store.copy;

      await writeFolderCopy(store, withResults(3), key);

      expect(store.previous).toBe(replaced);
    });

    it('is not pushed out by a copy holding less', async () => {
      // A full history, then a browser that lost it writes one new result, then another
      await writeFolderCopy(store, withResults(5), key);
      await writeFolderCopy(store, withResults(6), key);
      const full = store.copy;
      await writeFolderCopy(store, withResults(1), key);

      await writeFolderCopy(store, withResults(2), key);

      expect(store.previous).toBe(full);
    });

    it('is not pushed out by a copy without health data', async () => {
      await writeFolderCopy(store, { ...empty(), preferences: { id: 1 } } as FolderSyncData, key);
      store.previous = await sealed({ version: 2, exportedAt: 'x', data: withResults() }, key);
      const previous = store.previous;

      await writeFolderCopy(store, withResults(), key);

      expect(store.previous).toBe(previous);
    });

    it('is replaced when it cannot be read: it is no copy to undo to', async () => {
      await writeFolderCopy(store, withResults(1), key);
      const replaced = store.copy;
      store.previous = await sealed({ version: 2, exportedAt: 'x', data: withResults() }, await newKey());

      await writeFolderCopy(store, withResults(2), key);

      expect(store.previous).toBe(replaced);
    });

    it('moves on after a cleanup that keeps at least half of the records', async () => {
      await writeFolderCopy(store, withResults(10), key);
      await writeFolderCopy(store, withResults(8), key);
      const cleaned = store.copy;

      await writeFolderCopy(store, withResults(9), key);

      expect(store.previous).toBe(cleaned);
    });
  });

  it('writes over an empty file', async () => {
    store.copy = new ArrayBuffer(0);

    expect(await writeFolderCopy(store, empty(), key)).toEqual({ status: 'written' });
  });
});
