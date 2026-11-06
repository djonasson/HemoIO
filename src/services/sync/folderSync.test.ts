import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { encrypt } from '@data/encryption';
import { createCredentialsV2, type StoredCredentialsV2 } from '@data/encryption/keyWrapping';
import { loadFolderSyncState, type FolderSyncState } from '@data/storage/folderSyncState';
import { openEnvelope, readEnvelopeHeader } from './folderEnvelope';
import {
  FOLDER_SYNC_FILE_VERSION,
  digestFolderData,
  folderDataJson,
  markFolderCopySeen,
  sealFolderCopy,
  writeFolderCopy,
  type FolderCopyStore,
  type FolderSyncData,
  type FolderSyncOutcome,
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

type Context = Omit<FolderWriteContext, 'lastSeen'> & Partial<Pick<FolderWriteContext, 'lastSeen'>>;

/** What the browser syncing each folder last read or wrote there, as the sync hook keeps it */
const seen = new WeakMap<FolderCopyStore, FolderSyncState>();

/**
 * writeFolderCopy as one browser runs it, one sync after another: unless
 * told otherwise, it last saw what its previous sync read or wrote
 */
async function write(store: FolderCopyStore, data: FolderSyncData, key: CryptoKey, context: Context) {
  const lastSeen = 'lastSeen' in context ? (context.lastSeen ?? null) : (seen.get(store) ?? null);
  const outcome = await writeFolderCopy(store, data, key, { ...context, lastSeen });
  if (outcome.status === 'written' || outcome.status === 'unchanged') seen.set(store, outcome.state);
  return outcome;
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
  let context: Context;

  beforeEach(async () => {
    key = await newKey();
    store = new MemoryStore();
    context = { lock: LOCK, setAsideUnsaved: 0 };
  });

  it('writes an encrypted copy, in the current format, when the folder holds none', async () => {
    const outcome = await write(store, withResults(), key, context);

    expect(outcome).toMatchObject({ status: 'written' });
    const copy = await readCopy(store, key);
    expect(copy.version).toBe(FOLDER_SYNC_FILE_VERSION);
    // The backup schema's version, so a restore accepts it
    expect(copy.version).toBe(4);
    expect(copy.data.labResults).toHaveLength(1);
    expect(typeof copy.exportedAt).toBe('string');
  });

  it('unsaved set-aside records protect the folder copy without reading it', async () => {
    await write(store, withResults(), key, context);
    const before = store.copy;
    const loadCurrent = vi.spyOn(store, 'loadCurrent');

    const outcome = await write(store, withResults(2), key, { ...context, setAsideUnsaved: 2 });

    expect(outcome).toEqual({ status: 'protected', reason: 'set-aside' });
    expect(loadCurrent).not.toHaveBeenCalled();
    expect(store.copy).toBe(before);
    expect(store.saves).toBe(1);
  });

  it('writes again once no set-aside record is unsaved', async () => {
    expect(await write(store, withResults(), key, { ...context, setAsideUnsaved: 0 })).toMatchObject({
      status: 'written',
    });
  });

  it('writes nothing readable without the key', async () => {
    await write(store, withResults(), key, context);

    expect(new TextDecoder().decode(store.copy!)).not.toContain('Quest Diagnostics');
  });

  it('writes an empty state to a folder that holds no copy yet', async () => {
    expect(await write(store, empty(), key, context)).toMatchObject({ status: 'written' });
  });

  it('never replaces a copy holding lab results with one that has none', async () => {
    await write(store, withResults(), key, context);
    const before = store.copy;

    const outcome = await write(store, empty(), key, context);

    expect(outcome).toEqual({ status: 'protected', reason: 'empty', folderLock: LOCK });
    expect(store.copy).toBe(before);
  });

  it.each([
    ['test values', { testValues: [{ id: 1 }] }],
    ['notes', { userNotes: [{ id: 1 }] }],
  ])('counts a copy holding only %s as holding data', async (_label, records) => {
    await write(store, { ...empty(), ...records } as FolderSyncData, key, context);

    expect(await write(store, empty(), key, context)).toMatchObject({
      status: 'protected',
      reason: 'empty',
    });
  });

  it('does not count settings and preferences alone as data', async () => {
    const preferencesOnly = { ...empty(), preferences: { id: 1 } } as FolderSyncData;
    await write(store, preferencesOnly, key, context);

    expect(await write(store, empty(), key, context)).toMatchObject({ status: 'written' });
  });

  it('replaces a copy with lab results by one that also has lab results', async () => {
    await write(store, withResults(), key, context);

    expect(await write(store, withResults(2), key, context)).toMatchObject({ status: 'written' });
    expect((await readCopy(store, key)).data.labResults).toHaveLength(2);
  });

  it('does not write when nothing changed, so the previous copy is kept', async () => {
    await write(store, withResults(), key, context);

    expect(await write(store, withResults(), key, context)).toMatchObject({ status: 'unchanged' });
    expect(store.saves).toBe(1);
  });

  it('never replaces a copy saved before tests were identified by LOINC', async () => {
    store.copy = await sealed({ version: 3, exportedAt: '2024-01-01', data: withResults() }, key);
    const before = store.copy;

    expect(await write(store, withResults(2), key, context)).toEqual({
      status: 'protected',
      reason: 'before-loinc',
    });
    expect(store.copy).toBe(before);
    expect(store.saves).toBe(0);
  });

  it('never replaces a pre-LOINC copy, even one without health data', async () => {
    store.copy = await sealed({ version: 1, exportedAt: '2024-01-01', data: empty() }, key);

    expect(await write(store, withResults(), key, context)).toEqual({
      status: 'protected',
      reason: 'before-loinc',
    });
  });

  it("never replaces another setup's copy, one with a lock the key cannot open", async () => {
    await write(store, withResults(), await newKey(), context);
    const foreign = store.copy;

    const outcome = await write(store, withResults(), key, context);

    expect(outcome).toEqual({ status: 'protected', reason: 'another-setup' });
    expect(store.copy).toBe(foreign);
  });

  it('never replaces a legacy copy the key cannot open', async () => {
    store.copy = await sealed({ version: 4, exportedAt: '2024-01-01', data: withResults() }, await newKey());
    const foreign = store.copy;

    const outcome = await write(store, withResults(), key, context);

    expect(outcome).toEqual({ status: 'protected', reason: 'unreadable' });
    expect(store.copy).toBe(foreign);
  });

  it('never replaces a copy whose header is damaged', async () => {
    store.copy = new TextEncoder().encode('{"format":"hemoio-folder-copy","version":1}').buffer as ArrayBuffer;

    expect(await write(store, withResults(), key, context)).toEqual({
      status: 'protected',
      reason: 'unreadable',
    });
  });

  describe('the lock beside the copy', () => {
    it('writes the lock beside the data, and a new revision each time', async () => {
      await write(store, withResults(1), key, context);
      const first = await readCopy(store, key);
      await write(store, withResults(2), key, context);

      expect(folderLockOf(store)).toEqual(LOCK);
      const second = await readCopy(store, key);
      expect(typeof first.revision).toBe('string');
      expect(second.revision).not.toBe(first.revision);
    });

    it('returns the lock it found in the folder', async () => {
      await write(store, withResults(1), key, context);

      expect(await write(store, withResults(2), key, context)).toMatchObject({
        status: 'written',
        folderLock: LOCK,
      });
    });

    it('a lock edited in the file is never adopted', async () => {
      await write(store, withResults(), key, context);
      const file = JSON.parse(new TextDecoder().decode(store.copy!));
      const i = Math.floor(file.lock.wrappedKey.length / 2);
      file.lock.wrappedKey =
        file.lock.wrappedKey.slice(0, i) + (file.lock.wrappedKey[i] === 'A' ? 'B' : 'A') + file.lock.wrappedKey.slice(i + 1);
      store.copy = new TextEncoder().encode(JSON.stringify(file)).buffer as ArrayBuffer;
      const edited = store.copy;

      const outcome = await write(store, withResults(2), key, context);

      expect(outcome).toEqual({ status: 'protected', reason: 'another-setup' });
      expect('folderLock' in outcome).toBe(false);
      expect(store.copy).toBe(edited);
    });

    it('rewrites an unchanged copy when this lock is later', async () => {
      await write(store, withResults(), key, { ...context, lock: dated(EARLIER) });

      const outcome = await write(store, withResults(), key, { ...context, lock: dated(LATER) });

      expect(outcome).toMatchObject({ status: 'written', folderLock: dated(EARLIER) });
      expect(folderLockOf(store)).toEqual(dated(LATER));
    });

    it('rewrites a legacy copy so that it carries the lock', async () => {
      const data = withResults();
      store.copy = await sealed({ version: FOLDER_SYNC_FILE_VERSION, exportedAt: '2024-01-01T00:00:00.000Z', data }, key);

      const outcome = await write(store, data, key, context);

      expect(outcome).toMatchObject({ status: 'written', folderLock: null });
      expect(folderLockOf(store)).toEqual(LOCK);
    });

    it('leaves an unchanged copy alone when the folder lock is later, and returns it', async () => {
      await write(store, withResults(), key, { ...context, lock: dated(LATER) });
      const before = store.copy;

      const outcome = await write(store, withResults(), key, { ...context, lock: dated(EARLIER) });

      expect(outcome).toMatchObject({ status: 'unchanged', folderLock: dated(LATER) });
      expect(store.copy).toBe(before);
    });

    it('keeps the later folder lock when it writes new data', async () => {
      await write(store, withResults(1), key, { ...context, lock: dated(LATER) });

      const outcome = await write(store, withResults(2), key, { ...context, lock: dated(EARLIER) });

      expect(outcome).toMatchObject({ status: 'written', folderLock: dated(LATER) });
      expect(folderLockOf(store)).toEqual(dated(LATER));
    });

    it('writes a copy without a lock while this browser has none', async () => {
      await write(store, withResults(), key, { ...context, lock: null });

      expect(folderLockOf(store)).toBeNull();
      expect(await write(store, withResults(), key, { ...context, lock: null })).toMatchObject({
        status: 'unchanged',
        folderLock: null,
      });
    });

    it('a rewrite for the lock alone keeps the previous copy', async () => {
      await write(store, withResults(1), key, { ...context, lock: dated(EARLIER) });
      await write(store, withResults(2), key, { ...context, lock: dated(EARLIER) });
      const previous = store.previous;

      await write(store, withResults(2), key, { ...context, lock: dated(LATER) });

      expect(store.saves).toBe(3);
      expect(store.previous).toBe(previous);
    });

    it('keeps the previous copy in the same format, without a lock', async () => {
      await write(store, withResults(1), key, context);
      await write(store, withResults(2), key, context);

      expect(readEnvelopeHeader(store.previous!)).toEqual({
        format: 'hemoio-folder-copy',
        version: 1,
        lock: null,
      });
    });

    it('after a password change and a later data change, the previous copy has no lock and still opens', async () => {
      await write(store, withResults(1), key, { ...context, lock: dated(EARLIER) });
      // The password change: only the lock is rewritten
      await write(store, withResults(1), key, { ...context, lock: dated(LATER) });
      const beforeChange = await plainOf(store.copy, key);

      await write(store, withResults(2), key, { ...context, lock: dated(LATER) });

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

      // This browser read the legacy copy before: its own data changed since
      await write(store, withResults(2), key, { ...context, lastSeen: { revision: null, digest: 'earlier' } });

      expect(readEnvelopeHeader(store.previous!)).toMatchObject({ lock: null });
      expect(await plainOf(store.previous, key)).toBe(legacy);
    });

    it('when the replaced copy cannot be sealed again, nothing in the folder changes', async () => {
      await write(store, withResults(1), key, context);
      await write(store, withResults(2), key, context);
      const [copy, previous] = [store.copy, store.previous];
      // Seals the new copy, then fails on the one being moved aside
      const realEncrypt = crypto.subtle.encrypt.bind(crypto.subtle);
      let seals = 0;
      const spy = vi.spyOn(crypto.subtle, 'encrypt').mockImplementation((...args) => {
        seals++;
        return seals === 2 ? Promise.reject(new Error('sealing failed')) : realEncrypt(...args);
      });

      try {
        await expect(write(store, withResults(3), key, context)).rejects.toThrow();
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

    expect(await write(store, withResults(), key, context)).toEqual({
      status: 'protected',
      reason: 'unreadable',
    });
  });

  it('never replaces a copy saved by a newer version of HemoIO', async () => {
    const newer = { version: FOLDER_SYNC_FILE_VERSION + 1, exportedAt: '2030-01-01', data: withResults() };
    store.copy = await sealed(newer, key);
    const before = store.copy;

    expect(await write(store, withResults(2), key, context)).toEqual({
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

    expect(await write(store, withResults(), key, context)).toEqual({
      status: 'protected',
      reason: 'newer',
    });
  });

  describe('the previous copy', () => {
    it('is not kept when the folder held no copy', async () => {
      await write(store, withResults(), key, context);

      expect(store.previous).toBeNull();
    });

    it('is the copy a write replaced', async () => {
      await write(store, withResults(1), key, context);
      const replaced = await plainOf(store.copy, key);

      await write(store, withResults(2), key, context);

      expect(await plainOf(store.previous, key)).toBe(replaced);
    });

    it('moves on as the data grows', async () => {
      await write(store, withResults(1), key, context);
      await write(store, withResults(2), key, context);
      const replaced = await plainOf(store.copy, key);

      await write(store, withResults(3), key, context);

      expect(await plainOf(store.previous, key)).toBe(replaced);
    });

    it('is not pushed out by a copy holding less', async () => {
      // A full history, then a browser that lost it writes one new result, then another
      await write(store, withResults(5), key, context);
      await write(store, withResults(6), key, context);
      const full = await plainOf(store.copy, key);
      await write(store, withResults(1), key, context);

      await write(store, withResults(2), key, context);

      expect(await plainOf(store.previous, key)).toBe(full);
    });

    it('is not pushed out by a copy without health data', async () => {
      await write(store, { ...empty(), preferences: { id: 1 } } as FolderSyncData, key, context);
      store.previous = await sealed({ version: 2, exportedAt: 'x', data: withResults() }, key);
      const previous = store.previous;

      await write(store, withResults(), key, context);

      expect(store.previous).toBe(previous);
    });

    it('is replaced when it cannot be read: it is no copy to undo to', async () => {
      await write(store, withResults(1), key, context);
      const replaced = await plainOf(store.copy, key);
      store.previous = await sealed({ version: 2, exportedAt: 'x', data: withResults() }, await newKey());

      await write(store, withResults(2), key, context);

      expect(await plainOf(store.previous, key)).toBe(replaced);
    });

    it('moves on after a cleanup that keeps at least half of the records', async () => {
      await write(store, withResults(10), key, context);
      await write(store, withResults(8), key, context);
      const cleaned = await plainOf(store.copy, key);

      await write(store, withResults(9), key, context);

      expect(await plainOf(store.previous, key)).toBe(cleaned);
    });
  });

  it('writes over an empty file', async () => {
    store.copy = new ArrayBuffer(0);

    expect(await write(store, empty(), key, context)).toMatchObject({ status: 'written' });
  });
});

const T1 = new Date('2024-01-15T10:00:00.000Z');
const T2 = new Date('2024-03-01T08:00:00.000Z');

/**
 * Two results on the same day, a value in each and a note on the second
 * value. Every ID is offset by `offset`; `reversed` lists them in the other
 * order, as a copy loaded with new IDs may be exported (same-day results are
 * ordered by ID)
 */
function linked(offset = 0, reversed = false): FolderSyncData {
  const id = (n: number): number => n + offset;
  const order = <T,>(records: T[]): T[] => (reversed ? [...records].reverse() : records);
  return {
    ...empty(),
    labResults: order([
      { id: id(1), date: T1, labName: 'Quest Diagnostics', createdAt: T1, updatedAt: T1 },
      { id: id(2), date: T1, labName: 'LabCorp', createdAt: T1, updatedAt: T2 },
    ]),
    testValues: order([
      { id: id(1), labResultId: id(1), biomarkerKey: '718-7', value: 14.5, unit: 'g/dL', createdAt: T1, updatedAt: T1 },
      { id: id(2), labResultId: id(2), biomarkerKey: '718-7', value: 15, unit: 'g/dL', createdAt: T1, updatedAt: T1 },
    ]),
    userNotes: [
      { id: id(1), labResultId: id(2), testValueId: id(2), content: 'Fasting', tags: [], createdAt: T1, updatedAt: T1 },
    ],
  };
}

const digestOf = (data: FolderSyncData): Promise<string> => digestFolderData(folderDataJson(data));

describe('two computers on one folder', () => {
  let key: CryptoKey;
  let store: MemoryStore;
  const context = (lastSeen: FolderSyncState | null, extra: Partial<FolderWriteContext> = {}): FolderWriteContext => ({
    lock: LOCK,
    setAsideUnsaved: 0,
    lastSeen,
    ...extra,
  });

  beforeEach(async () => {
    key = await newKey();
    store = new MemoryStore();
  });

  /** The other computer writes the folder copy; returns its revision */
  async function writtenElsewhere(data: FolderSyncData): Promise<string> {
    const { bytes, revision } = await sealFolderCopy(data, key, LOCK);
    store.copy = bytes;
    return revision;
  }

  /** What this browser saw when it last read or wrote `revision` with `data` */
  const seenAs = async (revision: string | null, data: FolderSyncData): Promise<FolderSyncState> => ({
    revision,
    digest: await digestOf(data),
  });

  /** This browser synced `data`, then the other computer wrote `elsewhere` */
  async function syncedThenWrittenElsewhere(data: FolderSyncData, elsewhere: FolderSyncData) {
    const first = await writeFolderCopy(store, data, key, context(null));
    if (first.status !== 'written') throw new Error('expected a write');
    const revision = await writtenElsewhere(elsewhere);
    return { lastSeen: first.state, revision };
  }

  it('the digest ignores IDs and order, but not which records belong together', async () => {
    const digest = await digestOf(linked());

    expect(await digestOf(linked(100, true))).toBe(digest);
    const moved = linked();
    moved.userNotes = [{ ...moved.userNotes[0], testValueId: 1 }];
    expect(await digestOf(moved)).not.toBe(digest);
    const edited = linked();
    edited.testValues = [{ ...edited.testValues[0], value: 14.6 }, edited.testValues[1]];
    expect(await digestOf(edited)).not.toBe(digest);
  });

  it('a written copy carries the state the browser saw: its revision and the data digest', async () => {
    const outcome = await writeFolderCopy(store, linked(), key, context(null));

    const copy = await readCopy(store, key);
    expect(outcome).toEqual({
      status: 'written',
      state: { revision: copy.revision, digest: await digestOf(linked()) },
      folderLock: null,
    });
  });

  it('a copy loaded from the folder is not written back', async () => {
    const revision = await writtenElsewhere(linked(0));
    const local = linked(40);

    const outcome = await writeFolderCopy(store, local, key, context(await seenAs(revision, linked(70, true))));

    expect(outcome).toMatchObject({ status: 'unchanged', state: { revision, digest: await digestOf(local) } });
    expect(store.saves).toBe(0);
  });

  it('a copy written elsewhere with no local changes is changed-elsewhere, not local-changed', async () => {
    const { lastSeen, revision } = await syncedThenWrittenElsewhere(withResults(1), withResults(2));
    const bytes = store.copy;

    const outcome = await writeFolderCopy(store, withResults(1), key, context(lastSeen));

    expect(outcome).toMatchObject({
      status: 'changed-elsewhere',
      revision,
      localChanged: false,
      folderLock: LOCK,
      folder: { labResults: 2, testValues: 0, notes: 0 },
      browser: { labResults: 1, testValues: 0, notes: 0 },
    });
    if (outcome.status !== 'changed-elsewhere') throw new Error('expected changed-elsewhere');
    expect(outcome.bytes).toBe(bytes);
    expect(outcome.copy.labResults).toHaveLength(2);
    expect(outcome.copy.labResults[0].date).toBeInstanceOf(Date);
    expect(store.saves).toBe(1);
  });

  it('with local changes it is a conflict', async () => {
    const { lastSeen, revision } = await syncedThenWrittenElsewhere(withResults(1), withResults(2));

    const outcome = await writeFolderCopy(store, withResults(3), key, context(lastSeen));

    expect(outcome).toMatchObject({ status: 'changed-elsewhere', revision, localChanged: true });
    expect(store.saves).toBe(1);
  });

  it('dates each side: the folder by when its copy was saved, this browser by its latest change', async () => {
    const before = Date.now();
    await writtenElsewhere(withResults(2));

    const outcome = (await writeFolderCopy(store, linked(), key, context(null))) as Extract<
      FolderSyncOutcome,
      { status: 'changed-elsewhere' }
    >;

    expect(outcome.folder.savedAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(outcome.browser).toEqual({ labResults: 2, testValues: 2, notes: 1, savedAt: T2 });
  });

  it('never-read browser data equal to the copy is adopted', async () => {
    const revision = await writtenElsewhere(linked(0));

    const outcome = await writeFolderCopy(store, linked(25, true), key, context(null));

    expect(outcome).toEqual({
      status: 'unchanged',
      state: { revision, digest: await digestOf(linked()) },
      folderLock: LOCK,
    });
    expect(store.saves).toBe(0);
  });

  it('never-read browser data differing from the copy is a conflict', async () => {
    await writtenElsewhere(withResults(2));

    expect(await writeFolderCopy(store, withResults(1), key, context(null))).toMatchObject({
      status: 'changed-elsewhere',
      localChanged: true,
    });
    expect(store.saves).toBe(0);
  });

  it('a folder copy written elsewhere without health records is written over', async () => {
    const { lastSeen } = await syncedThenWrittenElsewhere(withResults(1), empty());

    expect(await writeFolderCopy(store, withResults(2), key, context(lastSeen))).toMatchObject({
      status: 'written',
    });
  });

  it('a copy rewritten elsewhere with the data this browser last saw is written over, not a conflict', async () => {
    // The other computer changed its password: its sync rewrote the copy for the lock alone
    const first = await writeFolderCopy(store, linked(), key, context(null));
    if (first.status !== 'written') throw new Error('expected a write');
    const later = { ...LOCK, changedAt: '2099-01-01T00:00:00.000Z' };
    const { bytes } = await sealFolderCopy(linked(60, true), key, later);
    store.copy = bytes;

    const outcome = await writeFolderCopy(store, withResults(3), key, context(first.state));

    expect(outcome).toMatchObject({ status: 'written', folderLock: later });
    // The later lock stays beside the copy
    expect(folderLockOf(store)).toEqual(later);
    // Unchanged here, it is adopted as seen
    expect(await writeFolderCopy(store, withResults(3), key, context(null))).toMatchObject({ status: 'unchanged' });
  });

  it("this computer's own settings are no change to the shared data", async () => {
    const revision = await writtenElsewhere({ ...linked(), settings: { storageProvider: 'filesystem' } } as FolderSyncData);
    const local = { ...linked(), settings: { storageProvider: 'local', language: 'it' } } as FolderSyncData;

    expect(await writeFolderCopy(store, local, key, context(null))).toMatchObject({
      status: 'unchanged',
      state: { revision },
    });
  });

  it("keeping this computer's data re-checks the folder copy first", async () => {
    const { lastSeen, revision } = await syncedThenWrittenElsewhere(withResults(1), withResults(2));
    const chosen = await plainOf(store.copy, key);

    // The user chose to replace r1, but the copy is now another
    expect(
      await writeFolderCopy(store, withResults(3), key, context(lastSeen, { replaces: 'r1' }))
    ).toMatchObject({ status: 'changed-elsewhere', revision });
    expect(store.saves).toBe(1);

    // The copy the user chose to replace is written over, and kept as the previous copy
    const outcome = await writeFolderCopy(store, withResults(3), key, context(lastSeen, { replaces: revision }));
    expect(outcome).toMatchObject({ status: 'written' });
    expect((await readCopy(store, key)).data.labResults).toHaveLength(3);
    expect(await plainOf(store.previous, key)).toBe(chosen);
  });

  it('an empty browser that changed nothing since it last read loads the newer copy', async () => {
    await writtenElsewhere(withResults(2));

    expect(await writeFolderCopy(store, empty(), key, context(await seenAs('r0', empty())))).toMatchObject({
      status: 'changed-elsewhere',
      localChanged: false,
    });
    expect(store.saves).toBe(0);
  });

  it('a never-read empty browser stays protected', async () => {
    await writtenElsewhere(withResults(2));

    expect(await writeFolderCopy(store, empty(), key, context(null))).toEqual({
      status: 'protected',
      reason: 'empty',
      folderLock: LOCK,
    });
    expect(store.saves).toBe(0);
  });

  it('a newer copy is not loaded while set-aside records are unsaved', async () => {
    const { lastSeen } = await syncedThenWrittenElsewhere(withResults(1), withResults(2));

    expect(
      await writeFolderCopy(store, withResults(1), key, context(lastSeen, { setAsideUnsaved: 1 }))
    ).toEqual({ status: 'protected', reason: 'set-aside' });
  });

  it('sealFolderCopy seals without a lock when given none, under a new revision each time', async () => {
    const first = await sealFolderCopy(withResults(1), key, null);
    const second = await sealFolderCopy(withResults(1), key, null);

    expect(readEnvelopeHeader(first.bytes)).toMatchObject({ lock: null });
    expect(second.revision).not.toBe(first.revision);
    const body = JSON.parse(await plainOf(first.bytes, key));
    expect(body).toMatchObject({ version: FOLDER_SYNC_FILE_VERSION, revision: first.revision });
    expect(body.data.labResults).toHaveLength(1);
  });

  it('markFolderCopySeen saves the digest of the data as it now is', async () => {
    localStorage.clear();
    const db = { exportAllData: vi.fn().mockResolvedValue(linked(3)) };

    await markFolderCopySeen(db, key, 'r9');

    expect(await loadFolderSyncState(key)).toEqual({ revision: 'r9', digest: await digestOf(linked()) });
    localStorage.clear();
  });
});
