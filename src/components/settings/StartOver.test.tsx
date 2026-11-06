/**
 * Tests for StartOver
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { StartOver } from './StartOver';

const mockStartOver = vi.hoisted(() => vi.fn<() => Promise<void>>());
vi.mock('@contexts', () => ({
  useAuth: () => ({ startOver: mockStartOver }),
}));

const BODY =
  "Removes all of HemoIO's data from this browser. Your folder copy and folder backups are not touched. Export a backup first if this browser has data you need.";

const onExportBackup = vi.fn();

function renderStartOver() {
  return render(
    <MantineProvider env="test">
      <StartOver onExportBackup={onExportBackup} />
    </MantineProvider>
  );
}

/** The button that opens the confirmation */
const startOverButton = () => screen.getByRole('button', { name: 'Start over' });

async function openConfirmation(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(startOverButton());
  return screen.findByRole('dialog', { name: 'Start over?' });
}

describe('StartOver', () => {
  beforeEach(() => {
    mockStartOver.mockReset();
    mockStartOver.mockResolvedValue();
    onExportBackup.mockReset();
  });

  it('explains what is removed and what is not, under a heading', () => {
    renderStartOver();

    expect(screen.getByRole('heading', { name: 'Start over' })).toBeInTheDocument();
    expect(screen.getByText(BODY)).toBeInTheDocument();
  });

  it('offers to export a backup first, from the section and from the dialog', async () => {
    const user = userEvent.setup();
    renderStartOver();

    await user.click(screen.getByRole('button', { name: 'Export a backup' }));
    expect(onExportBackup).toHaveBeenCalledTimes(1);

    const dialog = await openConfirmation(user);
    expect(dialog).toHaveTextContent(BODY);
    await user.click(within(dialog).getByRole('button', { name: 'Export a backup' }));
    expect(onExportBackup).toHaveBeenCalledTimes(2);
    expect(mockStartOver).not.toHaveBeenCalled();
  });

  it('start over needs the typed confirmation word', async () => {
    const user = userEvent.setup();
    renderStartOver();
    const dialog = await openConfirmation(user);
    const confirm = within(dialog).getByRole('button', { name: 'Start over' });
    const word = within(dialog).getByLabelText('Type START OVER to confirm');

    expect(confirm).toBeDisabled();
    await user.type(word, 'start over');
    expect(confirm).toBeDisabled();
    await user.clear(word);
    await user.type(word, 'START OVER ');
    expect(confirm).toBeDisabled();
    await user.clear(word);
    await user.type(word, 'START OVER');
    expect(confirm).toBeEnabled();

    await user.click(confirm);

    await waitFor(() => expect(mockStartOver).toHaveBeenCalledTimes(1));
  });

  it('focuses Cancel', async () => {
    const user = userEvent.setup();
    renderStartOver();
    const dialog = await openConfirmation(user);

    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus());
  });

  it('Escape cancels and focus goes back to Start over', async () => {
    const user = userEvent.setup();
    renderStartOver();
    const dialog = await openConfirmation(user);
    await user.type(within(dialog).getByLabelText('Type START OVER to confirm'), 'START OVER');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(startOverButton()).toHaveFocus());
    expect(mockStartOver).not.toHaveBeenCalled();
  });

  it('Cancel changes nothing, and the typed word is asked for again next time', async () => {
    const user = userEvent.setup();
    renderStartOver();
    let dialog = await openConfirmation(user);
    await user.type(within(dialog).getByLabelText('Type START OVER to confirm'), 'START OVER');

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(startOverButton()).toHaveFocus());
    expect(mockStartOver).not.toHaveBeenCalled();
    dialog = await openConfirmation(user);
    expect(within(dialog).getByLabelText('Type START OVER to confirm')).toHaveValue('');
    expect(within(dialog).getByRole('button', { name: 'Start over' })).toBeDisabled();
  });
});
