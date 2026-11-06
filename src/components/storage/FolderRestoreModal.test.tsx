import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { formatDateTime } from '@/utils/formatDateTime';
import { FolderRestoreModal } from './FolderRestoreModal';
import type { FolderRestorePrompt } from '@hooks';
import type { ParsedBackupData } from '@services/import';

const SAVED_AT = new Date('2026-10-29T08:30:00.000Z');

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
};

function renderModal(prompt: FolderRestorePrompt | null = OFFER, onRestore = vi.fn(async () => {})) {
  const onDecide = vi.fn();
  render(
    <MantineProvider env="test">
      <FolderRestoreModal prompt={prompt} onRestore={onRestore} onDecide={onDecide} />
    </MantineProvider>
  );
  return { onRestore, onDecide };
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

  it('warns that a restore replaces data the browser gained since unlock', () => {
    renderModal({ ...OFFER, replacesBrowserData: true } as FolderRestorePrompt);

    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveTextContent('This browser has no lab data');
    expect(dialog).toHaveTextContent(
      'Restoring replaces the lab data added to this browser since you unlocked HemoIO'
    );
  });

  it('counts in the singular and names no folder it does not know', () => {
    renderModal({ kind: 'offer', data: copyOf(1, 1, 0), revision: null, folderName: null, replacesBrowserData: false });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('1 lab result');
    expect(dialog).not.toHaveTextContent('1 lab results');
    expect(dialog).toHaveTextContent('1 test value');
    expect(dialog).toHaveTextContent('0 notes');
    expect(dialog).toHaveTextContent('your folder');
  });

  it('restores the copy, and only then lets sync go ahead', async () => {
    let finish: () => void = () => {};
    const onRestore = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { onDecide } = renderModal(OFFER, onRestore);

    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(onRestore).toHaveBeenCalledWith(OFFER.kind === 'offer' && OFFER.data);
    expect(onDecide).not.toHaveBeenCalled();
    finish();
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith('sync'));
  });

  it('stays open when the restore fails, and keeps sync held', async () => {
    const onRestore = vi.fn(async () => {
      throw new Error('Quota exceeded');
    });
    const { onDecide } = renderModal(OFFER, onRestore);

    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The restore did not complete');
    expect(onDecide).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeEnabled();
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
    expect(onDecide).toHaveBeenCalledWith('sync');
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
        <FolderRestoreModal prompt={prompt} onRestore={vi.fn()} onDecide={onDecide} />
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
        <FolderRestoreModal prompt={prompt} onRestore={vi.fn()} onDecide={onDecide} />
      </MantineProvider>
    );
    const { rerender } = render(ui(OFFER));
    await userEvent.click(screen.getByRole('button', { name: 'Replace folder copy…' }));

    rerender(ui({ ...OFFER, folderName: 'Other' } as FolderRestorePrompt));

    expect(screen.getByRole('dialog', { name: 'Restore your data from the folder?' })).toBeInTheDocument();
  });

  it.each([
    ['cannot-decrypt', /can't be opened with your password.*different password.*damaged/],
    ['not-a-copy', /isn't a folder copy HemoIO can read.*damaged/],
    ['newer-version', /newer version of HemoIO/],
    [
      'before-loinc',
      /This backup was made before tests were identified by LOINC and cannot be restored\. Re-import your reports instead\./,
    ],
    ['read-failed', /couldn't read the file/],
  ] as const)('explains a copy it cannot read (%s), and offers neither restore nor replace', (reason, message) => {
    renderModal({ kind: 'unreadable', reason, folderName: 'Health' });

    const dialog = screen.getByRole('dialog', { name: "The folder copy can't be read" });
    expect(dialog).toHaveTextContent(message);
    expect(dialog).toHaveTextContent('has not been changed');
    // The sync never writes over a copy it cannot read, so replacing is no choice to offer
    expect(dialog).toHaveTextContent('HemoIO will not write over it');
    expect(dialog).toHaveTextContent('choose another folder in Settings');
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replace folder copy…' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
  });

  it('explains a folder from another setup', async () => {
    const { onDecide } = renderModal({ kind: 'unreadable', reason: 'another-setup', folderName: 'Health' });

    const dialog = screen.getByRole('dialog', { name: "The folder copy can't be read" });
    expect(dialog).toHaveTextContent(
      "The copy in “Health” belongs to another HemoIO setup, made with a different key. HemoIO won't write over it. To use that folder on this computer, HemoIO must be set up again from that folder's copy."
    );
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Replace folder copy/ })).not.toBeInTheDocument();
    const notNow = screen.getByRole('button', { name: 'Not now' });
    await waitFor(() => expect(notNow).toHaveFocus());
    await userEvent.click(notNow);
    expect(onDecide).toHaveBeenCalledWith('hold');
  });
});
