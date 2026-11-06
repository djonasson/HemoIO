import { describe, it, expect, vi } from 'vitest';
import { decrypt, encrypt } from '@data/encryption';
import { createCredentialsV2 } from '@data/encryption/keyWrapping';
import { BACKUP_SCHEMA_VERSION } from '@services/export/jsonExport';
import {
  assessFolderCopy,
  readFolderCopy,
  unlockFolderCopy,
  type FolderCopySource,
  type FolderRecoverySource,
} from './folderCopy';
import { sealEnvelope } from './folderEnvelope';
import { FOLDER_LOCK_FORMAT } from './folderLockFile';
import { FOLDER_SYNC_FILE_VERSION as SYNC_FILE_VERSION } from './folderSync';

async function newKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

const EXPORTED_AT = '2026-10-29T08:30:00.000Z';

const STORED = {
  labResults: [
    {
      id: 7,
      date: '2024-01-15T10:00:00.000Z',
      labName: 'Quest Diagnostics',
      createdAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-15T10:00:00.000Z',
    },
  ],
  testValues: [
    {
      id: 3,
      labResultId: 7,
      biomarkerKey: '2345-7',
      value: 95,
      unit: 'mg/dL',
      createdAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-15T10:00:00.000Z',
    },
  ],
  userNotes: [],
  settings: { storageProvider: 'filesystem', aiProvider: 'openai', language: 'en' },
  preferences: {
    id: 1,
    unitPreferences: {},
    personalTargets: {},
    theme: 'system',
    dateFormat: 'MM/DD/YYYY',
  },
};

async function sealed(content: unknown, key: CryptoKey): Promise<ArrayBuffer> {
  const plain = new TextEncoder().encode(JSON.stringify(content));
  return encrypt(plain.buffer, key);
}

function copy(data: unknown = STORED, version = SYNC_FILE_VERSION): unknown {
  return { version, exportedAt: EXPORTED_AT, data };
}

describe('readFolderCopy', () => {
  it('opens a copy saved with the same key, as backup data with dates', async () => {
    const key = await newKey();

    const reading = await readFolderCopy(await sealed(copy(), key), key);

    expect(reading.status).toBe('readable');
    if (reading.status !== 'readable') return;
    expect(reading.data.exportedAt).toEqual(new Date(EXPORTED_AT));
    expect(reading.data.labResults).toHaveLength(1);
    expect(reading.data.labResults[0].date).toEqual(new Date('2024-01-15T10:00:00.000Z'));
    expect(reading.data.testValues[0].labResultId).toBe(7);
    expect(reading.data.userPreferences?.theme).toBe('system');
    // Device settings (storage, AI) are this device's own
    expect(reading.data.settings).toBeNull();
  });

  it('opens a copy that carries its lock, with its revision and lock', async () => {
    const { credentials: lock, key } = await createCredentialsV2('Old-Passw0rd!', 1000);
    const body = { version: SYNC_FILE_VERSION, exportedAt: EXPORTED_AT, revision: 'rev-1', data: STORED };
    const bytes = await sealEnvelope(new TextEncoder().encode(JSON.stringify(body)), key, lock);

    const reading = await readFolderCopy(bytes, key);

    expect(reading).toMatchObject({ status: 'readable', revision: 'rev-1', lock });
    if (reading.status !== 'readable') return;
    expect(reading.data.labResults).toHaveLength(1);
  });

  it('gives a legacy copy no revision and no lock', async () => {
    const key = await newKey();

    expect(await readFolderCopy(await sealed(copy(), key), key)).toMatchObject({
      status: 'readable',
      revision: null,
      lock: null,
    });
  });

  it("a copy with a lock the key cannot open is another setup's", async () => {
    const other = await createCredentialsV2('Other-Passw0rd!', 1000);
    const body = { version: SYNC_FILE_VERSION, exportedAt: EXPORTED_AT, revision: 'rev-1', data: STORED };
    const bytes = await sealEnvelope(new TextEncoder().encode(JSON.stringify(body)), other.key, other.credentials);

    expect(await readFolderCopy(bytes, await newKey())).toEqual({
      status: 'unreadable',
      reason: 'another-setup',
    });
  });

  it('reports a copy whose header is damaged as not a copy', async () => {
    const bytes = new TextEncoder().encode('{"format":"hemoio-folder-copy","version":1}').buffer;

    expect(await readFolderCopy(bytes, await newKey())).toEqual({
      status: 'unreadable',
      reason: 'not-a-copy',
    });
  });

  it('reports a copy saved under another key as one it cannot decrypt', async () => {
    const reading = await readFolderCopy(await sealed(copy(), await newKey()), await newKey());

    expect(reading).toEqual({ status: 'unreadable', reason: 'cannot-decrypt' });
  });

  it('reports random bytes, or a file too short to hold anything, as one it cannot decrypt', async () => {
    const key = await newKey();

    expect(await readFolderCopy(crypto.getRandomValues(new Uint8Array(64)).buffer, key)).toEqual({
      status: 'unreadable',
      reason: 'cannot-decrypt',
    });
    expect(await readFolderCopy(new ArrayBuffer(0), key)).toEqual({
      status: 'unreadable',
      reason: 'cannot-decrypt',
    });
  });

  it('reports content that is not a folder copy', async () => {
    const key = await newKey();

    for (const content of ['not json at all', { hello: 'world' }, copy({ labResults: 'no' })]) {
      const bytes =
        typeof content === 'string'
          ? await encrypt(new TextEncoder().encode(content).buffer, key)
          : await sealed(content, key);
      expect(await readFolderCopy(bytes, key)).toEqual({ status: 'unreadable', reason: 'not-a-copy' });
    }
  });

  it('reports a copy with a value keyed by anything but a LOINC code or an unknown key as not a copy', async () => {
    const odd = { ...STORED, testValues: [{ ...STORED.testValues[0], biomarkerKey: 'glucose' }] };
    const key = await newKey();
    expect(await readFolderCopy(await sealed(copy(odd), key), key)).toEqual({
      status: 'unreadable',
      reason: 'not-a-copy',
    });
  });

  it('reads a copy without a readable save date, as the sync loads it, with the date unknown', async () => {
    const key = await newKey();

    for (const exportedAt of ['yesterday-ish', undefined]) {
      const undated = { version: SYNC_FILE_VERSION, exportedAt, data: STORED };
      const reading = await readFolderCopy(await sealed(undated, key), key);

      expect(reading.status).toBe('readable');
      if (reading.status === 'readable') expect(Number.isNaN(reading.data.exportedAt.getTime())).toBe(true);
    }
  });

  it('reports a copy from a newer version of HemoIO', async () => {
    const key = await newKey();

    const reading = await readFolderCopy(await sealed(copy(STORED, SYNC_FILE_VERSION + 1), key), key);

    expect(reading).toEqual({ status: 'unreadable', reason: 'newer-version' });
  });
});

