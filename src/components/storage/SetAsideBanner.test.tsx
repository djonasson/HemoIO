/**
 * Tests for SetAsideBanner
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { SetAsideBanner, type SetAsideBannerProps } from './SetAsideBanner';
import type { SealedDownload } from '@hooks/useSetAsideRecords';

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn(), hide: vi.fn() },
}));

function renderBanner(total: number, overrides: Partial<SetAsideBannerProps> = {}) {
  const props = {
    total,
    unsaved: total,
    folderStorageOn: false,
    onDownload: vi.fn<() => Promise<SealedDownload>>().mockResolvedValue({ outcome: 'saved' }),
    onConfirmSaved: vi.fn<(ids: number[]) => Promise<void>>().mockResolvedValue(undefined),
    onSnapshot: vi
      .fn<() => Promise<number[]>>()
      .mockResolvedValue(Array.from({ length: total }, (_, i) => i + 1)),
    onDelete: vi.fn<(ids: number[]) => Promise<void>>().mockResolvedValue(undefined),
    ...overrides,
  };
  render(
    <MantineProvider env="test">
      <main>
        <h2>Timeline</h2>
        <SetAsideBanner {...props} />
      </main>
    </MantineProvider>
  );
  return props;
}

describe('SetAsideBanner', () => {
  beforeEach(() => {
    vi.mocked(notifications.show).mockClear();
  });

  it('hidden when nothing is set aside', () => {
    renderBanner(0);

    expect(screen.queryByRole('region', { name: 'Unreadable records' })).not.toBeInTheDocument();
  });

  it('says sync is paused only with folder storage and unsaved rows', () => {
    const paused = 'Folder sync is paused until you download or delete them.';
    renderBanner(2, { folderStorageOn: true, unsaved: 2 });
    expect(screen.getByText(new RegExp(paused))).toBeInTheDocument();
    cleanup();

    renderBanner(2, { folderStorageOn: true, unsaved: 0 });
    expect(screen.queryByText(new RegExp(paused))).not.toBeInTheDocument();
    cleanup();

    renderBanner(2, { folderStorageOn: false, unsaved: 2 });
    expect(screen.queryByText(new RegExp(paused))).not.toBeInTheDocument();
  });

  it('says how many records are kept aside, and offers both ways to settle them', async () => {
    const { onDownload } = renderBanner(3);

    const banner = screen.getByRole('region', { name: 'Unreadable records' });
    expect(within(banner).getByText("3 stored records can't be opened")).toBeInTheDocument();
    expect(
      within(banner).getByText(
        'They were saved with a different key, or are damaged. HemoIO keeps them aside and does not delete them. You can download them as a sealed file or delete them.'
      )
    ).toBeInTheDocument();

    await userEvent.click(within(banner).getByRole('button', { name: 'Download sealed file' }));
    expect(onDownload).toHaveBeenCalledTimes(1);
    // Written through the save picker: nothing to ask
    expect(screen.queryByText('Did the file save?')).not.toBeInTheDocument();
  });

  it('after a plain download, marks the rows saved only when I say the file saved', async () => {
    const { onConfirmSaved } = renderBanner(2, {
      onDownload: vi.fn<() => Promise<SealedDownload>>().mockResolvedValue({ outcome: 'unconfirmed', ids: [4, 5] }),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Download sealed file' }));

    const status = screen.getByRole('status');
    expect(within(status).getByText('Did the file save?')).toBeInTheDocument();
    expect(onConfirmSaved).not.toHaveBeenCalled();
    await userEvent.click(within(status).getByRole('button', { name: 'Yes, I saved it' }));
    expect(onConfirmSaved).toHaveBeenCalledWith([4, 5]);
    await waitFor(() => expect(screen.queryByText('Did the file save?')).not.toBeInTheDocument());
  });

  it('"Not yet" leaves the rows unsaved', async () => {
    const { onConfirmSaved } = renderBanner(2, {
      onDownload: vi.fn<() => Promise<SealedDownload>>().mockResolvedValue({ outcome: 'unconfirmed', ids: [4, 5] }),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Download sealed file' }));
    await userEvent.click(screen.getByRole('button', { name: 'Not yet' }));

    expect(screen.queryByText('Did the file save?')).not.toBeInTheDocument();
    expect(onConfirmSaved).not.toHaveBeenCalled();
  });

  it('a cancelled save picker asks nothing', async () => {
    renderBanner(2, {
      onDownload: vi.fn<() => Promise<SealedDownload>>().mockResolvedValue({ outcome: 'cancelled' }),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Download sealed file' }));

    expect(screen.queryByText('Did the file save?')).not.toBeInTheDocument();
  });

  it('delete asks first, focusing Cancel', async () => {
    const { onDelete } = renderBanner(1);

    await userEvent.click(screen.getByRole('button', { name: 'Delete…' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete unreadable records?' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus());
    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete 1 record' }));
    expect(onDelete).toHaveBeenCalledWith([1]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // The button that opened it may be gone: focus goes to the main content
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
  });

  it('deletes only the records the confirmation counted', async () => {
    // Three are set aside now, but the confirmation opened on two
    const { onDelete } = renderBanner(3, {
      onSnapshot: vi.fn<() => Promise<number[]>>().mockResolvedValue([7, 8]),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Delete…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete unreadable records?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete 2 records' }));

    expect(onDelete).toHaveBeenCalledWith([7, 8]);
  });

  it('cancelling the delete keeps the records', async () => {
    const { onDelete } = renderBanner(2);

    await userEvent.click(screen.getByRole('button', { name: 'Delete…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete unreadable records?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('says so politely once the records are deleted', async () => {
    renderBanner(2);

    await userEvent.click(screen.getByRole('button', { name: 'Delete…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete unreadable records?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete 2 records' }));

    await waitFor(() =>
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Unreadable records deleted', message: '2 records deleted.', role: 'status' })
      )
    );
  });

  it('says the file was saved when only recording it failed', async () => {
    renderBanner(2, {
      onDownload: vi.fn<() => Promise<SealedDownload>>().mockResolvedValue({ outcome: 'unrecorded' }),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Download sealed file' }));

    await waitFor(() =>
      expect(notifications.show).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Sealed file saved, but not recorded',
          message: expect.stringContaining('The sealed file was saved, but HemoIO could not record that'),
        })
      )
    );
    expect(notifications.show).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('could not be downloaded') })
    );
  });
});
