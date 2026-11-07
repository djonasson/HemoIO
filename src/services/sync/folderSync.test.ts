import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { encrypt } from '@data/encryption';
import { createCredentialsV2, type StoredCredentialsV2 } from '@data/encryption/keyWrapping';
import { loadFolderSyncState, type FolderSyncState } from '@data/storage/folderSyncState';
import { openEnvelope, readEnvelopeHeader, sealEnvelope } from './folderEnvelope';
import { readLockFile, saveLockFile } from './folderLockFile';
import {
  FOLDER_SYNC_FILE_VERSION,
  FolderWriteHeld,
  MAX_FOLDER_ANCESTORS,
  digestFolderData,
  folderCopyId,
  folderDataJson,
  markFolderCopySeen,
  sealFolderCopy,
  sealLockIntoFolderCopy,
  writeFolderCopy,
  type FolderCopyStore,
  type FolderSyncData,
  type FolderSyncOutcome,
  type FolderWriteContext,
} from './folderSync';

/** Change one character of a base64 string, keeping it base64 */
function oneCharChanged(text: string): string {
  const i = Math.floor(text.length / 2);
  return text.slice(0, i) + (text[i] === 'A' ? 'B' : 'A') + text.slice(i + 1);
}

const newKey = (): Promise<CryptoKey> =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);

/** A folder holding the copy and the previous copy, as the storage provider keeps them */
class MemoryStore implements FolderCopyStore {
  copy: ArrayBuffer | null = null;
  previous: ArrayBuffer | null = null;
  lockFile: ArrayBuffer | null = null;
  saves = 0;
  /** How many saves also wrote the previous copy */
  previousSaves = 0;
  lockSaves = 0;
  /** Each write, in order: 'lock' or 'copy' */
  writes: string[] = [];

  async loadLock(): Promise<ArrayBuffer | null> {
    return this.lockFile;
  }

  async saveLock(bytes: ArrayBuffer): Promise<void> {
    this.lockFile = bytes;
    this.lockSaves++;
    this.writes.push('lock');
  }

  async loadCurrent(): Promise<ArrayBuffer | null> {
    return this.copy;
  }

  async loadPrevious(): Promise<ArrayBuffer | null> {
    return this.previous;
  }

