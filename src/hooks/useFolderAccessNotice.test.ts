import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { notifications } from '@mantine/notifications';
import { currentFolder } from '@data/storage/StorageProviderFactory';
import { isFolderStorageOn } from '@data/storage/storageChoice';
import { FOLDER_ACCESS_NOTICE_ID, useFolderAccessNotice } from './useFolderAccessNotice';
import type { ReactElement } from 'react';
import type { FolderAccessNoticeBodyProps } from '@components/storage/FolderAccessNoticeBody';

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn(), hide: vi.fn() },
}));
vi.mock('@data/storage/StorageProviderFactory', () => ({ currentFolder: vi.fn() }));
vi.mock('@data/storage/storageChoice', () => ({ isFolderStorageOn: vi.fn() }));

const listeners = new Set<() => void>();
vi.mock('@data/storage/folderAccessEvents', () => ({
  onFolderAccessChanged: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
}));

const getPermissionState = vi.fn();
const onGranted = (): void => {};

function shown() {
  const calls = vi.mocked(notifications.show).mock.calls;
  const notice = calls[calls.length - 1][0];
  return { notice, body: (notice.message as ReactElement<FolderAccessNoticeBodyProps>).props };
}

function accessChanged(): void {
  act(() => listeners.forEach((listener) => listener()));
}

describe('useFolderAccessNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listeners.clear();
    vi.mocked(isFolderStorageOn).mockReturnValue(true);
    vi.mocked(currentFolder).mockReturnValue({ getPermissionState } as unknown as ReturnType<typeof currentFolder>);
    getPermissionState.mockResolvedValue('granted');
  });

  it('tells when the browser asks for folder access again, until it is given', async () => {
    getPermissionState.mockResolvedValue('prompt');
    renderHook(() => useFolderAccessNotice(onGranted));

    await waitFor(() => expect(notifications.show).toHaveBeenCalledTimes(1));
    const { notice, body } = shown();
    expect(notice.id).toBe(FOLDER_ACCESS_NOTICE_ID);
    expect(notice.title).toBe('Folder access needed');
    expect(notice.autoClose).toBe(false);
    expect(body.blocked).toBe(false);
    expect(body.onGranted).toBe(onGranted);

    getPermissionState.mockResolvedValue('granted');
    accessChanged();
    await waitFor(() => expect(notifications.hide).toHaveBeenCalledWith(FOLDER_ACCESS_NOTICE_ID));
  });

  it('tells when the browser blocks the folder', async () => {
    getPermissionState.mockResolvedValue('denied');
    renderHook(() => useFolderAccessNotice(onGranted));

    await waitFor(() => expect(notifications.show).toHaveBeenCalledTimes(1));
    expect(shown().notice.title).toBe('Folder access blocked');
    expect(shown().body.blocked).toBe(true);
  });

  it('shows nothing while access is given', async () => {
    renderHook(() => useFolderAccessNotice(onGranted));

    await waitFor(() => expect(getPermissionState).toHaveBeenCalled());
    expect(notifications.show).not.toHaveBeenCalled();
  });

  it('asks nothing of the folder while data are kept in the browser only', async () => {
    vi.mocked(isFolderStorageOn).mockReturnValue(false);
    getPermissionState.mockResolvedValue('prompt');
    renderHook(() => useFolderAccessNotice(onGranted));
    await act(async () => {});

    expect(getPermissionState).not.toHaveBeenCalled();
    expect(notifications.show).not.toHaveBeenCalled();
  });

  it('takes the notice away when folder storage is switched off', async () => {
    getPermissionState.mockResolvedValue('prompt');
    renderHook(() => useFolderAccessNotice(onGranted));
    await waitFor(() => expect(notifications.show).toHaveBeenCalledTimes(1));

    vi.mocked(isFolderStorageOn).mockReturnValue(false);
    accessChanged();
    await waitFor(() => expect(notifications.hide).toHaveBeenCalledWith(FOLDER_ACCESS_NOTICE_ID));
  });

  it('keeps the answer of the latest look, however the looks finish', async () => {
    let answerFirst: (state: string) => void = () => {};
    getPermissionState.mockReturnValueOnce(new Promise((resolve) => (answerFirst = resolve)));
    renderHook(() => useFolderAccessNotice(onGranted));

    getPermissionState.mockResolvedValue('granted');
    accessChanged();
    await act(async () => answerFirst('prompt'));

    expect(notifications.show).not.toHaveBeenCalled();
  });

  it('stops looking once HemoIO locks', async () => {
    const { unmount } = renderHook(() => useFolderAccessNotice(onGranted));
    await waitFor(() => expect(getPermissionState).toHaveBeenCalledTimes(1));
    unmount();

    expect(listeners.size).toBe(0);
  });
});
