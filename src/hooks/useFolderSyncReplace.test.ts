import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { chooseFolder } from '@data/storage/chooseFolder';
import { useFolderSyncReplace, type UseFolderSyncReplaceOptions } from './useFolderSyncReplace';
import type { FolderReplaceChoice, FolderReplaceResult, FolderSyncIssue, UnreadableCopyTarget } from './useFilesystemSync';

vi.mock('@data/storage/chooseFolder', () => ({ chooseFolder: vi.fn() }));

vi.mock('@/utils/fileSystemSupport', () => ({
  isFileSystemAccessSupported: vi.fn(() => true),
}));

const STORAGE_PROVIDER_KEY = 'hemoio_storage_provider';
const FOLDER = { name: 'Health' } as unknown as FileSystemDirectoryHandle;
const TARGET: UnreadableCopyTarget = { fileId: 'sha256:f1', folder: FOLDER };

describe('useFolderSyncReplace', () => {
  const replaceFolderCopy = vi.fn<(choice: FolderReplaceChoice) => Promise<FolderReplaceResult>>();
  const syncNow = vi.fn<() => Promise<void>>();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem(STORAGE_PROVIDER_KEY, 'filesystem');
    replaceFolderCopy.mockResolvedValue('replaced');
    syncNow.mockResolvedValue(undefined);
    vi.mocked(chooseFolder).mockResolvedValue(true);
  });

  function renderReplace(issue: FolderSyncIssue | null = 'unreadable', issueTarget: UnreadableCopyTarget | null = TARGET) {
    return renderHook((props: Pick<UseFolderSyncReplaceOptions, 'issue' | 'issueTarget'>) =>
      useFolderSyncReplace({ ...props, replaceFolderCopy, syncNow }),
      { initialProps: { issue, issueTarget } }
    );
  }

  it('offers to replace a copy the sync found and may replace', () => {
    const { result } = renderReplace();

    expect(result.current.issueState.replaceable).toBe(true);
    expect(result.current.confirmation.opened).toBe(false);
  });

  it.each([
    ['another setup', 'another-setup', TARGET],
    ['a copy from a newer HemoIO', 'newer', TARGET],
    ['a copy found without a file to name', 'unreadable', null],
    ['nothing found', null, null],
  ] as const)('offers no replace for %s', (_label, issue, target) => {
    const { result } = renderReplace(issue, target);

    expect(result.current.issueState.replaceable).toBe(false);
    act(() => result.current.issueState.askReplace());
    expect(result.current.confirmation.opened).toBe(false);
  });

  it('asks first, warning for a copy that may be someone else’s, then replaces the very file found', async () => {
    const { result } = renderReplace();

    act(() => result.current.noticeActions.replace('unreadable'));
    expect(result.current.confirmation.opened).toBe(true);
    expect(result.current.confirmation.warnOtherSetup).toBe(true);

    await act(async () => {
      await expect(result.current.confirmation.onReplace()).resolves.toBe('replaced');
    });
    expect(replaceFolderCopy).toHaveBeenCalledWith({ kind: 'unreadable', fileId: 'sha256:f1', folder: FOLDER });
    // The sync that follows writes over the copy kept
    expect(syncNow).toHaveBeenCalledTimes(1);
  });

  it('does not warn for a copy saved before LOINC', () => {
    const { result } = renderReplace('before-loinc');

    act(() => result.current.issueState.askReplace());

    expect(result.current.confirmation.warnOtherSetup).toBe(false);
  });

  it('opens each confirmation afresh, under a key of its own', () => {
    const { result } = renderReplace();
    act(() => result.current.issueState.askReplace());
    const first = result.current.confirmation.key;
    act(() => result.current.confirmation.onClose());

    act(() => result.current.issueState.askReplace());

    expect(result.current.confirmation.opened).toBe(true);
    expect(result.current.confirmation.key).not.toBe(first);
  });

  it('closes the confirmation once the sync finds another file, or none', () => {
    const { result, rerender } = renderReplace();
    act(() => result.current.issueState.askReplace());

    rerender({ issue: 'unreadable', issueTarget: { fileId: 'sha256:f2', folder: FOLDER } });
    expect(result.current.confirmation.opened).toBe(false);

    act(() => result.current.issueState.askReplace());
    rerender({ issue: null, issueTarget: null });
    expect(result.current.confirmation.opened).toBe(false);
  });

  it('a close from an earlier opening leaves a later one open', () => {
    const { result } = renderReplace();
    act(() => result.current.issueState.askReplace());
    const staleClose = result.current.confirmation.onClose;
    act(() => result.current.confirmation.onClose());
    act(() => result.current.issueState.askReplace());

    act(() => staleClose());

    expect(result.current.confirmation.opened).toBe(true);
  });

  it('chooses another folder from the notice', async () => {
    const { result } = renderReplace();

    await expect(result.current.noticeActions.chooseFolder()).resolves.toBe(true);
    expect(chooseFolder).toHaveBeenCalledTimes(1);
  });

  it('chooses nothing once folder storage is switched off, and syncs so the notice goes', async () => {
    localStorage.setItem(STORAGE_PROVIDER_KEY, 'local');
    const { result } = renderReplace();

    await expect(result.current.noticeActions.chooseFolder()).resolves.toBe(false);
    expect(chooseFolder).not.toHaveBeenCalled();
    expect(syncNow).toHaveBeenCalledTimes(1);
  });
});
