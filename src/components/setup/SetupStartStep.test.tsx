import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { SetupStartStep } from './SetupStartStep';

function renderStep() {
  const onSetUp = vi.fn();
  const onFolderCopy = vi.fn();
  render(
    <MantineProvider env="test">
      <SetupStartStep onSetUp={onSetUp} onFolderCopy={onFolderCopy} />
    </MantineProvider>
  );
  return { onSetUp, onFolderCopy };
}

describe('SetupStartStep', () => {
  it('offers a new setup, with focus, and the folder copy', async () => {
    const user = userEvent.setup();
    const { onSetUp, onFolderCopy } = renderStep();

    expect(screen.getByRole('region', { name: 'How would you like to start?' })).toBeInTheDocument();
    const setUp = screen.getByRole('button', { name: 'Set up HemoIO' });
    await waitFor(() => expect(setUp).toHaveFocus());
    await user.keyboard('{Enter}');
    expect(onSetUp).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'I already have a folder copy' }));
    expect(onFolderCopy).toHaveBeenCalledTimes(1);
  });
});
