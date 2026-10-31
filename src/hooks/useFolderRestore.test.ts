import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { notifyFolderAccessChanged } from '@data/storage/folderAccessEvents';
import { assessFolderCopy, type FolderCopyAssessment } from '@services/sync';
import type { ParsedBackupData } from '@services/import';
import { useFolderRestore } from './useFolderRestore';

vi.mock('@/utils/fileSystemSupport', () => ({
  isFileSystemAccessSupported: vi.fn(() => true),
}));

const permission = vi.fn<() => Promise<string | null>>();
const providerCreated = vi.fn();

vi.mock('@data/storage/FileSystemStorageProvider', () => ({
  FileSystemStorageProvider: class {
    getPermissionState = permission;
    getDirectoryName = vi.fn(async () => 'Health');
    loadCurrent = vi.fn();
    constructor() {
      providerCreated();
    }
  },
}));

vi.mock('@services/sync', () => ({
  assessFolderCopy: vi.fn(),
}));

const hasLabData = vi.fn<() => Promise<boolean>>();
const KEY = {} as CryptoKey;
// The same instance on every render, as the real hook memoizes it
const DB = { hasLabData };

vi.mock('./useEncryptedDb', () => ({
  useEncryptedDb: () => ({ db: DB, isReady: true }),
}));

vi.mock('@contexts', () => ({
  useAuth: () => ({ encryptionKey: KEY }),
}));

const STORAGE_PROVIDER_KEY = 'hemoio_storage_provider';
const COPY = { labResults: [{}], testValues: [], userNotes: [] } as unknown as ParsedBackupData;

function assessAs(assessment: FolderCopyAssessment): void {
  vi.mocked(assessFolderCopy).mockResolvedValue(assessment);
}

