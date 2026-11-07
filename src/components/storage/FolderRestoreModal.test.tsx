import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { formatDateTime } from '@/utils/formatDateTime';
import { FolderRestoreModal } from './FolderRestoreModal';
import type { FolderReplaceResult, FolderRestorePrompt } from '@hooks';
import type { ParsedBackupData } from '@services/import';
import type { FolderCopyProblem } from '@services/sync';

const SAVED_AT = new Date('2026-10-29T08:30:00.000Z');
const HANDLE = { name: 'Health' } as unknown as FileSystemDirectoryHandle;

function copyOf(labResults: number, testValues: number, notes: number): ParsedBackupData {
  return {
    labResults: Array.from({ length: labResults }, () => ({}) as never),
    testValues: Array.from({ length: testValues }, () => ({}) as never),
    userNotes: Array.from({ length: notes }, () => ({}) as never),
    settings: null,
    userPreferences: null,
    schemaVersion: 2,
    exportedAt: SAVED_AT,
  };
}

const OFFER: FolderRestorePrompt = {
  kind: 'offer',
  data: copyOf(2, 3, 1),
  revision: 'r1',
  folderName: 'Health',
  replacesBrowserData: false,
  stamp: 'stamp-1',
};

function renderModal(
  prompt: FolderRestorePrompt | null = OFFER,
  onRestore = vi.fn(async (): Promise<boolean> => true),
  onReplace = vi.fn<(prompt: FolderRestorePrompt) => Promise<FolderReplaceResult>>(async () => 'replaced'),
  onChooseFolder = vi.fn(async (): Promise<boolean> => true)
) {
  const onDecide = vi.fn();
  const onRecheck = vi.fn();
  render(
    <MantineProvider env="test">
      <FolderRestoreModal
        prompt={prompt}
        onRestore={onRestore}
        onReplace={onReplace}
        onDecide={onDecide}
        onChooseFolder={onChooseFolder}
        onRecheck={onRecheck}
      />
    </MantineProvider>
  );
  return { onRestore, onReplace, onDecide, onChooseFolder, onRecheck };
}

