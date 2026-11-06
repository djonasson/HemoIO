import { describe, it, expect, vi } from 'vitest';
import { decrypt, encrypt } from '@data/encryption';
import { createCredentialsV2 } from '@data/encryption/keyWrapping';
import { BACKUP_SCHEMA_VERSION } from '@services/export/jsonExport';
import { assessFolderCopy, readFolderCopy, unlockFolderCopy, type FolderCopySource } from './folderCopy';
import { sealEnvelope } from './folderEnvelope';
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

  it('reports a copy without a readable save date as not a copy', async () => {
    const key = await newKey();
    const undated = { version: SYNC_FILE_VERSION, exportedAt: 'yesterday-ish', data: STORED };

    expect(await readFolderCopy(await sealed(undated, key), key)).toEqual({
      status: 'unreadable',
      reason: 'not-a-copy',
    });
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

    const result = await unlockFolderCopy(bytes, PASSWORD);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lock).toEqual(credentials);
    expect(result.revision).toBe('r9');
    expect(result.copy.labResults).toHaveLength(1);
    expect(result.key.extractable).toBe(false);
    // The key the copy's records were sealed with
    const probe = await encrypt(new TextEncoder().encode('probe').buffer as ArrayBuffer, key);
    expect(new TextDecoder().decode(await decrypt(probe, result.key))).toBe('probe');
  });

  it('a wrong password is wrong-password', async () => {
    const { bytes } = await lockedCopy();

    expect(await unlockFolderCopy(bytes, 'Not-The-Passw0rd!')).toEqual({ ok: false, problem: 'wrong-password' });
  });

  it('a legacy copy is no-lock', async () => {
    const legacy = await sealed(copy(), await newKey());
    const lockless = await sealEnvelope(new TextEncoder().encode(JSON.stringify(copy())), await newKey(), null);

    expect(await unlockFolderCopy(legacy, PASSWORD)).toEqual({ ok: false, problem: 'no-lock' });
    expect(await unlockFolderCopy(lockless, PASSWORD)).toEqual({ ok: false, problem: 'no-lock' });
  });

  it('no bytes is no-copy', async () => {
    expect(await unlockFolderCopy(null, PASSWORD)).toEqual({ ok: false, problem: 'no-copy' });
  });

  it('a damaged body under a valid lock is cannot-decrypt', async () => {
    const { bytes } = await lockedCopy();
    const file = JSON.parse(new TextDecoder().decode(bytes)) as { sealed: string };
    // Another body under the same lock: valid base64, but not what the lock was sealed with
    const other = await sealed(copy(), await newKey());
    const swapped = { ...file, sealed: btoa(String.fromCharCode(...new Uint8Array(other))) };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await unlockFolderCopy(new TextEncoder().encode(JSON.stringify(swapped)).buffer as ArrayBuffer, PASSWORD);

    expect(result).toEqual({ ok: false, problem: 'cannot-decrypt' });
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('a lock with more iterations than any setup uses is not-a-copy, and never tried', async () => {
    const { bytes } = await lockedCopy();
    const file = JSON.parse(new TextDecoder().decode(bytes)) as { lock: object };
    const planted = { ...file, lock: { ...file.lock, iterations: 1e10 } };
    const unwrap = vi.spyOn(crypto.subtle, 'deriveKey');

    const result = await unlockFolderCopy(new TextEncoder().encode(JSON.stringify(planted)).buffer as ArrayBuffer, PASSWORD);

    expect(result).toEqual({ ok: false, problem: 'not-a-copy' });
    expect(unwrap).not.toHaveBeenCalled();
    unwrap.mockRestore();
  });

  it('a damaged header is not-a-copy, and a lock that is not v2 is never tried', async () => {
    const { bytes } = await lockedCopy();
    const file = JSON.parse(new TextDecoder().decode(bytes)) as { lock: object };
    const badLock = { ...file, lock: { ...file.lock, version: 3 } };

    const result = await unlockFolderCopy(new TextEncoder().encode(JSON.stringify(badLock)).buffer as ArrayBuffer, PASSWORD);

    expect(result).toEqual({ ok: false, problem: 'not-a-copy' });
  });
});
