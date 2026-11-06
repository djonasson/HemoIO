import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { encrypt } from '@data/encryption';
import { createCredentialsV2, type StoredCredentialsV2 } from '@data/encryption/keyWrapping';
import { FOLDER_SYNC_FILE_VERSION, readFolderCopy, sealFolderCopy, type FolderUnlockProblem } from '@services/sync';
import { markFolderCopySeen } from '@services/sync/folderSync';
import { backupKind } from '@services/sync/folderBackups';
import { readEnvelopeHeader, sealEnvelope } from '@services/sync/folderEnvelope';
import { readLockFile } from '@services/sync/folderLockFile';
import { restoreBackup } from '@services/import';
import { notifications } from '@mantine/notifications';
import { useFolderRecovery } from './useFolderRecovery';
import type { SetupOutcome } from '@contexts/AuthContext';

const selectDirectory = vi.fn<(options?: { persist?: boolean }) => Promise<{ name: string } | null>>();
const loadCurrent = vi.fn<() => Promise<ArrayBuffer | null>>();
const loadPrevious = vi.fn<() => Promise<ArrayBuffer | null>>();
const listBackups = vi.fn<() => Promise<string[]>>();
const loadBackup = vi.fn<(name: string) => Promise<ArrayBuffer>>();
const loadLock = vi.fn<() => Promise<ArrayBuffer | null>>();
const saveLock = vi.fn<(bytes: ArrayBuffer) => Promise<void>>();
const save = vi.fn<(bytes: ArrayBuffer, previous?: ArrayBuffer) => Promise<void>>();
const saveBackup = vi.fn<(name: string, bytes: ArrayBuffer) => Promise<void>>();
const deleteBackup = vi.fn<(name: string) => Promise<void>>();
const persistDirectory = vi.fn<() => Promise<void>>();
vi.mock('@data/storage/FileSystemStorageProvider', () => ({
  FileSystemStorageProvider: class {
    selectDirectory = selectDirectory;
    loadCurrent = loadCurrent;
    loadPrevious = loadPrevious;
    listBackups = listBackups;
    loadBackup = loadBackup;
    loadLock = loadLock;
    saveLock = saveLock;
    save = save;
    saveBackup = saveBackup;
    deleteBackup = deleteBackup;
    persistDirectory = persistDirectory;
  },
}));

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn() },
}));

const recoverFromFolder =
  vi.fn<
    (
      lock: StoredCredentialsV2,
      key: CryptoKey,
      prepare?: (key: CryptoKey) => Promise<void>,
      onSaved?: () => Promise<void>
    ) => Promise<SetupOutcome>
  >();
vi.mock('@contexts', () => ({
  useAuth: () => ({ recoverFromFolder }),
}));

const hasLabData = vi.fn<() => Promise<boolean>>();
const exportAllData = vi.fn();
const db = { hasLabData, exportAllData };
vi.mock('@data/db', () => ({
  createEncryptedDb: vi.fn(() => db),
}));

vi.mock('@services/import', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@services/import')>()),
  restoreBackup: vi.fn(),
}));
// Where the recovery service takes it from
vi.mock('@services/sync/folderSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@services/sync/folderSync')>()),
  markFolderCopySeen: vi.fn(),
}));

const PASSWORD = 'Folder-Passw0rd!';
const CREDENTIALS_KEY = 'hemoio_credentials';

const FOLDER_DATA = {
  labResults: [
    {
      id: 1,
      date: '2024-01-15T10:00:00.000Z',
      labName: 'Quest Diagnostics',
      createdAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-15T10:00:00.000Z',
    },
  ],
  testValues: [],
  userNotes: [],
  settings: undefined,
  preferences: undefined,
};

let LOCK: StoredCredentialsV2;
let providerAtSweep: string | null = null;
let persistedAtSweep = false;
let COPY: ArrayBuffer;
let REVISION: string;
let DATA_KEY: CryptoKey;

