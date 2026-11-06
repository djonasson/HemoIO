import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { encrypt } from '@data/encryption';
import { createCredentialsV2, type StoredCredentialsV2 } from '@data/encryption/keyWrapping';
import { markFolderCopySeen, sealFolderCopy, type FolderUnlockProblem } from '@services/sync';
import { restoreBackup } from '@services/import';
import { notifications } from '@mantine/notifications';
import { useFolderRecovery } from './useFolderRecovery';
import type { SetupOutcome } from '@contexts/AuthContext';

const selectDirectory = vi.fn<(options?: { persist?: boolean }) => Promise<{ name: string } | null>>();
const loadCurrent = vi.fn<() => Promise<ArrayBuffer | null>>();
const persistDirectory = vi.fn<() => Promise<void>>();
vi.mock('@data/storage/FileSystemStorageProvider', () => ({
  FileSystemStorageProvider: class {
    selectDirectory = selectDirectory;
    loadCurrent = loadCurrent;
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
const db = { hasLabData };
vi.mock('@data/db', () => ({
  createEncryptedDb: vi.fn(() => db),
}));

vi.mock('@services/import', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@services/import')>()),
  restoreBackup: vi.fn(),
}));
vi.mock('@services/sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@services/sync')>()),
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
  });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    selectDirectory.mockResolvedValue({ name: 'Lab Folder' });
    loadCurrent.mockResolvedValue(COPY);
    hasLabData.mockResolvedValue(false);
    persistDirectory.mockResolvedValue(undefined);
    // As AuthContext does: save, onSaved, sweep, prepare with the key, then unlock
    recoverFromFolder.mockImplementation(async (_lock, key, prepare, onSaved) => {
      await onSaved?.();
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