  async save(data: ArrayBuffer, previous?: ArrayBuffer): Promise<void> {
    if (previous) {
      this.previous = previous;
      this.previousSaves++;
    }
    this.copy = data;
    this.saves++;
    this.writes.push('copy');
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
  return typeof header === 'object' && header !== null ? header.lock : undefined;
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
/** Another setup's lock, which wraps another data key */
let OTHER_LOCK: StoredCredentialsV2;

beforeAll(async () => {
  LOCK = (await createCredentialsV2('Old-Passw0rd!', 1000)).credentials;
  OTHER_LOCK = (await createCredentialsV2('Other-Passw0rd!', 1000)).credentials;
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

    // Read only to put a changed lock in it, once the folder holds this one
    const outcome = await write(store, withResults(2), key, {
      ...context,
      setAsideUnsaved: 2,
      lockMayBeBehind: false,
    });

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
      fileId: expect.stringMatching(/^sha256:/),
    });
    expect(store.copy).toBe(before);
    expect(store.saves).toBe(0);
  });

  it('never replaces a pre-LOINC copy, even one without health data', async () => {
    store.copy = await sealed({ version: 1, exportedAt: '2024-01-01', data: empty() }, key);

    expect(await write(store, withResults(), key, context)).toEqual({
      status: 'protected',
      reason: 'before-loinc',
      fileId: expect.stringMatching(/^sha256:/),
    });
  });

  it("never replaces another setup's copy, one with a lock the key cannot open", async () => {
    await write(store, withResults(), await newKey(), { ...context, lock: OTHER_LOCK });
    const foreign = store.copy;

    const outcome = await write(store, withResults(), key, context);

    expect(outcome).toEqual({ status: 'protected', reason: 'another-setup' });
    expect(store.copy).toBe(foreign);
  });

  it('never replaces a legacy copy the key cannot open', async () => {
    store.copy = await sealed({ version: 4, exportedAt: '2024-01-01', data: withResults() }, await newKey());
    const foreign = store.copy;

    const outcome = await write(store, withResults(), key, context);

    expect(outcome).toEqual({ status: 'protected', reason: 'unreadable', fileId: expect.stringMatching(/^sha256:/) });
    expect(store.copy).toBe(foreign);
  });

  it('never replaces a copy whose header is damaged', async () => {
    store.copy = new TextEncoder().encode('{"format":"hemoio-folder-copy","version":1}').buffer as ArrayBuffer;

    expect(await write(store, withResults(), key, context)).toEqual({
      status: 'protected',
      reason: 'unreadable',
      fileId: expect.stringMatching(/^sha256:/),
    });
  });

  describe('a copy that cannot be read, which the user chose to replace', () => {
    const idOf = (bytes: ArrayBuffer | null): Promise<string> => folderCopyId(bytes!, null);

    it.each([
      ['a legacy copy under another key', async () =>
        sealed({ version: 4, exportedAt: '2024-01-01', data: withResults() }, await newKey())],
      ['a copy whose header is damaged', async () =>
        new TextEncoder().encode('{"format":"hemoio-folder-copy","version":1}').buffer as ArrayBuffer],
      ['a copy saved before LOINC', async (k: CryptoKey) =>
        sealed({ version: 3, exportedAt: '2024-01-01', data: withResults(3) }, k)],
    ])('writes a fresh copy over %s, the very file kept', async (_label, make) => {
      store.copy = await make(key);
      store.previous = new TextEncoder().encode('an older previous copy').buffer as ArrayBuffer;
      const previousBefore = store.previous;

      const outcome = await write(store, withResults(2), key, {
        ...context,
        replacesUnreadable: await idOf(store.copy),
      });

      expect(outcome).toMatchObject({ status: 'written', folderLock: LOCK });
      const copy = await readCopy(store, key);
      expect(copy.data.labResults).toHaveLength(2);
      // Built on nothing: the file replaced has no revision anyone saw
      expect(copy.ancestors).toEqual([]);
      expect(folderLockOf(store)).toEqual(LOCK);
      // The previous copy (kept as a backup already) is this copy without its lock,
      // so nothing unkept is pushed out later
      expect(store.previous).not.toBe(previousBefore);
      expect(readEnvelopeHeader(store.previous!)).toMatchObject({ lock: null });
      expect((await plainOf(store.previous, key))).toBe(await plainOf(store.copy, key));
      // The lock file first, as for every write of a copy with a lock
      expect(store.writes).toEqual(['lock', 'copy']);
      expect(readLockFile(store.lockFile)).toEqual(LOCK);
      expect(outcome.status === 'written' && outcome.state.revision).toBe(copy.revision);
    });

    it('writes even an empty browser over it: the user chose to', async () => {
      store.copy = await sealed({ version: 3, exportedAt: '2024-01-01', data: withResults(3) }, key);

      expect(
        await write(store, empty(), key, { ...context, replacesUnreadable: await idOf(store.copy) })
      ).toMatchObject({ status: 'written' });
    });

    it('protects a file that changed since it was chosen: the question comes back', async () => {
      store.copy = new TextEncoder().encode('damaged, as first seen').buffer as ArrayBuffer;
      const chosen = await idOf(store.copy);
      store.copy = new TextEncoder().encode('damaged, written again meanwhile').buffer as ArrayBuffer;
      const now = store.copy;

      expect(await write(store, withResults(), key, { ...context, replacesUnreadable: chosen })).toEqual({
        status: 'protected',
        reason: 'unreadable',
        fileId: await idOf(now),
      });
      expect(store.copy).toBe(now);
      expect(store.saves).toBe(0);
    });

    it("never writes over another setup's copy, even when chosen", async () => {
      await write(store, withResults(), await newKey(), { ...context, lock: OTHER_LOCK });
      const foreign = store.copy;

      expect(
        await write(store, withResults(), key, { ...context, replacesUnreadable: await idOf(foreign) })
      ).toEqual({ status: 'protected', reason: 'another-setup' });
      expect(store.copy).toBe(foreign);
    });

    /** A copy of ours whose envelope header was rewritten as a later HemoIO or another setup might */
    async function withHeader(header: { version: unknown; lock: unknown }): Promise<ArrayBuffer> {
      await write(store, withResults(), key, context);
      const file = JSON.parse(new TextDecoder().decode(store.copy!));
      return new TextEncoder().encode(JSON.stringify({ ...file, ...header })).buffer as ArrayBuffer;
    }

    it.each([
      ['a newer envelope with credentials this build knows', { version: 2, lock: 'own' }, 'newer'],
      ['a newer envelope with a lock this build does not know', { version: 2, lock: { version: 3 } }, 'newer'],
      ['an envelope with a lock this build does not know', { version: 1, lock: { version: 3 } }, 'another-setup'],
      ['an envelope with a lock that is not a lock at all', { version: 1, lock: 'not a lock' }, 'another-setup'],
    ] as const)('never writes over %s, even when chosen', async (_label, header, reason) => {
      store.copy = await withHeader({ ...header, lock: header.lock === 'own' ? LOCK : header.lock });
      const held = store.copy;

      expect(
        await write(store, withResults(2), key, { ...context, replacesUnreadable: await idOf(held) })
      ).toEqual({ status: 'protected', reason });
      expect(store.copy).toBe(held);
    });

    it('writes over a copy whose records cannot be read back, sealing the later of the two locks', async () => {
      const records = {
        ...withResults(1),
        testValues: [{ id: 1, labResultId: 1, biomarkerKey: 'not-a-test', value: 1, unit: 'u' }],
      };
      store.copy = (await sealFolderCopy(records as unknown as FolderSyncData, key, dated(LATER))).bytes;

      const outcome = await write(store, withResults(2), key, {
        ...context,
        lock: dated(EARLIER),
        replacesUnreadable: await idOf(store.copy),
      });

      expect(outcome).toMatchObject({ status: 'written', folderLock: dated(LATER) });
      expect((await readCopy(store, key)).data.labResults).toHaveLength(2);
      expect(folderLockOf(store)).toEqual(dated(LATER));
    });

    it("seals this browser's lock when it is the later one", async () => {
      store.copy = (await sealFolderCopy(withResults(1), key, dated(EARLIER))).bytes;
      // Records that open, but cannot be restored: a sync file of an unknown test
      const file = JSON.parse(await plainOf(store.copy, key));
      file.data.testValues = [{ id: 1, labResultId: 1, biomarkerKey: 'not-a-test', value: 1, unit: 'u' }];
      store.copy = await sealEnvelope(new TextEncoder().encode(JSON.stringify(file)), key, dated(EARLIER));

      const outcome = await write(store, withResults(2), key, {
        ...context,
        lock: dated(LATER),
        replacesUnreadable: await idOf(store.copy),
      });

      expect(outcome).toMatchObject({ status: 'written', folderLock: dated(LATER) });
      expect(folderLockOf(store)).toEqual(dated(LATER));
    });

    it('rewrites the lock file after replacing a copy the key could not open, even over a later-dated lock', async () => {
      store.copy = await sealed({ version: 4, exportedAt: '2024-01-01', data: withResults() }, await newKey());
      // The lock file of the copy replaced: someone else's lock, dated later
      await saveLockFile(store, { ...OTHER_LOCK, changedAt: LATER });

      await write(store, withResults(2), key, {
        ...context,
        lock: dated(EARLIER),
        replacesUnreadable: await idOf(store.copy),
      });

      expect(readLockFile(store.lockFile)).toEqual(dated(EARLIER));
      expect(folderLockOf(store)).toEqual(dated(EARLIER));
    });

    it('keeps a later lock file after replacing a copy the key opened', async () => {
      store.copy = await sealed({ version: 3, exportedAt: '2024-01-01', data: withResults(3) }, key);
      await saveLockFile(store, dated(LATER));

      await write(store, withResults(2), key, {
        ...context,
        lock: dated(EARLIER),
        replacesUnreadable: await idOf(store.copy),
      });

      expect(readLockFile(store.lockFile)).toEqual(dated(LATER));
    });

    it('never writes over a copy from a newer HemoIO, even when chosen', async () => {
      store.copy = await sealed(
        { version: FOLDER_SYNC_FILE_VERSION + 1, exportedAt: '2030-01-01', data: withResults() },
        key
      );
      const newer = store.copy;

      expect(
        await write(store, withResults(), key, { ...context, replacesUnreadable: await idOf(newer) })
      ).toEqual({ status: 'protected', reason: 'newer' });
      expect(store.copy).toBe(newer);
    });

    it('leaves a copy that opens to the usual rules: the choice is only for one that cannot be read', async () => {
      await write(store, withResults(2), key, context);
      const readable = store.copy;

      // An empty browser never writes over a copy with results, chosen or not
      expect(
        await write(store, empty(), key, { ...context, replacesUnreadable: await idOf(readable) })
      ).toMatchObject({ status: 'protected', reason: 'empty' });
      expect(store.copy).toBe(readable);
    });

    it('still lets set-aside records protect the copy first', async () => {
      store.copy = new TextEncoder().encode('damaged').buffer as ArrayBuffer;

      expect(
        await write(store, withResults(), key, {
          ...context,
          setAsideUnsaved: 1,
          replacesUnreadable: await idOf(store.copy),
        })
      ).toMatchObject({ status: 'protected', reason: 'set-aside' });
      expect(store.saves).toBe(0);
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

    it('keeps the lock file holding the lock the copy carries, written before the copy', async () => {
      await write(store, withResults(), key, { ...context, lock: dated(EARLIER) });
      expect(readLockFile(store.lockFile)).toEqual(dated(EARLIER));
      expect(store.writes).toEqual(['lock', 'copy']);

      await write(store, withResults(), key, { ...context, lock: dated(LATER) });

      // Only the current lock: the earlier one is gone from the folder
      expect(readLockFile(store.lockFile)).toEqual(dated(LATER));
      expect(folderLockOf(store)).toEqual(dated(LATER));
    });

    it('rewrites the lock file only when it holds another lock', async () => {
      await write(store, withResults(1), key, context);
      await write(store, withResults(2), key, context);

      expect(store.lockSaves).toBe(1);
      expect(store.saves).toBe(2);
    });

    it('an unchanged copy brings a missing or stale lock file up to date', async () => {
      await write(store, withResults(), key, { ...context, lock: dated(LATER) });
      store.lockFile = null;

      // Adopted from the folder: this browser's lock is the earlier one
      const outcome = await write(store, withResults(), key, { ...context, lock: dated(EARLIER) });

      expect(outcome).toMatchObject({ status: 'unchanged', folderLock: dated(LATER) });
      expect(readLockFile(store.lockFile)).toEqual(dated(LATER));
      expect(store.saves).toBe(1);
    });

    it('writes no lock file while there is no lock', async () => {
      await write(store, withResults(), key, { ...context, lock: null });
      await write(store, withResults(), key, { ...context, lock: null });

      expect(store.lockFile).toBeNull();
    });

    it('a lock file that cannot be written leaves the copy as it was', async () => {
      await write(store, withResults(1), key, { ...context, lock: dated(EARLIER) });
      const before = store.copy;
      store.saveLock = async () => {
        throw new Error('read-only');
      };

      await expect(write(store, withResults(2), key, { ...context, lock: dated(LATER) })).rejects.toThrow();

      expect(store.copy).toBe(before);
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
      // Only the second write kept a previous copy
      expect(store.previousSaves).toBe(1);
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
      expect(typeof previous === 'object' && previous !== null && previous.lock).toBeNull();
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

      // The user chose to keep this computer's data over it
      await write(store, withResults(2), key, { ...context, replaces: await folderCopyId(store.copy!, null) });

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
      fileId: expect.stringMatching(/^sha256:/),
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

  it("a damaged copy carrying this browser's own lock is unreadable, not another setup's", async () => {
    await write(store, withResults(2), key, context);
    const file = JSON.parse(new TextDecoder().decode(store.copy!));
    file.sealed = oneCharChanged(file.sealed);
    store.copy = new TextEncoder().encode(JSON.stringify(file)).buffer as ArrayBuffer;
    const damaged = store.copy;

    expect(await write(store, withResults(1), key, context)).toEqual({
      status: 'protected',
      reason: 'unreadable',
      fileId: expect.stringMatching(/^sha256:/),
    });
    expect(store.copy).toBe(damaged);
  });

  it("passes on the copy's lock when its records cannot be read back, so a later one is adopted", async () => {
    const records = { ...withResults(1), testValues: [{ id: 1, labResultId: 1, biomarkerKey: 'not-a-test', value: 1, unit: 'u' }] };
    store.copy = (await sealFolderCopy(records as unknown as FolderSyncData, key, dated(LATER))).bytes;

    const outcome = await write(store, withResults(2), key, {
      ...context,
      lock: dated(EARLIER),
      lastSeen: null,
      lockMayBeBehind: false,
    });

    expect(outcome).toEqual({
      status: 'protected',
      reason: 'unreadable',
      folderLock: dated(LATER),
      fileId: expect.stringMatching(/^sha256:/),
    });
  });

  describe('a password change while the data are left as they are (P42)', () => {
    /** A copy written with the earlier lock, then a password change here */
    async function writtenThenPasswordChanged(data = withResults(2)) {
      await write(store, data, key, { ...context, lock: dated(EARLIER) });
      const before = await readCopy(store, key);
      store.previous = null;
      store.writes = [];
      return { before, changed: { ...context, lock: dated(LATER) } };
    }

    it('puts the new lock into the copy while records set aside hold the data', async () => {
      const { before, changed } = await writtenThenPasswordChanged();

      const outcome = await write(store, withResults(1), key, { ...changed, setAsideUnsaved: 2 });

      expect(outcome).toMatchObject({ status: 'protected', reason: 'set-aside' });
      expect(folderLockOf(store)).toEqual(dated(LATER));
      expect(readLockFile(store.lockFile)).toEqual(dated(LATER));
      // The same revision, ancestors and data: only the lock changed
      expect(await readCopy(store, key)).toEqual(before);
      expect(store.writes).toEqual(['lock', 'copy']);
      // The previous copy is left alone
      expect(store.previous).toBeNull();
    });

    it('puts the new lock into the copy that an empty browser must not write over', async () => {
      const { before, changed } = await writtenThenPasswordChanged();

      const outcome = await write(store, empty(), key, changed);

      expect(outcome).toMatchObject({ status: 'protected', reason: 'empty' });
      expect(folderLockOf(store)).toEqual(dated(LATER));
      expect(await readCopy(store, key)).toEqual(before);
    });

    it('puts the new lock into a copy written elsewhere, which stays the one to load or ask about', async () => {
      const { changed } = await writtenThenPasswordChanged(withResults(1));
      const lastSeen = seen.get(store)!;
      // Another computer writes a newer copy with the earlier lock
      await writeFolderCopy(store, withResults(3), key, { ...context, lock: dated(EARLIER), lastSeen });
      const elsewhere = await readCopy(store, key);

      const outcome = await write(store, withResults(1), key, { ...changed, lastSeen });

      expect(outcome).toMatchObject({ status: 'changed-elsewhere', reason: 'newer', revision: elsewhere.revision });
      expect(folderLockOf(store)).toEqual(dated(LATER));
      expect(await readCopy(store, key)).toEqual(elsewhere);
    });

    it('a lock that cannot be put into the folder still reports the protection, logging fixed text', async () => {
      const { changed } = await writtenThenPasswordChanged();
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(store, 'saveLock').mockRejectedValue(new Error('/home/someone/Lab Folder is read-only'));

      const outcome = await write(store, withResults(1), key, { ...changed, setAsideUnsaved: 2 });

      expect(outcome).toMatchObject({ status: 'protected', reason: 'set-aside' });
      expect(error.mock.calls).toEqual([['Could not put the new lock into the folder copy']]);
      error.mockRestore();
    });

    it('lets a re-seal the hold stopped end the sync, logging nothing', async () => {
      const { changed } = await writtenThenPasswordChanged();
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(store, 'saveLock').mockRejectedValue(new FolderWriteHeld());

      await expect(write(store, withResults(1), key, { ...changed, setAsideUnsaved: 2 })).rejects.toBeInstanceOf(
        FolderWriteHeld
      );
      expect(error).not.toHaveBeenCalled();
      error.mockRestore();
    });

    it('does not read the copy for it once the folder is known to hold the lock', async () => {
      await write(store, withResults(2), key, context);
      const loadCurrent = vi.spyOn(store, 'loadCurrent');

      await write(store, withResults(1), key, { ...context, setAsideUnsaved: 1, lockMayBeBehind: false });

      expect(loadCurrent).not.toHaveBeenCalled();
    });

    it('writes nothing to a copy the key does not open', async () => {
      store.copy = await sealFolderCopy(withResults(2), await newKey(), OTHER_LOCK).then((s) => s.bytes);
      const bytes = store.copy;

      const outcome = await write(store, withResults(1), key, { ...context, lock: dated(LATER) });

      expect(outcome).toMatchObject({ status: 'protected', reason: 'another-setup' });
      expect(store.copy).toBe(bytes);
      expect(store.lockFile).toBeNull();
    });

    it('with no copy, puts the new lock only into a lock file holding an older one', async () => {
      store.lockFile = new TextEncoder().encode(
        JSON.stringify({ format: 'hemoio-folder-lock', version: 1, lock: dated(EARLIER) })
      ).buffer as ArrayBuffer;

      expect(await sealLockIntoFolderCopy(store, key, dated(LATER))).toEqual({ status: 'current', folderLock: null });

      expect(readLockFile(store.lockFile)).toEqual(dated(LATER));
      expect(store.copy).toBeNull();
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
      const kept = store.previous;
      const previousSaves = store.previousSaves;

      await write(store, withResults(2), key, context);

      expect(await plainOf(store.previous, key)).toBe(full);
      // Left untouched, not written again with the same content
      expect(store.previous).toBe(kept);
      expect(store.previousSaves).toBe(previousSaves);
    });

    it('is not pushed out by a copy without health data', async () => {
      await write(store, { ...empty(), preferences: { id: 1 } } as FolderSyncData, key, context);
      store.previous = await sealed({ version: 2, exportedAt: 'x', data: withResults() }, key);
      const previous = store.previous;

      await write(store, withResults(), key, context);

      expect(store.previous).toBe(previous);
      expect(store.previousSaves).toBe(0);
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

  /** What a copy was built on: its revision, then its own ancestors */
  async function ancestryOf(bytes: ArrayBuffer | null): Promise<string[]> {
    if (!bytes) return [];
    const body = JSON.parse(await plainOf(bytes, key));
    return [body.revision, ...(body.ancestors ?? [])].slice(0, MAX_FOLDER_ANCESTORS);
  }

  /**
   * The other computer writes the folder copy, built on the copy there now
   * (as its sync does) unless told what it was built on; returns its revision
   */
  async function writtenElsewhere(data: FolderSyncData, ancestors?: string[]): Promise<string> {
    const { bytes, revision } = await sealFolderCopy(data, key, LOCK, ancestors ?? (await ancestryOf(store.copy)));
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
      reason: 'newer',
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

    expect(outcome).toMatchObject({ status: 'changed-elsewhere', reason: 'both-changed', revision, localChanged: true });
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
      reason: 'both-changed',
      localChanged: true,
    });
    expect(store.saves).toBe(0);
  });

  it('a never-read folder copy without health records is written over', async () => {
    await writtenElsewhere(empty());

    expect(await writeFolderCopy(store, withResults(2), key, context(null))).toMatchObject({
      status: 'written',
    });
  });

  it('an empty copy written elsewhere over a browser with data goes to the dialog', async () => {
    // A descendant of the copy this browser saw, but holding no health records
    const { lastSeen } = await syncedThenWrittenElsewhere(withResults(1), empty());

    expect(await writeFolderCopy(store, withResults(1), key, context(lastSeen))).toMatchObject({
      status: 'changed-elsewhere',
      reason: 'empties',
      localChanged: false,
    });
    expect(store.saves).toBe(1);
  });

  it('a replayed older copy goes to the dialog', async () => {
    // A writes r1, B builds r2 on it, A loads r2; then r1 is put back (a cloud history restore)
    const first = await writeFolderCopy(store, withResults(1), key, context(null));
    const r1Bytes = store.copy;
    const r2 = await writtenElsewhere(withResults(2));
    const loaded = await seenAs(r2, withResults(2));
    store.copy = r1Bytes;

    const outcome = await writeFolderCopy(store, withResults(2), key, context(loaded));

    expect(first.status).toBe('written');
    expect(outcome).toMatchObject({ status: 'changed-elsewhere', reason: 'not-newer', localChanged: false });
  });

  it('two computers writing within seconds: the copy that won is not loaded over unsynced data', async () => {
    // Both at r1
    const atR1 = await writeFolderCopy(store, withResults(1), key, context(null));
    if (atR1.status !== 'written') throw new Error('expected a write');
    const r1Bytes = store.copy;
    // A adds a result and writes r2
    const aWrote = await writeFolderCopy(store, withResults(2), key, context(atR1.state));
    if (aWrote.status !== 'written') throw new Error('expected a write');
    // B, which had not yet received r2, wrote r3 over r1, and the cloud kept B's file
    store.copy = r1Bytes;
    await writtenElsewhere(linked());

    const outcome = await writeFolderCopy(store, withResults(2), key, context(aWrote.state));

    expect(outcome).toMatchObject({ status: 'changed-elsewhere', reason: 'not-newer', localChanged: false });
    expect(store.saves).toBe(2);
  });

  it('another folder holding a copy of the same setup goes to the dialog', async () => {
    const dropbox = await writeFolderCopy(store, withResults(1), key, context(null));
    if (dropbox.status !== 'written') throw new Error('expected a write');
    // The same key, a copy written there long ago
    const onedrive = new MemoryStore();
    onedrive.copy = (await sealFolderCopy(withResults(3), key, LOCK)).bytes;

    expect(await writeFolderCopy(onedrive, withResults(1), key, context(dropbox.state))).toMatchObject({
      status: 'changed-elsewhere',
      reason: 'not-newer',
    });
    expect(onedrive.saves).toBe(0);
  });

  it('a copy without a revision is never the copy last seen', async () => {
    store.copy = await sealed({ version: FOLDER_SYNC_FILE_VERSION, exportedAt: '2024-01-01T00:00:00.000Z', data: withResults(2) }, key);

    expect(
      await writeFolderCopy(store, withResults(1), key, context(await seenAs(null, linked())))
    ).toMatchObject({ status: 'changed-elsewhere' });
    // Nor matched by a null choice; only by the identity of its bytes
    expect(await writeFolderCopy(store, withResults(1), key, context(null, { replaces: null }))).toMatchObject({
      status: 'changed-elsewhere',
    });
    expect(
      await writeFolderCopy(store, withResults(1), key, context(null, { replaces: await folderCopyId(store.copy, null) }))
    ).toMatchObject({ status: 'written' });
  });

  it('a written copy records what it was built on, newest first, keeping 200', async () => {
    let lastSeen: FolderSyncState | null = null;
    const revisions: string[] = [];
    for (let n = 1; n <= 205; n++) {
      const outcome = await writeFolderCopy(store, withResults(n), key, context(lastSeen));
      if (outcome.status !== 'written') throw new Error('expected a write');
      lastSeen = outcome.state;
      revisions.push(outcome.state.revision!);
    }

    const { ancestors } = JSON.parse(await plainOf(store.copy, key));
    expect(ancestors).toHaveLength(200);
    expect(ancestors[0]).toBe(revisions[203]);
    expect(ancestors).toEqual(revisions.slice(4, 204).reverse());
  });

  it("a copy written to resolve a conflict is built on both sides, so the other computer's next sync loads it", async () => {
    const mine = await writeFolderCopy(store, withResults(1), key, context(null));
    if (mine.status !== 'written') throw new Error('expected a write');
    // A copy that does not name this browser's (an older one, or one whose steps it never saw)
    const theirs = await writtenElsewhere(withResults(3), ['older']);
    const local = withResults(2);
    expect(await writeFolderCopy(store, local, key, context(mine.state))).toMatchObject({ reason: 'both-changed' });

    const kept = await writeFolderCopy(store, local, key, context(mine.state, { replaces: theirs }));

    if (kept.status !== 'written') throw new Error('expected a write');
    expect(JSON.parse(await plainOf(store.copy, key)).ancestors).toEqual([theirs, mine.state.revision, 'older']);
    // A computer that last saw this browser's copy, with nothing changed, loads the result
    expect(await writeFolderCopy(store, withResults(1), key, context(mine.state))).toMatchObject({
      status: 'changed-elsewhere',
      reason: 'newer',
    });
  });

  it("names this browser's copy once when the copy replaced was already built on it", async () => {
    const mine = await writeFolderCopy(store, withResults(1), key, context(null));
    if (mine.status !== 'written') throw new Error('expected a write');
    const theirs = await writtenElsewhere(withResults(3));

    await writeFolderCopy(store, withResults(2), key, context(mine.state, { replaces: theirs }));

    expect(JSON.parse(await plainOf(store.copy, key)).ancestors).toEqual([theirs, mine.state.revision]);
  });

  it.each([
    ['a string', 'REV'],
    ['a list holding other things', ['REV', 5]],
    ['an object', { 0: 'REV' }],
  ])('a copy whose ancestors are %s is asked about, never loaded', async (_, malformed) => {
    const mine = await writeFolderCopy(store, withResults(1), key, context(null));
    if (mine.status !== 'written') throw new Error('expected a write');
    const named = JSON.parse(JSON.stringify(malformed).replaceAll('REV', mine.state.revision!));
    store.copy = await sealed(
      { version: FOLDER_SYNC_FILE_VERSION, exportedAt: '2024-01-01T00:00:00.000Z', revision: 'theirs', ancestors: named, data: withResults(3) },
      key
    );

    expect(await writeFolderCopy(store, withResults(1), key, context(mine.state))).toMatchObject({
      status: 'changed-elsewhere',
      reason: 'not-newer',
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
    await writtenElsewhere(withResults(2), ['r0']);

    expect(await writeFolderCopy(store, empty(), key, context(await seenAs('r0', empty())))).toMatchObject({
      status: 'changed-elsewhere',
      reason: 'newer',
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
    ).toMatchObject({ status: 'protected', reason: 'set-aside' });
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
    const db = { exportAllData: vi.fn().mockResolvedValue(linked(3)), storedDataStamp: vi.fn() };

    await markFolderCopySeen(db, key, 'r9');

    expect(await loadFolderSyncState(key)).toEqual({ revision: 'r9', digest: await digestOf(linked()) });
    localStorage.clear();
  });

  it('markFolderCopySeen saves the digest while the data is as the load left it', async () => {
    localStorage.clear();
    const db = {
      exportAllData: vi.fn().mockResolvedValue(linked(3)),
      storedDataStamp: vi.fn().mockResolvedValue('as-loaded'),
    };

    await markFolderCopySeen(db, key, 'r9', 'as-loaded');

    expect(await loadFolderSyncState(key)).toEqual({ revision: 'r9', digest: await digestOf(linked()) });
    localStorage.clear();
  });

  it('markFolderCopySeen does not record a change saved after the load as seen', async () => {
    localStorage.clear();
    // The export holds a change saved since the load, which the stamp shows
    const db = {
      exportAllData: vi.fn().mockResolvedValue(linked(4)),
      storedDataStamp: vi.fn().mockResolvedValue('changed'),
    };

    await markFolderCopySeen(db, key, 'r9', 'as-loaded');

    const state = await loadFolderSyncState(key);
    expect(state?.revision).toBe('r9');
    // The next sync finds the data differs from what was seen, and writes it
    expect(state?.digest).not.toBe(await digestOf(linked(4)));
    localStorage.clear();
  });
});
