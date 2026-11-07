import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { FolderSyncNoticeBody } from './FolderSyncNoticeBody';
import type { FolderProblemActions } from './folderProblemActions';

function renderBody(
  actions: FolderProblemActions,
  onChooseFolder = vi.fn(async (): Promise<boolean> => true)
) {
  const onReplace = vi.fn();
  render(
    <MantineProvider env="test">
      <FolderSyncNoticeBody
        message="The copy in your folder cannot be read."
        actions={actions}
        onChooseFolder={onChooseFolder}
        onReplace={onReplace}
      />
    </MantineProvider>
  );
  return { onChooseFolder, onReplace };
}

describe('FolderSyncNoticeBody', () => {
  it('shows the message with both ways on, each doing its own', async () => {
    const { onChooseFolder, onReplace } = renderBody({ chooseFolder: true, replace: 'warn', tryAgain: false });

    expect(screen.getByText('The copy in your folder cannot be read.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Choose another folder' }));
    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy…' }));

    expect(onChooseFolder).toHaveBeenCalledTimes(1);
    expect(onReplace).toHaveBeenCalledTimes(1);
  });

  it('offers no replace where the copy may not be replaced', () => {
    renderBody({ chooseFolder: true, replace: false, tryAgain: false });

    expect(screen.getByRole('button', { name: 'Choose another folder' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replace folder copy…' })).not.toBeInTheDocument();
  });

  it('says, without the reason, when the folder could not be chosen', async () => {
    renderBody(
      { chooseFolder: true, replace: false, tryAgain: false },
      vi.fn(async (): Promise<boolean> => {
        throw new Error('No access to /home/someone');
      })
    );

    await userEvent.click(screen.getByRole('button', { name: 'Choose another folder' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The folder could not be chosen. Nothing was changed');
    expect(alert).not.toHaveTextContent('/home/someone');
  });
});
