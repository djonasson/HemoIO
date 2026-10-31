import { describe, it, expect, vi } from 'vitest';
import { encrypt } from '@data/encryption';
import { BACKUP_SCHEMA_VERSION } from '@services/export/jsonExport';
import { assessFolderCopy, readFolderCopy, type FolderCopySource } from './folderCopy';
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
      biomarkerKey: 'glucose',
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

  it('reads a format 1 copy, whose values name biomarkers by dictionary position', async () => {
    const key = await newKey();
    const v1 = {
      ...STORED,
      testValues: [{ ...STORED.testValues[0], biomarkerKey: undefined, biomarkerId: 22, rawText: 'Glucose' }],
    };

    const reading = await readFolderCopy(await sealed(copy(v1, 1), key), key);

    expect(reading.status).toBe('readable');
    if (reading.status !== 'readable') return;
    expect(reading.data.testValues[0].biomarkerKey).toBe('glucose');
  });

  it('refiles urea saved as blood urea nitrogen in a format 2 copy, but not in a format 3 one', async () => {
    const key = await newKey();
    const urea = {
      ...STORED,
      testValues: [{ ...STORED.testValues[0], biomarkerKey: 'blood-urea-nitrogen', rawText: 'Urea', unit: 'mg/dL' }],
    };

    const v2 = await readFolderCopy(await sealed(copy(urea, 2), key), key);
    const v3 = await readFolderCopy(await sealed(copy(urea, 3), key), key);

    expect(v2.status === 'readable' && v2.data.testValues[0].biomarkerKey).toBe('urea');
    expect(v3.status === 'readable' && v3.data.testValues[0].biomarkerKey).toBe('blood-urea-nitrogen');
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
