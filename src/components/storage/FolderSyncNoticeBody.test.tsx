import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { chooseFolder } from '@data/storage/chooseFolder';
import { FolderSyncNoticeBody } from './FolderSyncNoticeBody';
import type { FolderProblemActions } from '@services/sync';

vi.mock('@data/storage/chooseFolder', () => ({
  chooseFolder: vi.fn(),
}));

function renderBody(actions: FolderProblemActions) {
  const onReplace = vi.fn();
  const onFolderStorageOff = vi.fn();
  render(
    <MantineProvider env="test">
      <FolderSyncNoticeBody
        message="The copy in your folder cannot be read."
        actions={actions}
        onFolderStorageOff={onFolderStorageOff}
        onReplace={onReplace}
      />
    </MantineProvider>
  );
  return { onReplace, onFolderStorageOff };
}

describe('FolderSyncNoticeBody', () => {
  beforeEach(() => {
    vi.mocked(chooseFolder).mockReset();
    vi.mocked(chooseFolder).mockResolvedValue('chosen');
  });

  it('shows the message with both ways on, each doing its own', async () => {
    const { onReplace, onFolderStorageOff } = renderBody({ chooseFolder: true, replace: 'warn', tryAgain: false });

    expect(screen.getByText('The copy in your folder cannot be read.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Choose another folder' }));
    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy…' }));

    expect(chooseFolder).toHaveBeenCalledTimes(1);
    expect(onReplace).toHaveBeenCalledTimes(1);
    expect(onFolderStorageOff).not.toHaveBeenCalled();
  });

  it('tells the caller when folder storage was switched off meanwhile', async () => {
    vi.mocked(chooseFolder).mockResolvedValue('off');
    const { onFolderStorageOff } = renderBody({ chooseFolder: true, replace: false, tryAgain: false });

    await userEvent.click(screen.getByRole('button', { name: 'Choose another folder' }));

    expect(onFolderStorageOff).toHaveBeenCalledTimes(1);
  });

  it('offers no replace where the copy may not be replaced', () => {
    renderBody({ chooseFolder: true, replace: false, tryAgain: false });

    expect(screen.getByRole('button', { name: 'Choose another folder' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replace folder copy…' })).not.toBeInTheDocument();
  });

  it('says, without the reason, when the folder could not be chosen', async () => {
    vi.mocked(chooseFolder).mockRejectedValue(new Error('No access to /home/someone'));
    renderBody({ chooseFolder: true, replace: false, tryAgain: false });

    await userEvent.click(screen.getByRole('button', { name: 'Choose another folder' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The folder could not be chosen. Nothing was changed');
    expect(alert).not.toHaveTextContent('/home/someone');
  });
});