describe('readFolderCopy, earlier formats', () => {
  it('writes the format of the current backup schema, whose records it holds', () => {
    expect(SYNC_FILE_VERSION).toBe(BACKUP_SCHEMA_VERSION);
  });

  it.each([1, 2, 3])('reports a format %i copy, made before LOINC codes, as such', async (version) => {
    const key = await newKey();

    expect(await readFolderCopy(await sealed(copy(STORED, version), key), key)).toEqual({
      status: 'unreadable',
      reason: 'before-loinc',
    });
  });

  it('reports a format it never wrote as not a copy', async () => {
    const key = await newKey();

    expect(await readFolderCopy(await sealed(copy(STORED, 0), key), key)).toEqual({
      status: 'unreadable',
      reason: 'not-a-copy',
    });
  });
});

describe('assessFolderCopy', () => {
  function source(bytes: ArrayBuffer | null | Error): FolderCopySource {
    return {
      loadCurrent: vi.fn(async () => {
        if (bytes instanceof Error) throw bytes;
        return bytes;
      }),
    };
  }

  it('lets sync go ahead when the folder has no copy', async () => {
    const assessment = await assessFolderCopy(source(null), await newKey());

    expect(assessment).toEqual({ kind: 'sync' });
  });

  it('offers a copy that has lab results', async () => {
    const key = await newKey();

    const assessment = await assessFolderCopy(source(await sealed(copy(), key)), key);

    expect(assessment.kind).toBe('offer');
    if (assessment.kind !== 'offer') return;
    expect(assessment.data.labResults).toHaveLength(1);
  });

  it("the offer carries the copy's revision, null for a copy without the lock beside it", async () => {
    const key = await newKey();
    const enveloped = await sealEnvelope(
      new TextEncoder().encode(JSON.stringify({ ...(copy() as object), revision: 'r7' })),
      key,
      null
    );

    expect(await assessFolderCopy(source(enveloped), key)).toMatchObject({ kind: 'offer', revision: 'r7' });
    expect(await assessFolderCopy(source(await sealed(copy(), key)), key)).toMatchObject({
      kind: 'offer',
      revision: null,
    });
  });

  it('offers a copy that has only notes', async () => {
    const key = await newKey();
    const notesOnly = {
      ...STORED,
      labResults: [],
      testValues: [],
      userNotes: [
        {
          id: 1,
          content: 'Feeling tired',
          tags: [],
          createdAt: '2024-01-15T10:00:00.000Z',
          updatedAt: '2024-01-15T10:00:00.000Z',
        },
      ],
    };

    const assessment = await assessFolderCopy(source(await sealed(copy(notesOnly), key)), key);

    expect(assessment.kind).toBe('offer');
  });

  it('lets sync go ahead when the copy holds no lab results or notes', async () => {
    const key = await newKey();
    const empty = { ...STORED, labResults: [], testValues: [], userNotes: [] };

    const assessment = await assessFolderCopy(source(await sealed(copy(empty), key)), key);

    expect(assessment).toEqual({ kind: 'sync' });
  });

  it('reports a copy it cannot open', async () => {
    const assessment = await assessFolderCopy(source(await sealed(copy(), await newKey())), await newKey());

    expect(assessment).toEqual({ kind: 'unreadable', reason: 'cannot-decrypt' });
  });

  it('reports a copy that cannot be read from the folder, without logging why', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const assessment = await assessFolderCopy(source(new Error('disk on fire: /home/someone/Health')), await newKey());

    expect(assessment).toEqual({ kind: 'unreadable', reason: 'read-failed' });
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});

interface FolderFiles {
  current?: ArrayBuffer | null;
  previous?: ArrayBuffer | null;
  backups?: Record<string, ArrayBuffer>;
  lockFile?: ArrayBuffer | null;
}

/** A folder as the storage provider reads it, holding these files */
function folderOf({ current = null, previous = null, backups = {}, lockFile = null }: FolderFiles): FolderRecoverySource {
  return {
    loadCurrent: async () => current,
    loadPrevious: async () => previous,
    listBackups: async () => Object.keys(backups),
    loadBackup: async (name) => {
      if (!(name in backups)) throw new Error('No such backup');
      return backups[name];
    },
    loadLock: async () => lockFile,
  };
}

/** A folder holding only the current copy, or nothing */
function onlyCurrent(current: ArrayBuffer | null): FolderRecoverySource {
  return folderOf({ current });
}

describe('unlockFolderCopy', () => {
  const PASSWORD = 'Folder-Passw0rd!';

  /** A copy as folder sync writes it: the body sealed with the data key, the lock beside it */
  async function lockedCopy(password = PASSWORD) {
    const { credentials, key } = await createCredentialsV2(password, 1000);
    const enveloped = await sealEnvelope(
      new TextEncoder().encode(JSON.stringify({ ...(copy() as object), revision: 'r9' })),
      key,
      credentials
    );
    return { bytes: enveloped, credentials, key };
  }

  it('unlocks a copy with the password that made its lock', async () => {
    const { bytes, credentials, key } = await lockedCopy();

    const result = await unlockFolderCopy(onlyCurrent(bytes), PASSWORD);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lock).toEqual(credentials);
    expect(result.revision).toBe('r9');
    expect(result.from).toEqual({ file: 'current' });
    expect(result.copy.labResults).toHaveLength(1);
    expect(result.key.extractable).toBe(false);
    // The key the copy's records were sealed with
    const probe = await encrypt(new TextEncoder().encode('probe').buffer as ArrayBuffer, key);
    expect(new TextDecoder().decode(await decrypt(probe, result.key))).toBe('probe');
  });

  it('a wrong password is wrong-password', async () => {
    const { bytes } = await lockedCopy();

    expect(await unlockFolderCopy(onlyCurrent(bytes), 'Not-The-Passw0rd!')).toEqual({ ok: false, problem: 'wrong-password' });
  });

  it('a legacy copy is no-lock', async () => {
    const legacy = await sealed(copy(), await newKey());
    const lockless = await sealEnvelope(new TextEncoder().encode(JSON.stringify(copy())), await newKey(), null);

    expect(await unlockFolderCopy(onlyCurrent(legacy), PASSWORD)).toEqual({ ok: false, problem: 'no-lock' });
    expect(await unlockFolderCopy(onlyCurrent(lockless), PASSWORD)).toEqual({ ok: false, problem: 'no-lock' });
  });

  it('no bytes is no-copy', async () => {
    expect(await unlockFolderCopy(onlyCurrent(null), PASSWORD)).toEqual({ ok: false, problem: 'no-copy' });
  });

  it('a damaged body under a valid lock is cannot-decrypt', async () => {
    const { bytes } = await lockedCopy();
    const file = JSON.parse(new TextDecoder().decode(bytes)) as { sealed: string };
    // Another body under the same lock: valid base64, but not what the lock was sealed with
    const other = await sealed(copy(), await newKey());
    const swapped = { ...file, sealed: btoa(String.fromCharCode(...new Uint8Array(other))) };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await unlockFolderCopy(onlyCurrent(new TextEncoder().encode(JSON.stringify(swapped)).buffer as ArrayBuffer), PASSWORD);

    expect(result).toEqual({ ok: false, problem: 'cannot-decrypt' });
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('a lock with more iterations than any setup uses is not-a-copy, and never tried', async () => {
    const { bytes } = await lockedCopy();
    const file = JSON.parse(new TextDecoder().decode(bytes)) as { lock: object };
    const planted = { ...file, lock: { ...file.lock, iterations: 1e10 } };
    const unwrap = vi.spyOn(crypto.subtle, 'deriveKey');

    const result = await unlockFolderCopy(onlyCurrent(new TextEncoder().encode(JSON.stringify(planted)).buffer as ArrayBuffer), PASSWORD);

    expect(result).toEqual({ ok: false, problem: 'not-a-copy' });
    expect(unwrap).not.toHaveBeenCalled();
    unwrap.mockRestore();
  });

  it('a damaged header is not-a-copy, and a lock that is not v2 is never tried', async () => {
    const { bytes } = await lockedCopy();
    const file = JSON.parse(new TextDecoder().decode(bytes)) as { lock: object };
    const badLock = { ...file, lock: { ...file.lock, version: 3 } };

    const result = await unlockFolderCopy(onlyCurrent(new TextEncoder().encode(JSON.stringify(badLock)).buffer as ArrayBuffer), PASSWORD);

    expect(result).toEqual({ ok: false, problem: 'not-a-copy' });
  });
});

describe('unlockFolderCopy, from an earlier copy', () => {
  const PASSWORD = 'Folder-Passw0rd!';
  const OLDER_BACKUP = 'hemoio-backup-20261101T090000000Z.encrypted';
  const NEWER_BACKUP = 'hemoio-autobackup-20261104T090000000Z.encrypted';
  const NEWEST_BACKUP = 'hemoio-backup-20261105T090000000Z.encrypted';

  /** A body sealed as sync writes it: with the lock for the current copy, without for the others */
  function seal(key: CryptoKey, lock: object | null, revision: string, data: unknown = STORED): Promise<ArrayBuffer> {
    const body = { version: SYNC_FILE_VERSION, exportedAt: EXPORTED_AT, revision, data };
    return sealEnvelope(new TextEncoder().encode(JSON.stringify(body)), key, lock as never);
  }

  /** The current copy with its lock intact and its sealed body damaged */
  function damaged(bytes: ArrayBuffer): ArrayBuffer {
    const file = JSON.parse(new TextDecoder().decode(bytes)) as { sealed: string };
    const i = Math.floor(file.sealed.length / 2);
    file.sealed = `${file.sealed.slice(0, i)}${file.sealed[i] === 'A' ? 'B' : 'A'}${file.sealed.slice(i + 1)}`;
    return new TextEncoder().encode(JSON.stringify(file)).buffer as ArrayBuffer;
  }

  function lockFile(lock: object): ArrayBuffer {
    return new TextEncoder().encode(JSON.stringify({ format: FOLDER_LOCK_FORMAT, version: 1, lock }))
      .buffer as ArrayBuffer;
  }

  it('recovers from the previous copy when the current copy is damaged, with the lock it carries', async () => {
    const { credentials, key } = await createCredentialsV2(PASSWORD, 1000);
    const current = damaged(await seal(key, credentials, 'r2'));
    const previous = await seal(key, null, 'r1');

    const result = await unlockFolderCopy(folderOf({ current, previous }), PASSWORD);

    expect(result).toMatchObject({ ok: true, lock: credentials, revision: 'r1', from: { file: 'previous' } });
    if (result.ok) expect(result.copy.labResults).toHaveLength(1);
  });

  it('recovers from the newest backup that opens when the current copy is missing, with the lock file', async () => {
    const { credentials, key } = await createCredentialsV2(PASSWORD, 1000);
    const backups = {
      [OLDER_BACKUP]: await seal(key, null, 'r1'),
      [NEWEST_BACKUP]: new Uint8Array([1, 2, 3]).buffer as ArrayBuffer,
      [NEWER_BACKUP]: await seal(key, null, 'r3'),
      'notes.txt': await seal(key, null, 'r9'),
    };

    const result = await unlockFolderCopy(folderOf({ backups, lockFile: lockFile(credentials) }), PASSWORD);

    expect(result).toMatchObject({
      ok: true,
      lock: credentials,
      revision: 'r3',
      from: { file: 'backup', name: NEWER_BACKUP },
    });
  });

  it('recovers with the lock file when the current header is damaged', async () => {
    const { credentials, key } = await createCredentialsV2(PASSWORD, 1000);
    const current = new TextEncoder().encode('{"format":"hemoio-folder-copy","version":1,').buffer as ArrayBuffer;

    const result = await unlockFolderCopy(
      folderOf({ current, previous: await seal(key, null, 'r1'), lockFile: lockFile(credentials) }),
      PASSWORD
    );

    expect(result).toMatchObject({ ok: true, lock: credentials, from: { file: 'previous' } });
  });

  it('a planted lock file whose key opens nothing stores nothing: wrong-password or cannot-decrypt', async () => {
    const real = await createCredentialsV2(PASSWORD, 1000);
    const backups = { [OLDER_BACKUP]: await seal(real.key, null, 'r1') };
    const plantedSamePassword = await createCredentialsV2(PASSWORD, 1000);
    const plantedOtherPassword = await createCredentialsV2('Planted-Passw0rd!', 1000);

    expect(
      await unlockFolderCopy(folderOf({ backups, lockFile: lockFile(plantedSamePassword.credentials) }), PASSWORD)
    ).toEqual({ ok: false, problem: 'cannot-decrypt' });
    expect(
      await unlockFolderCopy(folderOf({ backups, lockFile: lockFile(plantedOtherPassword.credentials) }), PASSWORD)
    ).toEqual({ ok: false, problem: 'wrong-password' });
  });

  it("a readable header's lock is the one tried: a lock file planted beside it is never used", async () => {
    const real = await createCredentialsV2(PASSWORD, 1000);
    const planted = await createCredentialsV2(PASSWORD, 1000);
    const current = damaged(await seal(real.key, real.credentials, 'r2'));
    // The planted key opens a planted previous copy, but the header's lock is tried, not the file's
    const previous = await seal(planted.key, null, 'planted');

    const result = await unlockFolderCopy(
      folderOf({ current, previous, lockFile: lockFile(planted.credentials) }),
      PASSWORD
    );

    expect(result).toEqual({ ok: false, problem: 'cannot-decrypt' });
  });

  it('a missing current copy and no lock file is no-copy', async () => {
    const { key } = await createCredentialsV2(PASSWORD, 1000);

    expect(await unlockFolderCopy(folderOf({ previous: await seal(key, null, 'r1') }), PASSWORD)).toEqual({
      ok: false,
      problem: 'no-copy',
    });
  });

  it('a current copy from a newer HemoIO is told as such, never replaced by an older one', async () => {
    const { credentials, key } = await createCredentialsV2(PASSWORD, 1000);
    const body = { version: SYNC_FILE_VERSION + 1, exportedAt: EXPORTED_AT, revision: 'r2', data: STORED };
    const current = await sealEnvelope(new TextEncoder().encode(JSON.stringify(body)), key, credentials);

    const result = await unlockFolderCopy(folderOf({ current, previous: await seal(key, null, 'r1') }), PASSWORD);

    expect(result).toEqual({ ok: false, problem: 'newer-version' });
  });

  it('skips an earlier copy that cannot be loaded, and tells why nothing opened', async () => {
    const { credentials, key } = await createCredentialsV2(PASSWORD, 1000);
    const current = damaged(await seal(key, credentials, 'r2'));
    const source = folderOf({ current, backups: { [OLDER_BACKUP]: await seal(key, null, 'r1') } });
    source.loadPrevious = async () => {
      throw new Error('unreadable');
    };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await unlockFolderCopy(source, PASSWORD)).toMatchObject({ ok: true, from: { file: 'backup' } });
    source.loadBackup = async () => {
      throw new Error('unreadable');
    };
    expect(await unlockFolderCopy(source, PASSWORD)).toEqual({ ok: false, problem: 'cannot-decrypt' });
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