describe('FolderRestoreModal', () => {
  it('is closed without a prompt', () => {
    renderModal(null);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('says what the folder copy holds and when it was saved', () => {
    renderModal();

    const dialog = screen.getByRole('dialog', { name: 'Restore your data from the folder?' });
    expect(dialog).toHaveTextContent('“Health”');
    expect(dialog).toHaveTextContent('2 lab results');
    expect(dialog).toHaveTextContent('3 test values');
    expect(dialog).toHaveTextContent('1 note');
    expect(dialog).toHaveTextContent(`Saved ${formatDateTime(SAVED_AT)}`);
    expect(dialog).toHaveTextContent('Nothing is written to the folder until you choose');
    expect(dialog).toHaveTextContent('This browser has no lab data');
  });

  it('says the save date is unknown for a copy whose date cannot be read', () => {
    renderModal({ ...OFFER, data: { ...copyOf(1, 0, 0), exportedAt: new Date(NaN) } } as FolderRestorePrompt);

    expect(screen.getByRole('dialog')).toHaveTextContent('Save date unknown');
  });

  it('warns that a restore replaces data the browser gained since unlock', () => {
    renderModal({ ...OFFER, replacesBrowserData: true } as FolderRestorePrompt);

    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveTextContent('This browser has no lab data');
    expect(dialog).toHaveTextContent(
      'Restoring replaces the lab data added to this browser since you unlocked HemoIO'
    );
  });

  it('counts in the singular and names no folder it does not know', () => {
    renderModal({ kind: 'offer', data: copyOf(1, 1, 0), revision: null, folderName: null, replacesBrowserData: false, stamp: 's' });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('1 lab result');
    expect(dialog).not.toHaveTextContent('1 lab results');
    expect(dialog).toHaveTextContent('1 test value');
    expect(dialog).toHaveTextContent('0 notes');
    expect(dialog).toHaveTextContent('your folder');
  });

  it('restores the copy, and only then lets sync go ahead', async () => {
    let finish: () => void = () => {};
    const onRestore = vi.fn(() => new Promise<boolean>((resolve) => (finish = () => resolve(true))));
    const { onDecide } = renderModal(OFFER, onRestore);

    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(onRestore).toHaveBeenCalledWith(OFFER.kind === 'offer' && OFFER.data);
    expect(onDecide).not.toHaveBeenCalled();
    finish();
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith('sync'));
  });

  it('stays open when the restore fails, and keeps sync held', async () => {
    const onRestore = vi.fn(async (): Promise<boolean> => {
      throw new Error('Quota exceeded');
    });
    const { onDecide } = renderModal(OFFER, onRestore);

    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The restore did not complete');
    expect(onDecide).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeEnabled();
  });

  it('lets sync go ahead only once restored: data changed meanwhile is asked about again', async () => {
    const onRestore = vi.fn(async (): Promise<boolean> => false);
    const { onDecide } = renderModal(OFFER, onRestore);

    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(onRestore).toHaveBeenCalled());
    expect(onDecide).not.toHaveBeenCalled();
  });

  it('"Not now" holds sync, from the keyboard too', async () => {
    const { onDecide } = renderModal();

    // Restore has the focus first; "Not now" is the button before it
    await waitFor(() => expect(screen.getByRole('button', { name: 'Restore' })).toHaveFocus());
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Not now' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    expect(onDecide).toHaveBeenCalledWith('hold');
  });

  it('Escape is "Not now"', async () => {
    const { onDecide } = renderModal();

    await userEvent.keyboard('{Escape}');

    expect(onDecide).toHaveBeenCalledWith('hold');
  });

  it('asks before replacing the folder copy', async () => {
    const { onDecide } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy…' }));

    const dialog = screen.getByRole('dialog', { name: 'Replace the folder copy?' });
    expect(dialog).toHaveTextContent('will be replaced');
    expect(onDecide).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('dialog', { name: 'Restore your data from the folder?' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy' }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith('sync'));
  });

  it('keeps the folder copy as a backup before letting sync replace it', async () => {
    const { onReplace, onDecide } = renderModal();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy…' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('kept as a dated backup');
    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy' }));

    await waitFor(() => expect(onDecide).toHaveBeenCalledWith('sync'));
    expect(onReplace).toHaveBeenCalledTimes(1);
    expect(onReplace.mock.invocationCallOrder[0]).toBeLessThan(onDecide.mock.invocationCallOrder[0]);
  });

  it('replaces nothing when the folder copy cannot be kept as a backup', async () => {
    const onReplace = vi.fn(async (): Promise<FolderReplaceResult> => {
      throw new Error('Disk full');
    });
    const { onDecide } = renderModal(OFFER, undefined, onReplace);

    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nothing was changed: the folder copy could not be kept as a backup.'
    );
    expect(onDecide).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).not.toHaveTextContent('Disk full');
  });

  it('Escape on the confirmation goes back, rather than closing', async () => {
    const { onDecide } = renderModal();
    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy…' }));

    await userEvent.keyboard('{Escape}');

    expect(screen.getByRole('dialog', { name: 'Restore your data from the folder?' })).toBeInTheDocument();
    expect(onDecide).not.toHaveBeenCalled();
  });

  it('keeps its title while it closes', () => {
    const onDecide = vi.fn();
    const ui = (prompt: FolderRestorePrompt | null) => (
      <MantineProvider env="test">
        <FolderRestoreModal
          prompt={prompt}
          onRestore={vi.fn()}
          onReplace={vi.fn(async (): Promise<FolderReplaceResult> => 'replaced')}
          onDecide={onDecide}
          onChooseFolder={vi.fn(async () => false)}
          onRecheck={vi.fn()}
        />
      </MantineProvider>
    );
    const { rerender } = render(ui(OFFER));

    rerender(ui(null));

    expect(screen.queryByText("The folder copy can't be read")).not.toBeInTheDocument();
  });

  it('starts a new prompt afresh, not on the step the last one was left at', async () => {
    const onDecide = vi.fn();
    const ui = (prompt: FolderRestorePrompt | null) => (
      <MantineProvider env="test">
        <FolderRestoreModal
          prompt={prompt}
          onRestore={vi.fn()}
          onReplace={vi.fn(async (): Promise<FolderReplaceResult> => 'replaced')}
          onDecide={onDecide}
          onChooseFolder={vi.fn(async () => false)}
          onRecheck={vi.fn()}
        />
      </MantineProvider>
    );
    const { rerender } = render(ui(OFFER));
    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy…' }));

    rerender(ui({ ...OFFER, folderName: 'Other' } as FolderRestorePrompt));

    expect(screen.getByRole('dialog', { name: 'Restore your data from the folder?' })).toBeInTheDocument();
  });

  const UNREADABLE = (reason: FolderCopyProblem, replaceable = reason !== 'read-failed'): FolderRestorePrompt => ({
    kind: 'unreadable',
    reason,
    folderName: 'Health',
    replaceable,
    target: { fileId: 'sha256:f1', folder: HANDLE },
  });

  it.each([
    ['cannot-decrypt', /can't be opened with your password.*different password.*damaged/],
    ['not-a-copy', /isn't a folder copy HemoIO can read.*damaged/],
    ['damaged-copy', /already damaged when HemoIO kept it/],
    [
      'before-loinc',
      /This backup was made before tests were identified by LOINC and cannot be restored\. Re-import your reports instead\./,
    ],
  ] as const)('explains a copy it cannot read (%s), and offers another folder or replacing it', (reason, message) => {
    renderModal(UNREADABLE(reason));

    const dialog = screen.getByRole('dialog', { name: "The folder copy can't be read" });
    expect(dialog).toHaveTextContent(message);
    expect(dialog).toHaveTextContent(
      "The file has not been changed. To keep syncing, choose another folder, or replace the folder copy with this computer's data."
    );
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace folder copy…' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose another folder' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
  });

  it('offers nothing but "Not now" for a copy from a newer HemoIO: updating restores it', () => {
    renderModal(UNREADABLE('newer-version'));

    const dialog = screen.getByRole('dialog', { name: "The folder copy can't be read" });
    expect(dialog).toHaveTextContent(/newer version of HemoIO/);
    expect(dialog).toHaveTextContent('The file has not been changed, and HemoIO will not write over it.');
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Not now']);
  });

  it('offers to read the folder again when the file could not be read, but not to replace it', async () => {
    const { onRecheck } = renderModal(UNREADABLE('read-failed'));

    const dialog = screen.getByRole('dialog', { name: "The folder copy can't be read" });
    expect(dialog).toHaveTextContent(/couldn't read the file/);
    expect(dialog).toHaveTextContent('Try again, or choose another folder.');
    expect(screen.queryByRole('button', { name: /Replace folder copy/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose another folder' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRecheck).toHaveBeenCalledTimes(1);
  });

  it('replaces a copy that cannot be read only once confirmed, and then lets sync go ahead', async () => {
    const { onReplace, onDecide } = renderModal(UNREADABLE('not-a-copy'));

    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy…' }));
    const confirm = screen.getByRole('dialog', { name: 'Replace the folder copy?' });
    expect(confirm).toHaveTextContent("saves this computer's data to “Health”");
    expect(confirm).toHaveTextContent('kept as a dated backup first, in its hemoio-backups folder');
    expect(confirm).toHaveTextContent('keeps the 10 newest backups');
    expect(confirm).not.toHaveTextContent('another password');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toHaveFocus());
    expect(onReplace).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy' }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith('sync'));
    expect(onReplace).toHaveBeenCalledTimes(1);
  });

  it("warns that a copy made with another password or setup no longer syncs from the folder", async () => {
    renderModal(UNREADABLE('cannot-decrypt'));

    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy…' }));

    expect(screen.getByRole('dialog', { name: 'Replace the folder copy?' })).toHaveTextContent(
      "If the copy was made with another password or by someone else's HemoIO setup, it will no longer sync from this folder. It is kept in hemoio-backups as it was, and can still be restored there with that password."
    );
  });

  it('goes back to the problem from the confirmation, with nothing replaced', async () => {
    const { onReplace, onDecide } = renderModal(UNREADABLE('cannot-decrypt'));

    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByRole('dialog', { name: "The folder copy can't be read" })).toBeInTheDocument();
    expect(onReplace).not.toHaveBeenCalled();
    expect(onDecide).not.toHaveBeenCalled();
  });

  it('says nothing changed when a copy that cannot be read cannot be kept as a backup', async () => {
    const onReplace = vi.fn(async (): Promise<FolderReplaceResult> => {
      throw new Error('Disk full at /home/someone');
    });
    const { onDecide } = renderModal(UNREADABLE('damaged-copy'), undefined, onReplace);

    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Nothing was changed: the folder copy could not be kept as a backup.');
    expect(alert).not.toHaveTextContent('/home/someone');
    expect(onDecide).not.toHaveBeenCalled();
  });

  it('opens the folder picker from "Choose another folder", decides nothing itself', async () => {
    const { onChooseFolder, onDecide } = renderModal(UNREADABLE('cannot-decrypt'));

    await userEvent.click(screen.getByRole('button', { name: 'Choose another folder' }));

    expect(onChooseFolder).toHaveBeenCalledTimes(1);
    // The folder chosen is looked at afresh, which closes the question
    expect(onDecide).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stays as it was when the picker is cancelled', async () => {
    const { onDecide } = renderModal(UNREADABLE('another-setup'), undefined, undefined, vi.fn(async () => false));

    await userEvent.click(screen.getByRole('button', { name: 'Choose another folder' }));

    expect(screen.getByRole('dialog', { name: "The folder copy can't be read" })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onDecide).not.toHaveBeenCalled();
  });

  it('says, without the reason, when the folder could not be chosen', async () => {
    const onChooseFolder = vi.fn(async (): Promise<boolean> => {
      throw new Error('Cannot open /home/someone/Health');
    });
    renderModal(UNREADABLE('read-failed'), undefined, undefined, onChooseFolder);

    await userEvent.click(screen.getByRole('button', { name: 'Choose another folder' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The folder could not be chosen. Nothing was changed');
    expect(alert).not.toHaveTextContent('/home/someone');
  });

  it('explains a folder from another setup, and the another-setup message points to Start over', async () => {
    const { onDecide } = renderModal(UNREADABLE('another-setup', false));

    const dialog = screen.getByRole('dialog', { name: "The folder copy can't be read" });
    expect(dialog).toHaveTextContent(
      "The copy in “Health” belongs to another HemoIO setup, made with a different key. HemoIO won't write over it. To use that folder on this computer, HemoIO must be set up again from that folder's copy: in Settings > Security, choose Start over, then \"I already have a folder copy\"."
    );
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Replace folder copy/ })).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent('The file has not been changed. To keep syncing, choose another folder.');
    expect(screen.getByRole('button', { name: 'Choose another folder' })).toBeInTheDocument();
    const notNow = screen.getByRole('button', { name: 'Not now' });
    await waitFor(() => expect(notNow).toHaveFocus());
    await userEvent.click(notNow);
    expect(onDecide).toHaveBeenCalledWith('hold');
  });

  it('replaces the very copy the confirmation was shown for', async () => {
    const prompt = UNREADABLE('not-a-copy');
    const { onReplace } = renderModal(prompt);

    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy' }));

    await waitFor(() => expect(onReplace).toHaveBeenCalledWith(prompt));
  });

  it('asks again, deciding nothing, when the folder or the file changed meanwhile', async () => {
    const onReplace = vi.fn(async (): Promise<FolderReplaceResult> => 'changed');
    const { onDecide, onRecheck } = renderModal(UNREADABLE('not-a-copy'), undefined, onReplace);

    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy' }));

    await waitFor(() => expect(onRecheck).toHaveBeenCalledTimes(1));
    expect(onDecide).not.toHaveBeenCalled();
  });

  it('lets a replace decide nothing once another question is asked', async () => {
    let finish!: (result: FolderReplaceResult) => void;
    const onReplace = vi.fn(() => new Promise<FolderReplaceResult>((resolve) => (finish = resolve)));
    const onDecide = vi.fn();
    const ui = (prompt: FolderRestorePrompt | null) => (
      <MantineProvider env="test">
        <FolderRestoreModal
          prompt={prompt}
          onRestore={vi.fn()}
          onReplace={onReplace}
          onDecide={onDecide}
          onChooseFolder={vi.fn(async () => false)}
          onRecheck={vi.fn()}
        />
      </MantineProvider>
    );
    const { rerender } = render(ui(UNREADABLE('not-a-copy')));
    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy' }));

    rerender(ui({ ...UNREADABLE('not-a-copy'), folderName: 'Other' } as FolderRestorePrompt));
    finish('replaced');

    await waitFor(() => expect(onReplace).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onDecide).not.toHaveBeenCalled();
  });

  it('offers no replace for a copy the sync would not write over', () => {
    renderModal(UNREADABLE('cannot-decrypt', false));

    expect(screen.queryByRole('button', { name: /Replace folder copy/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose another folder' })).toBeInTheDocument();
  });

  it('puts the focus back on "Replace folder copy…" after going back', async () => {
    renderModal(UNREADABLE('cannot-decrypt'));

    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Replace folder copy…' })).toHaveFocus());
  });

  it('starts the confirmation afresh after going back from a failed replace', async () => {
    const onReplace = vi.fn(async (): Promise<FolderReplaceResult> => {
      throw new Error('Disk full');
    });
    renderModal(UNREADABLE('not-a-copy'), undefined, onReplace);
    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy' }));
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy…' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('puts the focus on "Try again" when the file could not be read', async () => {
    renderModal(UNREADABLE('read-failed'));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toHaveFocus());
  });

  it('offers the previous copy when the latest is damaged, and a replace of the damaged file', async () => {
    const damagedCurrent = { reason: 'cannot-decrypt', replaceable: true, target: { fileId: 'sha256:f1', folder: HANDLE } } as const;
    const prompt = { ...OFFER, damagedCurrent } as FolderRestorePrompt;
    const { onReplace } = renderModal(prompt);

    const dialog = screen.getByRole('dialog', { name: 'Restore your data from the folder?' });
    expect(dialog).toHaveTextContent('The latest copy in “Health” is damaged, so the previous copy is offered instead.');
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy…' }));
    // The damaged file is the one replaced: the warning for a copy made elsewhere applies
    expect(screen.getByRole('dialog', { name: 'Replace the folder copy?' })).toHaveTextContent('another password');
    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy' }));
    await waitFor(() => expect(onReplace).toHaveBeenCalledWith(prompt));
  });
});
