/**
 * Tests for SetAsideBanner
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { SetAsideBanner } from './SetAsideBanner';

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn(), hide: vi.fn() },
}));

function renderBanner(total: number) {
  const props = {
    total,
    onDownload: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
  };
  render(
    <MantineProvider env="test">
      <SetAsideBanner {...props} />
    </MantineProvider>
  );
  return props;
}

describe('SetAsideBanner', () => {
  it('hidden when nothing is set aside', () => {
    renderBanner(0);

    expect(screen.queryByRole('region', { name: 'Unreadable records' })).not.toBeInTheDocument();
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
  });

  it('delete asks first, focusing Cancel', async () => {
    const { onDelete } = renderBanner(1);

    await userEvent.click(screen.getByRole('button', { name: 'Delete…' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete unreadable records?' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus());
    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete 1 record' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('cancelling the delete keeps the records', async () => {
    const { onDelete } = renderBanner(2);

    await userEvent.click(screen.getByRole('button', { name: 'Delete…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete unreadable records?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onDelete).not.toHaveBeenCalled();
  });
});