/** The copy with its lock intact and its sealed body damaged */
function damaged(bytes: ArrayBuffer): ArrayBuffer {
  const file = JSON.parse(new TextDecoder().decode(bytes)) as { sealed: string };
  return new TextEncoder().encode(JSON.stringify({ ...file, sealed: `${file.sealed[0] === 'A' ? 'B' : 'A'}${file.sealed.slice(1)}` }))
    .buffer as ArrayBuffer;
}

/** An earlier copy of the same data, as sync keeps the previous copy and backups: without the lock */
async function withoutLock(key: CryptoKey, exportedAt = '2026-11-02T09:30:00.000Z'): Promise<ArrayBuffer> {
  const body = { version: FOLDER_SYNC_FILE_VERSION, exportedAt, revision: 'earlier-rev', ancestors: [], data: FOLDER_DATA };
  return sealEnvelope(new TextEncoder().encode(JSON.stringify(body)), key, null);
}

/** The hook, with the folder chosen */
async function chosen() {
  const hook = renderHook(() => useFolderRecovery());
  await act(() => hook.result.current.chooseFolder());
  return hook;
}

type RecoverResult = FolderUnlockProblem | 'existing-locked' | null;

async function recover(hook: Awaited<ReturnType<typeof chosen>>, password = PASSWORD): Promise<RecoverResult> {
  let problem: RecoverResult = null;
  await act(async () => {
    problem = await hook.result.current.recover(password);
  });
  return problem;
}

