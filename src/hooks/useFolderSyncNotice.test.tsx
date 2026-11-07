import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { chooseFolder } from '@data/storage/chooseFolder';
import { FOLDER_SYNC_NOTICE_ID, useFolderSyncNotice, type FolderSyncNoticeActions } from './useFolderSyncNotice';
import type { ReactElement, ReactNode } from 'react';
import type { FolderSyncIssue } from './useFilesystemSync';

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn(), hide: vi.fn() },
}));

vi.mock('@data/storage/chooseFolder', () => ({
  chooseFolder: vi.fn(),
}));

/** The notice's text, whether plain or with buttons below it */
function textOf(message: ReactNode): string {
  return typeof message === 'string' ? message : (message as ReactElement<{ message: string }>).props.message;
}

/** Stable, as the caller gives them */
const NO_ACTIONS: FolderSyncNoticeActions = { replace: () => {}, onFolderStorageOff: () => {} };

describe('useFolderSyncNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows nothing while the folder sync writes', () => {
    renderHook(() => useFolderSyncNotice(null, NO_ACTIONS));

    expect(notifications.show).not.toHaveBeenCalled();
  });

  it('says in plain words that the sync was skipped to protect the folder copy', () => {
    renderHook(() => useFolderSyncNotice('empty', NO_ACTIONS));

    expect(notifications.show).toHaveBeenCalledTimes(1);
    const notice = vi.mocked(notifications.show).mock.calls[0][0];
    expect(notice.id).toBe(FOLDER_SYNC_NOTICE_ID);
    expect(notice.title).toBe('Folder sync skipped');
    expect(notice.message).toMatch(/no lab results right now, but your folder copy does/);
    expect(notice.message).toMatch(/left your folder copy as it is/);
    // Protecting the user's only copy is not something to miss after a few seconds
    expect(notice.autoClose).toBe(false);
  });

  it('tells the user to choose another folder or replace the copy when it cannot be opened', () => {
    renderHook(() => useFolderSyncNotice('unreadable', NO_ACTIONS));

    const notice = vi.mocked(notifications.show).mock.calls[0][0];
    expect(textOf(notice.message)).toMatch(/cannot be read/);
    expect(textOf(notice.message)).toMatch(/saved by a different HemoIO setup, or it is damaged/);
    expect(textOf(notice.message)).toMatch(/choose another folder, or replace the folder copy with this computer's data/);
    // Where to find it once the notice is dismissed
    expect(textOf(notice.message)).toMatch(/\(also in Settings > Data\)/);
  });

  it('the another-setup message points to Start over', () => {
    renderHook(() => useFolderSyncNotice('another-setup', NO_ACTIONS));

    const notice = vi.mocked(notifications.show).mock.calls[0][0];
    expect(notice.title).toBe('Folder sync skipped');
    expect(textOf(notice.message)).toBe(
      "Your folder holds another HemoIO setup's copy, so HemoIO left it as it is. Choose another folder, or use Start over in Settings > Security to set up from that copy."
    );
    expect(notice.autoClose).toBe(false);
  });

  it('explains the set-aside pause', () => {
    renderHook(() => useFolderSyncNotice('set-aside', NO_ACTIONS));

    const notice = vi.mocked(notifications.show).mock.calls[0][0];
    expect(notice.title).toBe('Folder sync skipped');
    expect(notice.message).toBe(
      "Some stored records can't be opened, and your folder copy may still hold them. HemoIO left it as it is. Download or delete the unreadable records to sync again."
    );
    expect(notice.autoClose).toBe(false);
  });

  it('asks for an update when a newer version saved the copy', () => {
    renderHook(() => useFolderSyncNotice('newer', NO_ACTIONS));

    const notice = vi.mocked(notifications.show).mock.calls[0][0];
    expect(notice.message).toMatch(/saved by a newer version of HemoIO/);
    expect(notice.message).toMatch(/left it as it is/);
  });

  it('leaves a copy saved before LOINC codes alone and points to another folder', () => {
    renderHook(() => useFolderSyncNotice('before-loinc', NO_ACTIONS));

    const notice = vi.mocked(notifications.show).mock.calls[0][0];
    expect(textOf(notice.message)).toMatch(/saved before tests were identified by LOINC/);
    expect(textOf(notice.message)).toMatch(/left it as it is/);
    expect(textOf(notice.message)).toMatch(/choose another folder, or replace the folder copy/);
  });

  it('says when the folder could not be written, and that the browser keeps the data', () => {
    renderHook(() => useFolderSyncNotice('failed', NO_ACTIONS));

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
      ({ reason }: { reason: FolderSyncIssue | null }) => useFolderSyncNotice(reason, NO_ACTIONS),
      { initialProps: { reason: 'empty' } }
    );

    rerender({ reason: 'empty' });

    expect(notifications.show).toHaveBeenCalledTimes(1);
  });

  it('hides the notice once the sync writes again', () => {
    const { rerender } = renderHook(
      ({ reason }: { reason: FolderSyncIssue | null }) => useFolderSyncNotice(reason, NO_ACTIONS),
      { initialProps: { reason: 'empty' as FolderSyncIssue | null } }
    );

    rerender({ reason: null });

    expect(notifications.hide).toHaveBeenCalledWith(FOLDER_SYNC_NOTICE_ID);
  });

  describe('with what can be done about a copy that cannot be read', () => {
    const actions = (): FolderSyncNoticeActions => ({
      replace: vi.fn(),
      onFolderStorageOff: vi.fn(),
    });

    beforeEach(() => {
      vi.mocked(chooseFolder).mockResolvedValue('chosen');
    });

    /** The notice's message, rendered as the notifications would */
    function renderNotice(): void {
      const { message } = vi.mocked(notifications.show).mock.calls[0][0];
      render(<MantineProvider env="test">{message as ReactNode}</MantineProvider>);
    }

    it.each([
      ['unreadable', true],
      ['before-loinc', true],
      ['another-setup', false],
    ] as const)('offers to choose another folder for %s, and to replace it: %s', (issue, replace) => {
      renderHook(() => useFolderSyncNotice(issue, actions()));
      renderNotice();

      expect(screen.getByRole('button', { name: 'Choose another folder' })).toBeInTheDocument();
      expect(screen.queryAllByRole('button', { name: 'Replace folder copy…' })).toHaveLength(replace ? 1 : 0);
    });

    it.each(['newer', 'empty', 'set-aside', 'failed'] as const)('offers nothing for %s', (issue) => {
      renderHook(() => useFolderSyncNotice(issue, actions()));

      // Plain text, as before
      expect(typeof vi.mocked(notifications.show).mock.calls[0][0].message).toBe('string');
    });

    it('the buttons choose a folder and ask to replace, for the issue shown', async () => {
      const given = actions();
      vi.mocked(chooseFolder).mockResolvedValue('off');
      renderHook(() => useFolderSyncNotice('unreadable', given));
      renderNotice();

      await userEvent.click(screen.getByRole('button', { name: 'Choose another folder' }));
      await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy…' }));

      expect(chooseFolder).toHaveBeenCalledTimes(1);
      // Folder storage was switched off meanwhile: the caller syncs again
      expect(given.onFolderStorageOff).toHaveBeenCalledTimes(1);
      expect(given.replace).toHaveBeenCalledTimes(1);
      expect(notifications.show).toHaveBeenCalledTimes(1);
    });

    it('gives every notice shown a body of its own, so nothing carries over', () => {
      const given = actions();
      const { rerender } = renderHook(
        ({ issue }: { issue: FolderSyncIssue | null }) => useFolderSyncNotice(issue, given),
        { initialProps: { issue: 'unreadable' as FolderSyncIssue | null } }
      );
      rerender({ issue: null });
      rerender({ issue: 'unreadable' });

      const [first, second] = vi.mocked(notifications.show).mock.calls.map(([n]) => (n.message as ReactElement).key);
      expect(first).not.toBeNull();
      expect(second).not.toBe(first);
    });

    it('says, without the reason, when the folder could not be chosen', async () => {
      const given = actions();
      vi.mocked(chooseFolder).mockRejectedValue(new Error('No access to /home/someone'));
      renderHook(() => useFolderSyncNotice('another-setup', given));
      renderNotice();

      await userEvent.click(screen.getByRole('button', { name: 'Choose another folder' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('The folder could not be chosen. Nothing was changed');
      expect(alert).not.toHaveTextContent('/home/someone');
    });
  });
});
