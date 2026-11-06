import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { notifyFolderAccessChanged, notifyFolderBackupsChanged } from '@data/storage/folderAccessEvents';
import { createCredentialsV2 } from '@data/encryption/keyWrapping';
import { backupKind, readFolderCopy, sealFolderCopy } from '@services/sync';
import { readEnvelopeHeader } from '@services/sync/folderEnvelope';
import { useFolderBackups } from './useFolderBackups';

const listBackups = vi.fn<() => Promise<string[]>>();
const loadBackup = vi.fn<(name: string) => Promise<ArrayBuffer>>();
const loadCurrent = vi.fn<() => Promise<ArrayBuffer | null>>();
const saveBackup = vi.fn<(name: string, bytes: ArrayBuffer) => Promise<void>>();
const deleteBackup = vi.fn<(name: string) => Promise<void>>();

vi.mock('@data/storage/FileSystemStorageProvider', () => ({
  FileSystemStorageProvider: class {
    listBackups = listBackups;
    loadBackup = loadBackup;
    loadCurrent = loadCurrent;
    saveBackup = saveBackup;
    deleteBackup = deleteBackup;
  },
}));

vi.mock('@services/sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@services/sync')>()),
  readFolderCopy: vi.fn(),
}));

let KEY: CryptoKey;
vi.mock('@contexts', () => ({
  useAuth: () => ({ encryptionKey: KEY }),
}));

const OLDER = 'hemoio-backup-20261101T090000000Z.encrypted';
const NEWER = 'hemoio-backup-20261105T090000000Z.encrypted';
const AUTO = 'hemoio-autobackup-20261103T090000000Z.encrypted';

describe('useFolderBackups', () => {
  beforeAll(async () => {
    KEY = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    saveBackup.mockResolvedValue(undefined);
    deleteBackup.mockResolvedValue(undefined);
    listBackups.mockResolvedValue([OLDER, 'notes.txt', AUTO, NEWER, 'hemoio-backup-bad.encrypted']);
  });

  it('lists newest first, both kinds, skipping names that are not backups', async () => {
    const { result } = renderHook(() => useFolderBackups());

    await waitFor(() => expect(result.current.backups).toHaveLength(3));
    expect(result.current.backups.map((b) => [b.name, b.kind])).toEqual([
      [NEWER, 'conflict'],
      [AUTO, 'before-load'],
      [OLDER, 'conflict'],
    ]);
    expect(result.current.backups[0].savedAt).toEqual(new Date('2026-11-05T09:00:00.000Z'));
  });

  it('refreshes on folder access change and when backups change', async () => {
    const { result } = renderHook(() => useFolderBackups());
    await waitFor(() => expect(result.current.backups).toHaveLength(3));

    listBackups.mockResolvedValue([OLDER]);
    act(() => notifyFolderBackupsChanged());
    await waitFor(() => expect(result.current.backups).toHaveLength(1));

    listBackups.mockResolvedValue([OLDER, NEWER]);
    act(() => notifyFolderAccessChanged());
    await waitFor(() => expect(result.current.backups).toHaveLength(2));
  });

  it('lists none when the folder cannot be listed', async () => {
    listBackups.mockRejectedValue(new Error('no access'));
    const { result } = renderHook(() => useFolderBackups());

    await waitFor(() => expect(listBackups).toHaveBeenCalled());
    expect(result.current.backups).toEqual([]);
  });

  it('reads a backup with the session key', async () => {
    const bytes = new ArrayBuffer(4);
    loadBackup.mockResolvedValue(bytes);
    const reading = { status: 'unreadable', reason: 'not-a-copy' } as const;
    vi.mocked(readFolderCopy).mockResolvedValue(reading);
    const { result } = renderHook(() => useFolderBackups());
    await waitFor(() => expect(result.current.backups).toHaveLength(3));

    await expect(result.current.read(NEWER)).resolves.toBe(reading);
    expect(loadBackup).toHaveBeenCalledWith(NEWER);
    expect(readFolderCopy).toHaveBeenCalledWith(bytes, KEY);
  });

  it('reports a backup that cannot be loaded as unreadable', async () => {
    loadBackup.mockRejectedValue(new Error('No such backup'));
    const { result } = renderHook(() => useFolderBackups());
    await waitFor(() => expect(result.current.backups).toHaveLength(3));

    await expect(result.current.read(NEWER)).resolves.toEqual({ status: 'unreadable', reason: 'read-failed' });
  });

  it('keepCurrentCopy saves the current copy as a dated conflict backup, without its lock', async () => {
    const { credentials } = await createCredentialsV2('Passw0rd!', 1000);
    const { bytes } = await sealFolderCopy({ labResults: [], testValues: [], userNotes: [], settings: undefined, preferences: undefined }, KEY, credentials);
    expect(readEnvelopeHeader(bytes)).toMatchObject({ lock: expect.anything() });
    loadCurrent.mockResolvedValue(bytes);
    const { result } = renderHook(() => useFolderBackups());
    await waitFor(() => expect(result.current.backups).toHaveLength(3));

    await result.current.keepCurrentCopy();

    expect(saveBackup).toHaveBeenCalledTimes(1);
    const [name, saved] = saveBackup.mock.calls[0];
    expect(backupKind(name)).toBe('conflict');
    expect(readEnvelopeHeader(saved)).toMatchObject({ lock: null });
  });

  it('keepCurrentCopy rejects when the copy cannot be kept', async () => {
    const { bytes } = await sealFolderCopy({ labResults: [], testValues: [], userNotes: [], settings: undefined, preferences: undefined }, KEY, null);
    loadCurrent.mockResolvedValue(bytes);
    saveBackup.mockRejectedValue(new Error('full'));
    const { result } = renderHook(() => useFolderBackups());
    await waitFor(() => expect(result.current.backups).toHaveLength(3));

    await expect(result.current.keepCurrentCopy()).rejects.toThrow();
  });

  it('keepCurrentCopy never prunes the backup it is told to protect', async () => {
    const { bytes } = await sealFolderCopy({ labResults: [], testValues: [], userNotes: [], settings: undefined, preferences: undefined }, KEY, null);
    loadCurrent.mockResolvedValue(bytes);
    const names = Array.from({ length: 10 }, (_, i) => `hemoio-backup-202001${String(i + 1).padStart(2, '0')}T090000000Z.encrypted`);
    listBackups.mockResolvedValue(names);
    const { result } = renderHook(() => useFolderBackups());
    await waitFor(() => expect(result.current.backups).toHaveLength(10));
    await result.current.keepCurrentCopy([names[0]]);

    expect(deleteBackup).not.toHaveBeenCalled();
  });

  it('says whether the current copy can be kept', async () => {
    const { bytes } = await sealFolderCopy({ labResults: [], testValues: [], userNotes: [], settings: undefined, preferences: undefined }, KEY, null);
    const { result } = renderHook(() => useFolderBackups());
    await waitFor(() => expect(result.current.backups).toHaveLength(3));

    loadCurrent.mockResolvedValue(bytes);
    await expect(result.current.canKeepCurrentCopy()).resolves.toBe(true);
    loadCurrent.mockResolvedValue(null);
    await expect(result.current.canKeepCurrentCopy()).resolves.toBe(false);
  });
});
