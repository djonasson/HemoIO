import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { ExistingDataStep } from './ExistingDataStep';

const TITLE = 'This browser already holds HemoIO data';

function renderStep(
  onClear: () => Promise<void> = vi.fn().mockResolvedValue(undefined),
  onFolderCopy?: () => void
) {
  const onKeep = vi.fn();
  render(
    <MantineProvider env="test">
      <ExistingDataStep onKeep={onKeep} onClear={onClear} onFolderCopy={onFolderCopy} />
    </MantineProvider>
  );
  return { onKeep, onClear };
}

describe('ExistingDataStep', () => {
  it('says the data cannot be opened, in a region named by its heading', () => {
    renderStep();

    const region = screen.getByRole('region', { name: TITLE });
    expect(screen.getByRole('heading', { name: TITLE })).toBeInTheDocument();
    expect(region).toHaveTextContent(
      "It was saved by an earlier setup whose password lock is gone, so this setup can't open it."
    );
  });

  it('puts focus on keeping the data aside, the default', async () => {
    const { onKeep } = renderStep();

    const keep = screen.getByRole('button', { name: 'Keep it aside and set up anew' });
    await waitFor(() => expect(keep).toHaveFocus());
    await userEvent.keyboard('{Enter}');

    expect(onKeep).toHaveBeenCalledTimes(1);
  });

  it('clearing asks first, and Escape cancels', async () => {
    const user = userEvent.setup();
    const { onClear } = renderStep();

    await user.click(screen.getByRole('button', { name: 'Clear it and set up anew…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Clear the data in this browser?' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());
    expect(dialog).toHaveTextContent('cannot be undone');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onClear).not.toHaveBeenCalled();
  });

  it('clears once confirmed', async () => {
    const user = userEvent.setup();
    const { onClear } = renderStep();

    await user.click(screen.getByRole('button', { name: 'Clear it and set up anew…' }));
    await user.click(await screen.findByRole('button', { name: 'Clear and set up anew' }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('closes the confirmation once the clear is done, cleared or not', async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getByRole('button', { name: 'Clear it and set up anew…' }));
    await user.click(await screen.findByRole('button', { name: 'Clear and set up anew' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('says so when the data could not be cleared, without the error', async () => {
    const user = userEvent.setup();
    renderStep(vi.fn().mockRejectedValue(new Error('detail that could name data')));

    await user.click(screen.getByRole('button', { name: 'Clear it and set up anew…' }));
    await user.click(await screen.findByRole('button', { name: 'Clear and set up anew' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The data could not be cleared. Nothing was changed.');
    expect(alert).not.toHaveTextContent('detail');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('offers the folder copy when it can be used, keeping focus on keeping the data aside', async () => {
    const user = userEvent.setup();
    const onFolderCopy = vi.fn();
    renderStep(undefined, onFolderCopy);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Keep it aside and set up anew' })).toHaveFocus()
    );
    await user.click(screen.getByRole('button', { name: 'I already have a folder copy' }));

    expect(onFolderCopy).toHaveBeenCalledTimes(1);
  });

  it('offers no folder copy where it cannot be used', () => {
    renderStep();

    expect(screen.queryByRole('button', { name: 'I already have a folder copy' })).not.toBeInTheDocument();
  });
});