describe('useFolderRestore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem(STORAGE_PROVIDER_KEY, 'filesystem');
    permission.mockResolvedValue('granted');
    hasLabData.mockResolvedValue(false);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('allows sync straight away when data is kept in the browser only', () => {
    localStorage.setItem(STORAGE_PROVIDER_KEY, 'local');

    const { result } = renderHook(() => useFolderRestore());

    expect(result.current.syncAllowed).toBe(true);
    expect(result.current.prompt).toBeNull();
    expect(providerCreated).not.toHaveBeenCalled();
  });

  it('holds sync while it checks, and allows it when nothing in the folder is at risk', async () => {
    assessAs({ kind: 'sync' });

    const { result } = renderHook(() => useFolderRestore());

    expect(result.current.syncAllowed).toBe(false);
    await waitFor(() => expect(result.current.syncAllowed).toBe(true));
    expect(result.current.prompt).toBeNull();
    expect(assessFolderCopy).toHaveBeenCalledWith(expect.anything(), KEY);
  });

  it('allows sync without reading the folder when the browser has data', async () => {
    hasLabData.mockResolvedValue(true);

    const { result } = renderHook(() => useFolderRestore());

    await waitFor(() => expect(result.current.syncAllowed).toBe(true));
    expect(assessFolderCopy).not.toHaveBeenCalled();
  });

  it('offers the copy, with the folder name, and holds sync until the user decides', async () => {
    assessAs({ kind: 'offer', data: COPY });

    const { result } = renderHook(() => useFolderRestore());

    await waitFor(() =>
      expect(result.current.prompt).toEqual({
        kind: 'offer',
        data: COPY,
        folderName: 'Health',
        replacesBrowserData: false,
      })
    );
    expect(result.current.syncAllowed).toBe(false);

    act(() => result.current.decide('sync'));

    expect(result.current.prompt).toBeNull();
    expect(result.current.syncAllowed).toBe(true);
  });

  it('reports a copy it cannot read', async () => {
    assessAs({ kind: 'unreadable', reason: 'cannot-decrypt' });

    const { result } = renderHook(() => useFolderRestore());

    await waitFor(() =>
      expect(result.current.prompt).toEqual({
        kind: 'unreadable',
        reason: 'cannot-decrypt',
        folderName: 'Health',
      })
    );
  });

  it('"Not now" closes the prompt and keeps sync held', async () => {
    assessAs({ kind: 'offer', data: COPY });
    const { result } = renderHook(() => useFolderRestore());
    await waitFor(() => expect(result.current.prompt).not.toBeNull());

    act(() => result.current.decide('hold'));

    expect(result.current.prompt).toBeNull();
    expect(result.current.syncAllowed).toBe(false);
  });

  it('waits for folder access, then checks', async () => {
    permission.mockResolvedValue('prompt');
    assessAs({ kind: 'offer', data: COPY });
    const { result } = renderHook(() => useFolderRestore());
    await waitFor(() => expect(permission).toHaveBeenCalled());
    expect(assessFolderCopy).not.toHaveBeenCalled();
    expect(result.current.syncAllowed).toBe(false);

    permission.mockResolvedValue('granted');
    act(() => notifyFolderAccessChanged());

    await waitFor(() => expect(result.current.prompt?.kind).toBe('offer'));
  });

  it('checks again, holding sync, when another folder is chosen', async () => {
    assessAs({ kind: 'sync' });
    const { result } = renderHook(() => useFolderRestore());
    await waitFor(() => expect(result.current.syncAllowed).toBe(true));

    assessAs({ kind: 'offer', data: COPY });
    act(() => notifyFolderAccessChanged());

    expect(result.current.syncAllowed).toBe(false);
    await waitFor(() => expect(result.current.prompt?.kind).toBe('offer'));
  });

  it('keeps sync held when the browser cannot be checked, without logging why', async () => {
    hasLabData.mockRejectedValue(new Error('Glucose 95 mg/dL'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useFolderRestore());

    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(error.mock.calls.flat().join(' ')).not.toContain('Glucose');
    expect(result.current.syncAllowed).toBe(false);
    expect(result.current.prompt).toBeNull();
    error.mockRestore();
  });

  it('still asks when the browser, empty at unlock, gained data before folder access, and says so', async () => {
    permission.mockResolvedValue('prompt');
    assessAs({ kind: 'offer', data: COPY });
    const { result } = renderHook(() => useFolderRestore());
    await waitFor(() => expect(permission).toHaveBeenCalled());

    // An import while folder access waits
    hasLabData.mockResolvedValue(true);
    permission.mockResolvedValue('granted');
    act(() => notifyFolderAccessChanged());

    await waitFor(() => expect(result.current.prompt?.kind).toBe('offer'));
    expect(result.current.prompt).toMatchObject({ replacesBrowserData: true });
  });

  it('once the user lets sync go ahead, later checks go by what the browser has', async () => {
    assessAs({ kind: 'offer', data: COPY });
    const { result } = renderHook(() => useFolderRestore());
    await waitFor(() => expect(result.current.prompt).not.toBeNull());
    act(() => result.current.decide('sync'));

    hasLabData.mockResolvedValue(true);
    assessAs({ kind: 'sync' });
    act(() => notifyFolderAccessChanged());

    await waitFor(() => expect(hasLabData).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.syncAllowed).toBe(true));
    expect(assessFolderCopy).toHaveBeenCalledTimes(1);
  });

  it('once the check finds nothing at risk, later checks go by what the browser has', async () => {
    // Empty at unlock, but the folder has no copy: nothing to decide
    assessAs({ kind: 'sync' });
    const { result } = renderHook(() => useFolderRestore());
    await waitFor(() => expect(result.current.syncAllowed).toBe(true));

    // Results imported and synced; then another folder, with an older copy
    hasLabData.mockResolvedValue(true);
    assessAs({ kind: 'offer', data: COPY });
    act(() => notifyFolderAccessChanged());

    await waitFor(() => expect(result.current.syncAllowed).toBe(true));
    expect(assessFolderCopy).toHaveBeenCalledTimes(1);
  });

  it('says whether sync is held, which a held restore elsewhere should mention', async () => {
    assessAs({ kind: 'offer', data: COPY });
    const { result } = renderHook(() => useFolderRestore());
    await waitFor(() => expect(result.current.prompt).not.toBeNull());
    // Asking is not held: the answer decides
    expect(result.current.syncHeld).toBe(false);

    act(() => result.current.decide('hold'));

    expect(result.current.syncHeld).toBe(true);
  });

  it('reports a folder it cannot check, rather than holding sync without a word', async () => {
    permission.mockRejectedValue(new Error('handle store blocked'));

    const { result } = renderHook(() => useFolderRestore());

    await waitFor(() =>
      expect(result.current.prompt).toEqual({ kind: 'unreadable', reason: 'read-failed', folderName: null })
    );
    expect(result.current.syncAllowed).toBe(false);
  });
});
