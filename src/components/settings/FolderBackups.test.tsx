/**
 * Tests for FolderBackups
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import type { FolderBackupEntry } from '@hooks/useFolderBackups';
import { formatDateTime } from '@/utils/formatDateTime';
import type { ParsedBackupData } from '@services/import';
import { FolderBackups } from './FolderBackups';

const useFolderBackups = vi.fn();
vi.mock('@hooks/useFolderBackups', () => ({
  useFolderBackups: () => useFolderBackups(),
}));

const NEWER: FolderBackupEntry = {
  name: 'hemoio-backup-20261105T093000000Z.encrypted',
  savedAt: new Date(2026, 10, 5, 9, 30),
  kind: 'conflict',
};
const OLDER: FolderBackupEntry = {
  name: 'hemoio-autobackup-20261101T080000000Z.encrypted',
  savedAt: new Date(2026, 10, 1, 8, 0),
  kind: 'before-load',
};

const DATA = {
  labResults: [{}, {}],
  testValues: [{}],
  userNotes: [],
  exportedAt: new Date(2026, 10, 5, 9, 30),
} as unknown as ParsedBackupData;

const read = vi.fn();
const keepCurrentCopy = vi.fn();
const canKeepCurrentCopy = vi.fn();
const onRestore = vi.fn();
const release = vi.fn();
const protectShown = vi.fn(() => release);

function renderBackups(backups: FolderBackupEntry[] = [NEWER, OLDER]) {
  useFolderBackups.mockReturnValue({ backups, read, keepCurrentCopy, canKeepCurrentCopy, protectShown });
  return render(
    <MantineProvider env="test">
      <FolderBackups onRestore={onRestore} />
    </MantineProvider>
  );
}

/** The alert with this text: the confirmation has its own alert beside it */
async function alertWith(within_: HTMLElement, text: string): Promise<HTMLElement> {
  return waitFor(() => {
    const found = within(within_)
      .getAllByRole('alert')
      .find((alert) => alert.textContent?.includes(text));
    if (!found) throw new Error('No such alert');
    return found;
  });
}

