import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { encrypt } from '@data/encryption';
import { createCredentialsV2, type StoredCredentialsV2 } from '@data/encryption/keyWrapping';
import { openEnvelope, readEnvelopeHeader } from './folderEnvelope';
import {
  FOLDER_SYNC_FILE_VERSION,
  writeFolderCopy,
  type FolderCopyStore,
  type FolderSyncData,
  type FolderWriteContext,
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
  const { plain } = await openEnvelope(store.copy!, key);
  return JSON.parse(new TextDecoder().decode(plain));
}

/** A copy's plaintext, the same however it was sealed */
async function plainOf(bytes: ArrayBuffer | null, key: CryptoKey): Promise<string> {
  return new TextDecoder().decode((await openEnvelope(bytes!, key)).plain);
}

/** The lock the folder copy carries in its header */
function folderLockOf(store: MemoryStore): StoredCredentialsV2 | null | undefined {
  const header = readEnvelopeHeader(store.copy!);
  return header && header !== 'damaged' ? header.lock : undefined;
}

let LOCK: StoredCredentialsV2;

beforeAll(async () => {
  LOCK = (await createCredentialsV2('Old-Passw0rd!', 1000)).credentials;
});

const dated = (changedAt: string | undefined): StoredCredentialsV2 => ({ ...LOCK, changedAt });
const EARLIER = '2026-01-01T00:00:00.000Z';
const LATER = '2026-06-01T00:00:00.000Z';

