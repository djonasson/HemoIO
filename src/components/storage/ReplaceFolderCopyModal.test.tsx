import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { ReplaceFolderCopyModal } from './ReplaceFolderCopyModal';

function renderModal({
  warnOtherSetup = false,
  onReplace = vi.fn(async (): Promise<unknown> => 'replaced'),
}: { warnOtherSetup?: boolean; onReplace?: () => Promise<unknown> } = {}) {
  const onClose = vi.fn();
  render(
    <MantineProvider env="test">
      <ReplaceFolderCopyModal opened warnOtherSetup={warnOtherSetup} onReplace={onReplace} onClose={onClose} />
    </MantineProvider>
  );
  return { onReplace, onClose };
}

describe('ReplaceFolderCopyModal', () => {
  it('says what replacing does, with Back first', async () => {
    renderModal();

    const dialog = screen.getByRole('dialog', { name: 'Replace the folder copy?' });
    expect(dialog).toHaveTextContent("From now on HemoIO saves this computer's data to your folder");
    expect(dialog).toHaveTextContent("kept as a dated backup first, in its hemoio-backups folder");
    expect(dialog).toHaveTextContent('HemoIO keeps the 10 newest backups');
    expect(dialog).not.toHaveTextContent('another password');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toHaveFocus());
  });

  it("warns when the copy may be someone else's", () => {
    renderModal({ warnOtherSetup: true });

    expect(screen.getByRole('dialog')).toHaveTextContent(
      "If the copy was made with another password or by someone else's HemoIO setup, it will no longer sync from this folder. It is kept in hemoio-backups as it was, and can still be restored there with that password."
    );
  });

  it('replaces, then closes', async () => {
    const { onReplace, onClose } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onReplace).toHaveBeenCalledTimes(1);
  });

  it('stays open and says nothing changed when the backup fails, without the reason', async () => {
    const { onClose } = renderModal({
      onReplace: vi.fn(async () => {
        throw new Error('Disk full at /home/someone');
      }),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Nothing was changed: the folder copy could not be kept as a backup.');
    expect(alert).not.toHaveTextContent('/home/someone');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Back and Escape close it, replacing nothing', async () => {
    const { onReplace, onClose } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onReplace).not.toHaveBeenCalled();
  });

  it('cannot be closed while the backup is being saved', async () => {
    let finish!: () => void;
    const { onClose } = renderModal({ onReplace: () => new Promise<void>((resolve) => (finish = resolve)) });

    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy' }));
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();

    finish();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('starts afresh when reopened after a failed replace, keyed per opening as its host does', async () => {
    const onReplace = vi.fn(async (): Promise<unknown> => {
      throw new Error('Disk full');
    });
    const ui = (opened: boolean, opening: number) => (
      <MantineProvider env="test">
        <ReplaceFolderCopyModal
          key={opening}
          opened={opened}
          warnOtherSetup={false}
          onReplace={onReplace}
          onClose={vi.fn()}
        />
      </MantineProvider>
    );
    const { rerender } = render(ui(true, 1));
    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy' }));
    await screen.findByRole('alert');

    // Closed from outside (the issue went), then opened again
    rerender(ui(false, 1));
    rerender(ui(true, 2));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
