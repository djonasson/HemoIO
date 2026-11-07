import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { FolderRecoveryStep } from './FolderRecoveryStep';
import { folderCopyProblemMessage } from '@components/storage/folderCopyProblemMessage';
import type { FolderUnlockProblem } from '@services/sync';

type Recover = (password: string) => Promise<FolderUnlockProblem | 'existing-locked' | null>;

function renderStep({
  folderName = 'Lab Folder' as string | null,
  onRecover = vi.fn<Recover>().mockResolvedValue(null),
  onChooseFolder = vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
} = {}) {
  const onBack = vi.fn();
  render(
    <MantineProvider env="test">
      <FolderRecoveryStep
        folderName={folderName}
        onChooseFolder={onChooseFolder}
        onRecover={onRecover}
        onBack={onBack}
      />
    </MantineProvider>
  );
  return { onBack, onRecover, onChooseFolder };
}

const password = () => screen.getByLabelText('Password you used');
const submit = () => screen.getByRole('button', { name: 'Unlock and restore' });

describe('FolderRecoveryStep', () => {
  it('asks for the folder and the password, in a region named by its heading', async () => {
    const user = userEvent.setup();
    const { onChooseFolder } = renderStep({ folderName: null });

    expect(screen.getByRole('region', { name: 'Restore from your folder copy' })).toBeInTheDocument();
    expect(submit()).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Choose folder' }));
    expect(onChooseFolder).toHaveBeenCalledTimes(1);
  });

  it('can be submitted once a folder is chosen and a password entered', async () => {
    const user = userEvent.setup();
    const { onRecover } = renderStep();
    expect(screen.getByText('Lab Folder')).toBeInTheDocument();
    expect(submit()).toBeDisabled();

    await user.type(password(), 'Folder-Passw0rd!{Enter}');

    expect(onRecover).toHaveBeenCalledWith('Folder-Passw0rd!');
  });

  it.each([
    ['no-copy', 'This folder has no HemoIO copy.'],
    [
      'no-lock',
      'This copy was saved before HemoIO kept the password lock in the folder. Only the browser that saved it can restore it.',
    ],
    ['wrong-password', "That password doesn't open this copy."],
    ['cannot-decrypt', folderCopyProblemMessage('cannot-decrypt', '“Lab Folder”')],
    ['not-a-copy', folderCopyProblemMessage('not-a-copy', '“Lab Folder”')],
    ['newer-version', folderCopyProblemMessage('newer-version', '“Lab Folder”')],
    ['before-loinc', folderCopyProblemMessage('before-loinc', '“Lab Folder”')],
    ['read-failed', folderCopyProblemMessage('read-failed', '“Lab Folder”')],
  ] as const)('shows each problem message: %s', async (problem, message) => {
    const user = userEvent.setup();
    renderStep({ onRecover: vi.fn<Recover>().mockResolvedValue(problem) });

    await user.type(password(), 'Folder-Passw0rd!');
    await user.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('focuses the password after a wrong password', async () => {
    const user = userEvent.setup();
    renderStep({ onRecover: vi.fn<Recover>().mockResolvedValue('wrong-password') });

    await user.type(password(), 'Wrong-Passw0rd!');
    await user.click(submit());

    await screen.findByRole('alert');
    await waitFor(() => expect(password()).toHaveFocus());
    expect(password()).toHaveValue('');
  });

  it('announces the same wrong password again, with a new alert', async () => {
    const user = userEvent.setup();
    renderStep({ onRecover: vi.fn<Recover>().mockResolvedValue('wrong-password') });

    await user.type(password(), 'Wrong-Passw0rd!');
    await user.click(submit());
    const first = await screen.findByRole('alert');
    await user.type(password(), 'Wrong-Passw0rd!');
    await user.click(submit());

    await waitFor(() => expect(screen.getByRole('alert')).not.toBe(first));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('moves focus to any other problem, which is announced', async () => {
    const user = userEvent.setup();
    renderStep({ onRecover: vi.fn<Recover>().mockResolvedValue('no-copy') });

    await user.type(password(), 'Folder-Passw0rd!');
    await user.click(submit());

    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it('is disabled while an attempt runs, and submits once', async () => {
    const user = userEvent.setup();
    let finish: (value: null) => void = () => {};
    const onRecover = vi.fn<Recover>(() => new Promise((resolve) => (finish = resolve)));
    renderStep({ onRecover });

    await user.type(password(), 'Folder-Passw0rd!');
    await user.click(submit());
    await user.keyboard('{Enter}');

    expect(submit()).toBeDisabled();
    expect(onRecover).toHaveBeenCalledTimes(1);
    await act(async () => finish(null));
    await waitFor(() => expect(submit()).toBeEnabled());
  });

  it('goes back to the screen before it', async () => {
    const user = userEvent.setup();
    const { onBack } = renderStep();

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('says so when the folder could not be opened, without the error', async () => {
    const user = userEvent.setup();
    renderStep({
      folderName: null,
      onChooseFolder: vi.fn<() => Promise<void>>().mockRejectedValue(new Error('/home/someone/Health')),
    });

    await user.click(screen.getByRole('button', { name: 'Choose folder' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("HemoIO couldn't open that folder. Choose it again.");
    expect(alert).not.toHaveTextContent('Health');
  });
});