describe('writeFolderCopy', () => {
  let key: CryptoKey;
  let store: MemoryStore;
  let context: FolderWriteContext;

  beforeEach(async () => {
    key = await newKey();
    store = new MemoryStore();
    context = { lock: LOCK, setAsideUnsaved: 0 };
  });

  it('writes an encrypted copy, in the current format, when the folder holds none', async () => {
    const outcome = await writeFolderCopy(store, withResults(), key, context);

    expect(outcome).toMatchObject({ status: 'written' });
    const copy = await readCopy(store, key);
    expect(copy.version).toBe(FOLDER_SYNC_FILE_VERSION);
    // The backup schema's version, so a restore accepts it
    expect(copy.version).toBe(4);
    expect(copy.data.labResults).toHaveLength(1);
    expect(typeof copy.exportedAt).toBe('string');
  });

  it('unsaved set-aside records protect the folder copy without reading it', async () => {
    await writeFolderCopy(store, withResults(), key, context);
    const before = store.copy;
    const loadCurrent = vi.spyOn(store, 'loadCurrent');

    const outcome = await writeFolderCopy(store, withResults(2), key, { ...context, setAsideUnsaved: 2 });

    expect(outcome).toEqual({ status: 'protected', reason: 'set-aside' });
    expect(loadCurrent).not.toHaveBeenCalled();
    expect(store.copy).toBe(before);
    expect(store.saves).toBe(1);
  });

  it('writes again once no set-aside record is unsaved', async () => {
    expect(await writeFolderCopy(store, withResults(), key, { ...context, setAsideUnsaved: 0 })).toMatchObject({
      status: 'written',
    });
  });

  it('writes nothing readable without the key', async () => {
    await writeFolderCopy(store, withResults(), key, context);

    expect(new TextDecoder().decode(store.copy!)).not.toContain('Quest Diagnostics');
  });

  it('writes an empty state to a folder that holds no copy yet', async () => {
    expect(await writeFolderCopy(store, empty(), key, context)).toMatchObject({ status: 'written' });
  });

  it('never replaces a copy holding lab results with one that has none', async () => {
    await writeFolderCopy(store, withResults(), key, context);
    const before = store.copy;

    const outcome = await writeFolderCopy(store, empty(), key, context);

    expect(outcome).toEqual({ status: 'protected', reason: 'empty', folderLock: LOCK });
    expect(store.copy).toBe(before);
  });

  it.each([
    ['test values', { testValues: [{ id: 1 }] }],
    ['notes', { userNotes: [{ id: 1 }] }],
  ])('counts a copy holding only %s as holding data', async (_label, records) => {
    await writeFolderCopy(store, { ...empty(), ...records } as FolderSyncData, key, context);

    expect(await writeFolderCopy(store, empty(), key, context)).toMatchObject({
      status: 'protected',
      reason: 'empty',
    });
  });

  it('does not count settings and preferences alone as data', async () => {
    const preferencesOnly = { ...empty(), preferences: { id: 1 } } as FolderSyncData;
    await writeFolderCopy(store, preferencesOnly, key, context);

    expect(await writeFolderCopy(store, empty(), key, context)).toMatchObject({ status: 'written' });
  });

  it('replaces a copy with lab results by one that also has lab results', async () => {
    await writeFolderCopy(store, withResults(), key, context);

    expect(await writeFolderCopy(store, withResults(2), key, context)).toMatchObject({ status: 'written' });
    expect((await readCopy(store, key)).data.labResults).toHaveLength(2);
  });

  it('does not write when nothing changed, so the previous copy is kept', async () => {
    await writeFolderCopy(store, withResults(), key, context);

    expect(await writeFolderCopy(store, withResults(), key, context)).toMatchObject({ status: 'unchanged' });
    expect(store.saves).toBe(1);
  });

  it('never replaces a copy saved before tests were identified by LOINC', async () => {
    store.copy = await sealed({ version: 3, exportedAt: '2024-01-01', data: withResults() }, key);
    const before = store.copy;

    expect(await writeFolderCopy(store, withResults(2), key, context)).toEqual({
      status: 'protected',
      reason: 'before-loinc',
    });
    expect(store.copy).toBe(before);
    expect(store.saves).toBe(0);
  });

  it('never replaces a pre-LOINC copy, even one without health data', async () => {
    store.copy = await sealed({ version: 1, exportedAt: '2024-01-01', data: empty() }, key);

    expect(await writeFolderCopy(store, withResults(), key, context)).toEqual({
      status: 'protected',
      reason: 'before-loinc',
    });
  });

  it("never replaces another setup's copy, one with a lock the key cannot open", async () => {
    await writeFolderCopy(store, withResults(), await newKey(), context);
    const foreign = store.copy;

    const outcome = await writeFolderCopy(store, withResults(), key, context);

    expect(outcome).toEqual({ status: 'protected', reason: 'another-setup' });
    expect(store.copy).toBe(foreign);
  });

  it('never replaces a legacy copy the key cannot open', async () => {
    store.copy = await sealed({ version: 4, exportedAt: '2024-01-01', data: withResults() }, await newKey());
    const foreign = store.copy;

    const outcome = await writeFolderCopy(store, withResults(), key, context);

    expect(outcome).toEqual({ status: 'protected', reason: 'unreadable' });
    expect(store.copy).toBe(foreign);
  });

  it('never replaces a copy whose header is damaged', async () => {
    store.copy = new TextEncoder().encode('{"format":"hemoio-folder-copy","version":1}').buffer as ArrayBuffer;

    expect(await writeFolderCopy(store, withResults(), key, context)).toEqual({
      status: 'protected',
      reason: 'unreadable',
    });
  });

  describe('the lock beside the copy', () => {
    it('writes the lock beside the data, and a new revision each time', async () => {
      await writeFolderCopy(store, withResults(1), key, context);
      const first = await readCopy(store, key);
      await writeFolderCopy(store, withResults(2), key, context);

      expect(folderLockOf(store)).toEqual(LOCK);
      const second = await readCopy(store, key);
      expect(typeof first.revision).toBe('string');
      expect(second.revision).not.toBe(first.revision);
    });

    it('returns the lock it found in the folder', async () => {
      await writeFolderCopy(store, withResults(1), key, context);

      expect(await writeFolderCopy(store, withResults(2), key, context)).toEqual({
        status: 'written',
        folderLock: LOCK,
      });
    });

    it('a lock edited in the file is never adopted', async () => {
      await writeFolderCopy(store, withResults(), key, context);
      const file = JSON.parse(new TextDecoder().decode(store.copy!));
      const i = Math.floor(file.lock.wrappedKey.length / 2);
      file.lock.wrappedKey =
        file.lock.wrappedKey.slice(0, i) + (file.lock.wrappedKey[i] === 'A' ? 'B' : 'A') + file.lock.wrappedKey.slice(i + 1);
      store.copy = new TextEncoder().encode(JSON.stringify(file)).buffer as ArrayBuffer;
      const edited = store.copy;

      const outcome = await writeFolderCopy(store, withResults(2), key, context);

      expect(outcome).toEqual({ status: 'protected', reason: 'another-setup' });
      expect('folderLock' in outcome).toBe(false);
      expect(store.copy).toBe(edited);
    });

    it('rewrites an unchanged copy when this lock is later', async () => {
      await writeFolderCopy(store, withResults(), key, { ...context, lock: dated(EARLIER) });

      const outcome = await writeFolderCopy(store, withResults(), key, { ...context, lock: dated(LATER) });

      expect(outcome).toEqual({ status: 'written', folderLock: dated(EARLIER) });
      expect(folderLockOf(store)).toEqual(dated(LATER));
    });

    it('rewrites a legacy copy so that it carries the lock', async () => {
      const data = withResults();
      store.copy = await sealed({ version: FOLDER_SYNC_FILE_VERSION, exportedAt: '2024-01-01T00:00:00.000Z', data }, key);

      const outcome = await writeFolderCopy(store, data, key, context);

      expect(outcome).toEqual({ status: 'written', folderLock: null });
      expect(folderLockOf(store)).toEqual(LOCK);
    });

    it('leaves an unchanged copy alone when the folder lock is later, and returns it', async () => {
      await writeFolderCopy(store, withResults(), key, { ...context, lock: dated(LATER) });
      const before = store.copy;

      const outcome = await writeFolderCopy(store, withResults(), key, { ...context, lock: dated(EARLIER) });

      expect(outcome).toEqual({ status: 'unchanged', folderLock: dated(LATER) });
      expect(store.copy).toBe(before);
    });

    it('keeps the later folder lock when it writes new data', async () => {
      await writeFolderCopy(store, withResults(1), key, { ...context, lock: dated(LATER) });

      const outcome = await writeFolderCopy(store, withResults(2), key, { ...context, lock: dated(EARLIER) });

      expect(outcome).toEqual({ status: 'written', folderLock: dated(LATER) });
      expect(folderLockOf(store)).toEqual(dated(LATER));
    });

    it('writes a copy without a lock while this browser has none', async () => {
      await writeFolderCopy(store, withResults(), key, { ...context, lock: null });

      expect(folderLockOf(store)).toBeNull();
      expect(await writeFolderCopy(store, withResults(), key, { ...context, lock: null })).toEqual({
        status: 'unchanged',
        folderLock: null,
      });
    });

    it('a rewrite for the lock alone keeps the previous copy', async () => {
      await writeFolderCopy(store, withResults(1), key, { ...context, lock: dated(EARLIER) });
      await writeFolderCopy(store, withResults(2), key, { ...context, lock: dated(EARLIER) });
      const previous = store.previous;

      await writeFolderCopy(store, withResults(2), key, { ...context, lock: dated(LATER) });

      expect(store.saves).toBe(3);
      expect(store.previous).toBe(previous);
    });

    it('keeps the previous copy in the same format, without a lock', async () => {
      await writeFolderCopy(store, withResults(1), key, context);
      await writeFolderCopy(store, withResults(2), key, context);

      expect(readEnvelopeHeader(store.previous!)).toEqual({
        format: 'hemoio-folder-copy',
        version: 1,
        lock: null,
      });
    });

    it('after a password change and a later data change, the previous copy has no lock and still opens', async () => {
      await writeFolderCopy(store, withResults(1), key, { ...context, lock: dated(EARLIER) });
      // The password change: only the lock is rewritten
      await writeFolderCopy(store, withResults(1), key, { ...context, lock: dated(LATER) });
      const beforeChange = await plainOf(store.copy, key);

      await writeFolderCopy(store, withResults(2), key, { ...context, lock: dated(LATER) });

      expect(folderLockOf(store)).toEqual(dated(LATER));
      const previous = readEnvelopeHeader(store.previous!);
      expect(previous && previous !== 'damaged' && previous.lock).toBeNull();
      // The same data and revision as the copy it was, under the session key
      expect(await plainOf(store.previous, key)).toBe(beforeChange);
      expect(new TextDecoder().decode(store.previous!)).not.toContain(dated(EARLIER).wrappedKey);
    });

    it('a legacy copy moved to the previous copy is sealed in the envelope, without a lock', async () => {
      store.copy = await sealed(
        { version: FOLDER_SYNC_FILE_VERSION, exportedAt: '2024-01-01T00:00:00.000Z', data: withResults(1) },
        key
      );
      const legacy = await plainOf(store.copy, key);

      await writeFolderCopy(store, withResults(2), key, context);

      expect(readEnvelopeHeader(store.previous!)).toMatchObject({ lock: null });
      expect(await plainOf(store.previous, key)).toBe(legacy);
    });

    it('when the replaced copy cannot be sealed again, nothing in the folder changes', async () => {
      await writeFolderCopy(store, withResults(1), key, context);
      await writeFolderCopy(store, withResults(2), key, context);
      const [copy, previous] = [store.copy, store.previous];
      // Seals the new copy, then fails on the one being moved aside
      const realEncrypt = crypto.subtle.encrypt.bind(crypto.subtle);
      let seals = 0;
      const spy = vi.spyOn(crypto.subtle, 'encrypt').mockImplementation((...args) => {
        seals++;
        return seals === 2 ? Promise.reject(new Error('sealing failed')) : realEncrypt(...args);
      });

      try {
        await expect(writeFolderCopy(store, withResults(3), key, context)).rejects.toThrow();
      } finally {
        spy.mockRestore();
      }

      expect(store.copy).toBe(copy);
      expect(store.previous).toBe(previous);
      expect(store.saves).toBe(2);
    });
  });

  it('never replaces a copy that is not a sync file', async () => {
    store.copy = await encrypt(new TextEncoder().encode('not json').buffer as ArrayBuffer, key);

    expect(await writeFolderCopy(store, withResults(), key, context)).toEqual({
      status: 'protected',
      reason: 'unreadable',
    });
  });

  it('never replaces a copy saved by a newer version of HemoIO', async () => {
    const newer = { version: FOLDER_SYNC_FILE_VERSION + 1, exportedAt: '2030-01-01', data: withResults() };
    store.copy = await sealed(newer, key);
    const before = store.copy;

    expect(await writeFolderCopy(store, withResults(2), key, context)).toEqual({
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

    expect(await writeFolderCopy(store, withResults(), key, context)).toEqual({
      status: 'protected',
      reason: 'newer',
    });
  });

  describe('the previous copy', () => {
    it('is not kept when the folder held no copy', async () => {
      await writeFolderCopy(store, withResults(), key, context);

      expect(store.previous).toBeNull();
    });

    it('is the copy a write replaced', async () => {
      await writeFolderCopy(store, withResults(1), key, context);
      const replaced = await plainOf(store.copy, key);

      await writeFolderCopy(store, withResults(2), key, context);

      expect(await plainOf(store.previous, key)).toBe(replaced);
    });

    it('moves on as the data grows', async () => {
      await writeFolderCopy(store, withResults(1), key, context);
      await writeFolderCopy(store, withResults(2), key, context);
      const replaced = await plainOf(store.copy, key);

      await writeFolderCopy(store, withResults(3), key, context);

      expect(await plainOf(store.previous, key)).toBe(replaced);
    });

    it('is not pushed out by a copy holding less', async () => {
      // A full history, then a browser that lost it writes one new result, then another
      await writeFolderCopy(store, withResults(5), key, context);
      await writeFolderCopy(store, withResults(6), key, context);
      const full = await plainOf(store.copy, key);
      await writeFolderCopy(store, withResults(1), key, context);

      await writeFolderCopy(store, withResults(2), key, context);

      expect(await plainOf(store.previous, key)).toBe(full);
    });

    it('is not pushed out by a copy without health data', async () => {
      await writeFolderCopy(store, { ...empty(), preferences: { id: 1 } } as FolderSyncData, key, context);
      store.previous = await sealed({ version: 2, exportedAt: 'x', data: withResults() }, key);
      const previous = store.previous;

      await writeFolderCopy(store, withResults(), key, context);

      expect(store.previous).toBe(previous);
    });

    it('is replaced when it cannot be read: it is no copy to undo to', async () => {
      await writeFolderCopy(store, withResults(1), key, context);
      const replaced = await plainOf(store.copy, key);
      store.previous = await sealed({ version: 2, exportedAt: 'x', data: withResults() }, await newKey());

      await writeFolderCopy(store, withResults(2), key, context);

      expect(await plainOf(store.previous, key)).toBe(replaced);
    });

    it('moves on after a cleanup that keeps at least half of the records', async () => {
      await writeFolderCopy(store, withResults(10), key, context);
      await writeFolderCopy(store, withResults(8), key, context);
      const cleaned = await plainOf(store.copy, key);

      await writeFolderCopy(store, withResults(9), key, context);

      expect(await plainOf(store.previous, key)).toBe(cleaned);
    });
  });

  it('writes over an empty file', async () => {
    store.copy = new ArrayBuffer(0);

    expect(await writeFolderCopy(store, empty(), key, context)).toMatchObject({ status: 'written' });
  });
});
