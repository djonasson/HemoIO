import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { ReplaceFolderCopyConfirm, type ReplaceFolderCopyConfirmProps } from './ReplaceFolderCopyConfirm';

function renderConfirm(props: Partial<ReplaceFolderCopyConfirmProps> = {}) {
  const onBack = vi.fn();
  const onConfirm = vi.fn();
  render(
    <MantineProvider env="test">
      <ReplaceFolderCopyConfirm
        folder="“Health”"
        warnOtherSetup={false}
        isReplacing={false}
        failed={false}
        onBack={onBack}
        onConfirm={onConfirm}
        {...props}
      />
    </MantineProvider>
  );
  return { onBack, onConfirm };
}

describe('ReplaceFolderCopyConfirm', () => {
  it('says what replacing does, and puts the focus on Back', async () => {
    renderConfirm();

    expect(
      screen.getByText(
        "From now on HemoIO saves this computer's data to “Health”, and the copy there will be replaced. What the folder holds now is kept as a dated backup first, in its hemoio-backups folder; HemoIO keeps the 10 newest backups."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/another password/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toHaveFocus());
  });

  it('says what becomes of a copy that may be someone else’s', () => {
    renderConfirm({ warnOtherSetup: true });

    expect(
      screen.getByText(
        "If the copy was made with another password or by someone else's HemoIO setup, it will no longer sync from this folder. It is kept in hemoio-backups as it was, and can still be restored there with that password."
      )
    ).toBeInTheDocument();
  });

  it('goes back or confirms', async () => {
    const { onBack, onConfirm } = renderConfirm();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy' }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('says nothing changed when the backup failed', () => {
    renderConfirm({ failed: true });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Nothing was changed: the folder copy could not be kept as a backup.'
    );
  });

  it('cannot go back while the backup is saved', () => {
    renderConfirm({ isReplacing: true });

    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  });
});