describe('useFolderRecovery', () => {
  beforeAll(async () => {
    const { credentials, key } = await createCredentialsV2(PASSWORD, 1000);
    LOCK = credentials;
    const sealed = await sealFolderCopy(FOLDER_DATA as never, key, credentials);
    COPY = sealed.bytes;
    REVISION = sealed.revision;
    DATA_KEY = key;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    selectDirectory.mockResolvedValue({ name: 'Lab Folder' });
    loadCurrent.mockResolvedValue(COPY);
    loadPrevious.mockResolvedValue(null);
    listBackups.mockResolvedValue([]);
    loadLock.mockResolvedValue(null);
    saveLock.mockResolvedValue(undefined);
    save.mockResolvedValue(undefined);
    saveBackup.mockResolvedValue(undefined);
    deleteBackup.mockResolvedValue(undefined);
    exportAllData.mockResolvedValue(FOLDER_DATA);
    hasLabData.mockResolvedValue(false);
    persistDirectory.mockResolvedValue(undefined);
    // As AuthContext does: save, onSaved (a failure logged and passed over), sweep, prepare with the key, then unlock
    recoverFromFolder.mockImplementation(async (_lock, key, prepare, onSaved) => {
      await onSaved?.().catch(() => console.error('Could not keep the folder choice'));
      providerAtSweep = localStorage.getItem('hemoio_storage_provider');
      persistedAtSweep = persistDirectory.mock.calls.length > 0;
      await prepare?.(key);
      return 'created';
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('names the folder once chosen, and nothing when the picker is cancelled', async () => {
    const hook = await chosen();
    expect(hook.result.current.folderName).toBe('Lab Folder');

    selectDirectory.mockResolvedValue(null);
    await act(() => hook.result.current.chooseFolder());
    expect(hook.result.current.folderName).toBe('Lab Folder');
  });

  it('restores the copy into an empty browser and records its revision', async () => {
    const hook = await chosen();

    expect(await recover(hook)).toBeNull();

    expect(recoverFromFolder).toHaveBeenCalledWith(LOCK, expect.any(Object), expect.any(Function), expect.any(Function));
    const key = recoverFromFolder.mock.calls[0][1];
    expect(localStorage.getItem('hemoio_storage_provider')).toBe('filesystem');
    expect(restoreBackup).toHaveBeenCalledWith(db, expect.objectContaining({ labResults: [expect.objectContaining({ labName: 'Quest Diagnostics' })] }));
    expect(markFolderCopySeen).toHaveBeenCalledWith(db, key, REVISION);
    // Seen only once restored: the next sync then finds nothing new
    expect(vi.mocked(restoreBackup).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(markFolderCopySeen).mock.invocationCallOrder[0]
    );
  });

  it('keeps the lock file beside the copy, and leaves the copy as it is', async () => {
    const hook = await chosen();

    expect(await recover(hook)).toBeNull();

    expect(saveLock).toHaveBeenCalledTimes(1);
    expect(readLockFile(saveLock.mock.calls[0][0])).toEqual(LOCK);
    expect(save).not.toHaveBeenCalled();
  });

  it('a damaged copy is recovered from the previous copy: lock stored, data restored, a new copy written and seen', async () => {
    loadCurrent.mockResolvedValue(damaged(COPY));
    loadPrevious.mockResolvedValue(await withoutLock(DATA_KEY));
    const hook = await chosen();

    expect(await recover(hook)).toBeNull();

    expect(recoverFromFolder).toHaveBeenCalledWith(LOCK, expect.any(Object), expect.any(Function), expect.any(Function));
    const key = recoverFromFolder.mock.calls[0][1];
    expect(restoreBackup).toHaveBeenCalledWith(db, expect.objectContaining({ labResults: [expect.objectContaining({ labName: 'Quest Diagnostics' })] }));
    // The damaged copy is replaced by this browser's data, carrying the lock, built on the copy restored
    expect(save).toHaveBeenCalledTimes(1);
    const [written, previous] = save.mock.calls[0];
    expect(previous).toBeUndefined();
    expect(readEnvelopeHeader(written)).toMatchObject({ lock: LOCK });
    const reading = await readFolderCopy(written, key);
    expect(reading).toMatchObject({ status: 'readable' });
    const revision = reading.status === 'readable' ? reading.revision : null;
    expect(revision).not.toBe('earlier-rev');
    expect(markFolderCopySeen).toHaveBeenCalledWith(db, key, revision);
    expect(readLockFile(saveLock.mock.calls[0][0])).toEqual(LOCK);
    expect(vi.mocked(saveLock).mock.invocationCallOrder[0]).toBeLessThan(save.mock.invocationCallOrder[0]);
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Restored from an earlier copy',
        message: expect.stringMatching(/previous copy saved on Nov 2, 2026.*It is now your folder copy\./),
      })
    );
  });

  it('keeps the damaged copy as a raw conflict backup before writing the new copy', async () => {
    const damagedCopy = damaged(COPY);
    loadCurrent.mockResolvedValue(damagedCopy);
    loadPrevious.mockResolvedValue(await withoutLock(DATA_KEY));
    const hook = await chosen();

    expect(await recover(hook)).toBeNull();

    expect(saveBackup).toHaveBeenCalledTimes(1);
    const [name, kept] = saveBackup.mock.calls[0];
    expect(backupKind(name)).toBe('conflict');
    // As it lay in the folder: it cannot be sealed again
    expect(new Uint8Array(kept)).toEqual(new Uint8Array(damagedCopy));
    expect(saveBackup.mock.invocationCallOrder[0]).toBeLessThan(save.mock.invocationCallOrder[0]);
  });

  it('a damaged copy that cannot be kept as a backup is not written over', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    loadCurrent.mockResolvedValue(damaged(COPY));
    loadPrevious.mockResolvedValue(await withoutLock(DATA_KEY));
    saveBackup.mockRejectedValueOnce(new Error('/home/someone/Lab Folder is full'));
    const hook = await chosen();

    expect(await recover(hook)).toBeNull();

    expect(save).not.toHaveBeenCalled();
    expect(restoreBackup).toHaveBeenCalled();
    expect(markFolderCopySeen).toHaveBeenCalledWith(db, expect.any(Object), 'earlier-rev');
    expect(error).toHaveBeenCalledWith('Could not replace the damaged folder copy');
    expect(JSON.stringify(error.mock.calls)).not.toContain('someone');
    error.mockRestore();
  });

  it('never prunes the backup it restored from to make room for the damaged copy', async () => {
    const names = Array.from({ length: 10 }, (_, i) => `hemoio-backup-202611${String(i + 1).padStart(2, '0')}T090000000Z.encrypted`);
    const restoredFrom = names[0];
    loadCurrent.mockResolvedValueOnce(null).mockResolvedValue(damaged(COPY));
    loadLock.mockResolvedValue(new TextEncoder().encode(JSON.stringify({ format: 'hemoio-folder-lock', version: 1, lock: LOCK })).buffer as ArrayBuffer);
    listBackups.mockResolvedValue(names);
    // Only the oldest opens
    loadBackup.mockImplementation(async (name) =>
      name === restoredFrom ? withoutLock(DATA_KEY) : new Uint8Array([1, 2, 3]).buffer as ArrayBuffer
    );
    const hook = await chosen();

    expect(await recover(hook)).toBeNull();

    expect(saveBackup).toHaveBeenCalledTimes(1);
    expect(deleteBackup).not.toHaveBeenCalledWith(restoredFrom);
  });

  it('a missing copy is recovered from a backup with the lock file, and the notice names the backup', async () => {
    loadCurrent.mockResolvedValue(null);
    loadLock.mockResolvedValue(new TextEncoder().encode(JSON.stringify({ format: 'hemoio-folder-lock', version: 1, lock: LOCK })).buffer as ArrayBuffer);
    listBackups.mockResolvedValue(['hemoio-backup-20261103T090000000Z.encrypted']);
    loadBackup.mockResolvedValue(await withoutLock(DATA_KEY, '2026-11-03T09:00:00.000Z'));
    const hook = await chosen();

    expect(await recover(hook)).toBeNull();

    expect(recoverFromFolder).toHaveBeenCalledWith(LOCK, expect.any(Object), expect.any(Function), expect.any(Function));
    expect(restoreBackup).toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/backup saved on Nov 3, 2026/) })
    );
  });

  it('a planted lock file whose key opens nothing stores nothing', async () => {
    const planted = await createCredentialsV2(PASSWORD, 1000);
    loadCurrent.mockResolvedValue(null);
    loadLock.mockResolvedValue(
      new TextEncoder().encode(JSON.stringify({ format: 'hemoio-folder-lock', version: 1, lock: planted.credentials })).buffer as ArrayBuffer
    );
    listBackups.mockResolvedValue(['hemoio-backup-20261103T090000000Z.encrypted']);
    loadBackup.mockResolvedValue(await withoutLock(DATA_KEY));
    const hook = await chosen();

    expect(await recover(hook)).toBe('cannot-decrypt');

    expect(recoverFromFolder).not.toHaveBeenCalled();
    expect(localStorage.getItem(CREDENTIALS_KEY)).toBeNull();
    expect(localStorage.getItem('hemoio_storage_provider')).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(saveLock).not.toHaveBeenCalled();
  });

  it('a failed write of the new copy still leaves the data restored and seen as the copy restored', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    loadCurrent.mockResolvedValue(damaged(COPY));
    loadPrevious.mockResolvedValue(await withoutLock(DATA_KEY));
    save.mockRejectedValueOnce(new Error('/home/someone/Lab Folder is read-only'));
    const hook = await chosen();

    expect(await recover(hook)).toBeNull();

    expect(restoreBackup).toHaveBeenCalled();
    expect(markFolderCopySeen).toHaveBeenCalledWith(db, expect.any(Object), 'earlier-rev');
    expect(notifications.show).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Folder copy not restored' }));
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.not.stringContaining('It is now your folder copy') })
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain('someone');
    error.mockRestore();
  });

  it('chooses folder storage and keeps the folder before the sweep, once the copy has opened', async () => {
    const hook = await chosen();
    expect(selectDirectory).toHaveBeenCalledWith({ persist: false });
    expect(persistDirectory).not.toHaveBeenCalled();

    expect(await recover(hook)).toBeNull();

    // So a reload during the sweep or the restore leaves HemoIO on this folder
    expect(providerAtSweep).toBe('filesystem');
    expect(persistedAtSweep).toBe(true);
  });

  it('a failed restore says so, logging no detail', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(restoreBackup).mockRejectedValueOnce(new Error('Glucose 95 mg/dL'));
    const hook = await chosen();

    expect(await recover(hook)).toBeNull();

    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Folder copy not restored', autoClose: false })
    );
    expect(markFolderCopySeen).not.toHaveBeenCalled();
    expect(JSON.stringify(error.mock.calls)).not.toContain('Glucose');
    error.mockRestore();
  });

  it('a failed save of the folder choice says only that, when the copy is restored', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    persistDirectory.mockRejectedValueOnce(new Error('/home/someone/Lab Folder'));
    const hook = await chosen();

    expect(await recover(hook)).toBeNull();

    expect(restoreBackup).toHaveBeenCalled();
    expect(notifications.show).toHaveBeenCalledTimes(1);
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Folder not remembered',
        message: expect.stringContaining('your folder copy is loaded'),
        autoClose: false,
      })
    );
    expect(notifications.show).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Folder copy not restored' })
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain('someone');
    error.mockRestore();
  });

  it('leaves browser data for the conflict check', async () => {
    hasLabData.mockResolvedValue(true);
    const hook = await chosen();

    expect(await recover(hook)).toBeNull();

    expect(localStorage.getItem('hemoio_storage_provider')).toBe('filesystem');
    expect(restoreBackup).not.toHaveBeenCalled();
    expect(markFolderCopySeen).not.toHaveBeenCalled();
  });

  describe('no credentials are stored when the copy cannot be opened', () => {
    it.each([
      ['no-copy', async (): Promise<ArrayBuffer | null> => null],
      [
        'no-lock',
        async (): Promise<ArrayBuffer | null> => {
          const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt']);
          return encrypt(new TextEncoder().encode('{}').buffer as ArrayBuffer, key);
        },
      ],
      [
        'not-a-copy',
        async (): Promise<ArrayBuffer | null> =>
          new TextEncoder().encode('{"format":"hemoio-folder-copy","version":9}').buffer as ArrayBuffer,
      ],
    ] as const)('%s', async (problem, bytes) => {
      loadCurrent.mockResolvedValue(await bytes());
      const hook = await chosen();

      expect(await recover(hook)).toBe(problem);

      expect(recoverFromFolder).not.toHaveBeenCalled();
      expect(localStorage.getItem(CREDENTIALS_KEY)).toBeNull();
      expect(localStorage.getItem('hemoio_storage_provider')).toBeNull();
      expect(persistDirectory).not.toHaveBeenCalled();
    });

    it('wrong-password', async () => {
      const hook = await chosen();

      expect(await recover(hook, 'Not-The-Passw0rd!')).toBe('wrong-password');

      expect(recoverFromFolder).not.toHaveBeenCalled();
      expect(persistDirectory).not.toHaveBeenCalled();
      expect(localStorage.getItem(CREDENTIALS_KEY)).toBeNull();
    });

    it('cannot-decrypt', async () => {
      const file = JSON.parse(new TextDecoder().decode(COPY)) as { sealed: string };
      const flipped = { ...file, sealed: `${file.sealed[0] === 'A' ? 'B' : 'A'}${file.sealed.slice(1)}` };
      loadCurrent.mockResolvedValue(new TextEncoder().encode(JSON.stringify(flipped)).buffer as ArrayBuffer);
      const hook = await chosen();

      expect(await recover(hook)).toBe('cannot-decrypt');

      expect(recoverFromFolder).not.toHaveBeenCalled();
      expect(localStorage.getItem(CREDENTIALS_KEY)).toBeNull();
    });

    it('read-failed, logging nothing', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      loadCurrent.mockRejectedValue(new Error('/home/someone/Health is gone'));
      const hook = await chosen();

      expect(await recover(hook)).toBe('read-failed');

      expect(recoverFromFolder).not.toHaveBeenCalled();
      expect(localStorage.getItem(CREDENTIALS_KEY)).toBeNull();
      expect(error).not.toHaveBeenCalled();
      error.mockRestore();
    });
  });

  it('returns existing-locked when another tab set up first', async () => {
    recoverFromFolder.mockResolvedValue('existing-locked');
    const hook = await chosen();

    expect(await recover(hook)).toBe('existing-locked');

    expect(restoreBackup).not.toHaveBeenCalled();
    // The other tab's folder choice is left as it is
    expect(persistDirectory).not.toHaveBeenCalled();
  });
});
