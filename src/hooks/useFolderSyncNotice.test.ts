import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { notifications } from '@mantine/notifications';
import { FOLDER_SYNC_NOTICE_ID, useFolderSyncNotice } from './useFolderSyncNotice';
import type { FolderSyncIssue } from './useFilesystemSync';

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn(), hide: vi.fn() },
}));

describe('useFolderSyncNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows nothing while the folder sync writes', () => {
    renderHook(() => useFolderSyncNotice(null));

    expect(notifications.show).not.toHaveBeenCalled();
  });

  it('says in plain words that the sync was skipped to protect the folder copy', () => {
    renderHook(() => useFolderSyncNotice('empty'));

    expect(notifications.show).toHaveBeenCalledTimes(1);
    const notice = vi.mocked(notifications.show).mock.calls[0][0];
    expect(notice.id).toBe(FOLDER_SYNC_NOTICE_ID);
    expect(notice.title).toBe('Folder sync skipped');
    expect(notice.message).toMatch(/no lab results right now, but your folder copy does/);
    expect(notice.message).toMatch(/left your folder copy as it is/);
    // Protecting the user's only copy is not something to miss after a few seconds
    expect(notice.autoClose).toBe(false);
  });

  it('tells the user to choose another folder when the copy cannot be opened', () => {
    renderHook(() => useFolderSyncNotice('unreadable'));

    const notice = vi.mocked(notifications.show).mock.calls[0][0];
    expect(notice.message).toMatch(/cannot be read/);
    expect(notice.message).toMatch(/saved by a different HemoIO setup, or it is damaged/);
    expect(notice.message).toMatch(/choose a different folder in Settings > Data/);
  });

  it('asks for an update when a newer version saved the copy', () => {
    renderHook(() => useFolderSyncNotice('newer'));

    const notice = vi.mocked(notifications.show).mock.calls[0][0];
    expect(notice.message).toMatch(/saved by a newer version of HemoIO/);
    expect(notice.message).toMatch(/left it as it is/);
  });

  it('leaves a copy saved before LOINC codes alone and points to another folder', () => {
    renderHook(() => useFolderSyncNotice('before-loinc'));

    const notice = vi.mocked(notifications.show).mock.calls[0][0];
    expect(notice.message).toMatch(/saved before tests were identified by LOINC/);
    expect(notice.message).toMatch(/left it as it is/);
    expect(notice.message).toMatch(/choose a different folder in Settings > Data/);
  });

  it('says when the folder could not be written, and that the browser keeps the data', () => {
    renderHook(() => useFolderSyncNotice('failed'));

    const notice = vi.mocked(notifications.show).mock.calls[0][0];
    expect(notice.id).toBe(FOLDER_SYNC_NOTICE_ID);
    expect(notice.title).toBe('Folder sync failed');
    expect(notice.message).toMatch(/could not be saved to your folder/);
    expect(notice.message).toMatch(/safe in this browser/);
    expect(notice.message).toMatch(/Check that the folder is available/);
    expect(notice.autoClose).toBe(false);
  });

  it('shows the notice once, not again on every sync that holds back', () => {
    const { rerender } = renderHook(
      ({ reason }: { reason: FolderSyncIssue | null }) => useFolderSyncNotice(reason),
      { initialProps: { reason: 'empty' } }
    );

    rerender({ reason: 'empty' });

    expect(notifications.show).toHaveBeenCalledTimes(1);
  });

  it('hides the notice once the sync writes again', () => {
    const { rerender } = renderHook(
      ({ reason }: { reason: FolderSyncIssue | null }) => useFolderSyncNotice(reason),
      { initialProps: { reason: 'empty' as FolderSyncIssue | null } }
    );

    rerender({ reason: null });

    expect(notifications.hide).toHaveBeenCalledWith(FOLDER_SYNC_NOTICE_ID);
  });
});