describe('FolderBackups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    read.mockResolvedValue({ status: 'readable', data: DATA, revision: null, lock: null });
    keepCurrentCopy.mockResolvedValue(undefined);
    canKeepCurrentCopy.mockResolvedValue(true);
    onRestore.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has a heading, the description, and a list of backups with their kind', () => {
    renderBackups();

    expect(screen.getByRole('heading', { name: 'Folder backups' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Kept when your folder copy and this computer disagreed, and before a newer copy was loaded. The 10 newest of each kind are kept.'
      )
    ).toBeInTheDocument();
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(`Saved ${formatDateTime(NEWER.savedAt)}`);
    expect(items[0]).toHaveTextContent('kept from a choice');
    expect(items[1]).toHaveTextContent(`Saved ${formatDateTime(OLDER.savedAt)}`);
    expect(items[1]).toHaveTextContent('kept before loading from the folder');
  });

  it('says so when there are no backups', () => {
    renderBackups([]);

    expect(screen.getByText('No folder backups yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('each restore button names its date and kind', () => {
    renderBackups();

    expect(
      screen.getByRole('button', {
        name: `Restore the backup saved ${formatDateTime(NEWER.savedAt)}, kept from a choice`,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: `Restore the backup saved ${formatDateTime(OLDER.savedAt)}, kept before loading from the folder`,
      })
    ).toBeInTheDocument();
  });

  it('restore asks first, keeps the current copy, then passes the data', async () => {
    const user = userEvent.setup();
    renderBackups();

    await user.click(screen.getAllByRole('button', { name: /^Restore the backup saved/ })[0]);

    const dialog = await screen.findByRole('dialog', { name: 'Restore folder backup' });
    expect(read).toHaveBeenCalledWith(NEWER.name);
    expect(dialog).toHaveTextContent('2 lab results');
    expect(dialog).toHaveTextContent('Your current folder copy is kept as a dated backup first.');
    expect(keepCurrentCopy).not.toHaveBeenCalled();
    expect(onRestore).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(onRestore).toHaveBeenCalledWith(DATA, { restoreAISettings: false }));
    expect(keepCurrentCopy.mock.invocationCallOrder[0]).toBeLessThan(onRestore.mock.invocationCallOrder[0]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('puts focus back on the button that opened the confirmation', async () => {
    const user = userEvent.setup();
    renderBackups();
    const button = screen.getAllByRole('button', { name: /^Restore the backup saved/ })[1];

    await user.click(button);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(button).toHaveFocus());
  });

  it('a failed keep restores nothing and shows the alert', async () => {
    const user = userEvent.setup();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    keepCurrentCopy.mockRejectedValue(new Error('Disk full: Hemoglobin 14.5'));
    renderBackups();

    await user.click(screen.getAllByRole('button', { name: /^Restore the backup saved/ })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Restore' }));

    expect(await alertWith(dialog, 'Nothing was changed')).toHaveTextContent(
      'Nothing was changed: the current folder copy could not be kept as a backup.'
    );
    expect(onRestore).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();
    // Only a fixed message is logged, never the error
    expect(JSON.stringify(logged.mock.calls)).not.toContain('Hemoglobin');
  });

  it('cancel restores nothing', async () => {
    const user = userEvent.setup();
    renderBackups();

    await user.click(screen.getAllByRole('button', { name: /^Restore the backup saved/ })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(keepCurrentCopy).not.toHaveBeenCalled();
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('explains an unreadable backup, and changes nothing', async () => {
    const user = userEvent.setup();
    read.mockResolvedValue({ status: 'unreadable', reason: 'cannot-decrypt' });
    renderBackups();

    await user.click(screen.getAllByRole('button', { name: /^Restore the backup saved/ })[0]);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This backup is damaged or was made with a different key, and can't be opened."
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(keepCurrentCopy).not.toHaveBeenCalled();
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('shows the restore failing as an alert, with the dialog kept open', async () => {
    const user = userEvent.setup();
    onRestore.mockRejectedValue(new Error('x'));
    renderBackups();

    await user.click(screen.getAllByRole('button', { name: /^Restore the backup saved/ })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Restore' }));

    expect(await alertWith(dialog, 'The restore did not complete')).toBeInTheDocument();
  });

  it('keeps the current copy once per confirmation: a retry after a failed restore does not keep again', async () => {
    const user = userEvent.setup();
    onRestore.mockRejectedValueOnce(new Error('x'));
    renderBackups();

    await user.click(screen.getAllByRole('button', { name: /^Restore the backup saved/ })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Restore' }));
    await alertWith(dialog, 'The restore did not complete');
    await user.click(within(dialog).getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(onRestore).toHaveBeenCalledTimes(2));
    expect(keepCurrentCopy).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed keep retryable', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    keepCurrentCopy.mockRejectedValueOnce(new Error('x'));
    renderBackups();

    await user.click(screen.getAllByRole('button', { name: /^Restore the backup saved/ })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Restore' }));
    await alertWith(dialog, 'Nothing was changed');
    await user.click(within(dialog).getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(onRestore).toHaveBeenCalledTimes(1));
    expect(keepCurrentCopy).toHaveBeenCalledTimes(2);
  });

  it('protects the backup being restored from the keep', async () => {
    const user = userEvent.setup();
    renderBackups();

    await user.click(screen.getAllByRole('button', { name: /^Restore the backup saved/ })[1]);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(keepCurrentCopy).toHaveBeenCalledWith([OLDER.name]));
  });

  it('protects the backup shown from pruning while the confirmation is open', async () => {
    const user = userEvent.setup();
    renderBackups();

    await user.click(screen.getAllByRole('button', { name: /^Restore the backup saved/ })[1]);
    const dialog = await screen.findByRole('dialog');
    expect(protectShown).toHaveBeenCalledWith(OLDER.name);
    expect(release).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(release).toHaveBeenCalledTimes(1));
  });

  it('when the current copy cannot be opened, says it is left as it is, keeps nothing and restores', async () => {
    const user = userEvent.setup();
    canKeepCurrentCopy.mockResolvedValue(false);
    renderBackups();

    await user.click(screen.getAllByRole('button', { name: /^Restore the backup saved/ })[0]);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent("Your current folder copy can't be opened, so HemoIO leaves it as it is.");
    expect(dialog).not.toHaveTextContent('kept as a dated backup first');
    await user.click(within(dialog).getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(onRestore).toHaveBeenCalledWith(DATA, { restoreAISettings: false }));
    expect(keepCurrentCopy).not.toHaveBeenCalled();
  });

  it('moves focus to the failure alert when it appears', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    keepCurrentCopy.mockRejectedValue(new Error('x'));
    renderBackups();

    await user.click(screen.getAllByRole('button', { name: /^Restore the backup saved/ })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Restore' }));

    const alert = await alertWith(dialog, 'Nothing was changed');
    await waitFor(() => expect(alert).toHaveFocus());
  });
});
