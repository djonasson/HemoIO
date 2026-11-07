import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { ReplaceFolderCopyConfirm, type ReplaceFolderCopyConfirmProps } from './ReplaceFolderCopyConfirm';

type Props = ReplaceFolderCopyConfirmProps<string>;

function renderConfirm(props: Partial<Props> = {}) {
  const onBack = vi.fn();
  const onReplace = vi.fn<Props['onReplace']>(async () => 'replaced');
  const onReplaced = vi.fn<Props['onReplaced']>();
  const onReplacingChange = vi.fn<Props['onReplacingChange']>();
  const view = render(
    <MantineProvider env="test">
      <ReplaceFolderCopyConfirm<string>
        folder="“Health”"
        warnOtherSetup={false}
        onBack={onBack}
        onReplace={onReplace}
        onReplaced={onReplaced}
        onReplacingChange={onReplacingChange}
        {...props}
      />
    </MantineProvider>
  );
  return { onBack, onReplace, onReplaced, onReplacingChange, unmount: view.unmount };
}

/** A replace that settles when told */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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

  it('goes back', async () => {
    const { onBack, onReplace } = renderConfirm();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onReplace).not.toHaveBeenCalled();
  });

  it('replaces, saying so meanwhile, then gives the result', async () => {
    const replace = deferred<string>();
    const { onReplaced, onReplacingChange } = renderConfirm({ onReplace: () => replace.promise });

    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy' }));
    // Cannot go back while the backup is saved
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(onReplacingChange).toHaveBeenLastCalledWith(true);

    replace.resolve('replaced');
    await waitFor(() => expect(onReplaced).toHaveBeenCalledWith('replaced'));
    expect(onReplacingChange).toHaveBeenLastCalledWith(false);
  });

  it('says nothing changed when the backup failed, and gives nothing', async () => {
    const { onReplaced } = renderConfirm({ onReplace: () => Promise.reject(new Error('Disk full')) });

    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nothing was changed: the folder copy could not be kept as a backup.'
    );
    expect(onReplaced).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
  });

  it('closed while it runs: lets the dialog close, and the replace settles unseen', async () => {
    const replace = deferred<string>();
    const { onReplaced, onReplacingChange, unmount } = renderConfirm({ onReplace: () => replace.promise });
    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy' }));

    unmount();
    expect(onReplacingChange).toHaveBeenLastCalledWith(false);

    replace.resolve('replaced');
    await replace.promise;
    await Promise.resolve();
    expect(onReplaced).not.toHaveBeenCalled();
  });
});
