import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { formatDateTime } from '@/utils/formatDateTime';
import { FolderConflictModal } from './FolderConflictModal';
import type { FolderConflict, FolderConflictChoice } from '@hooks';

const FOLDER_SAVED = new Date('2026-11-05T18:30:00.000Z');
const BROWSER_CHANGED = new Date('2026-11-06T09:15:00.000Z');

const CONFLICT: FolderConflict = {
  folder: { labResults: 3, testValues: 5, notes: 1, savedAt: FOLDER_SAVED },
  browser: { labResults: 2, testValues: 4, notes: 0, savedAt: BROWSER_CHANGED },
  folderName: 'Health',
};

function renderModal(
  conflict: FolderConflict | null = CONFLICT,
  onResolve = vi.fn<(choice: FolderConflictChoice) => Promise<void>>(async () => {})
) {
  render(
    <MantineProvider env="test">
      <FolderConflictModal conflict={conflict} onResolve={onResolve} />
    </MantineProvider>
  );
  return { onResolve };
}

const dialog = (): HTMLElement =>
  screen.getByRole('dialog', { name: 'Your folder copy changed on another computer' });

describe('FolderConflictModal', () => {
  it('is closed without a conflict', () => {
    renderModal(null);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows counts and dates, never values', () => {
    renderModal();

    const folder = screen.getByRole('region', { name: 'In the folder' });
    expect(folder).toHaveTextContent('3 lab results');
    expect(folder).toHaveTextContent('5 test values');
    expect(folder).toHaveTextContent('1 note');
    expect(folder).toHaveTextContent(`Saved ${formatDateTime(FOLDER_SAVED)}`);
    const browser = screen.getByRole('region', { name: 'On this computer' });
    expect(browser).toHaveTextContent('2 lab results');
    expect(browser).toHaveTextContent('4 test values');
    expect(browser).toHaveTextContent('0 notes');
    expect(browser).toHaveTextContent(`Last changed ${formatDateTime(BROWSER_CHANGED)}`);
    expect(dialog()).toHaveTextContent("The side you don't choose is kept as a dated backup in your folder.");
    expect(dialog()).toHaveTextContent('“Health”');
  });

  it('leaves out a date it does not have', () => {
    renderModal({ ...CONFLICT, browser: { ...CONFLICT.browser, savedAt: null } });

    expect(screen.getByRole('region', { name: 'On this computer' })).not.toHaveTextContent('Last changed');
  });

  it('focuses Decide later and Escape decides later', async () => {
    const { onResolve } = renderModal();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Decide later' })).toHaveFocus());
    await userEvent.keyboard('{Escape}');

    expect(onResolve).toHaveBeenCalledWith('later');
  });

  it.each([
    ["Keep this computer's data", 'browser'],
    ['Load the folder copy', 'folder'],
    ['Decide later', 'later'],
  ] as const)('"%s" chooses %s', async (label, choice) => {
    const { onResolve } = renderModal();

    await userEvent.click(screen.getByRole('button', { name: label }));

    expect(onResolve).toHaveBeenCalledWith(choice);
  });

  it('shows the failure alert and stays open', async () => {
    const onResolve = vi.fn(async (choice: FolderConflictChoice) => {
      if (choice !== 'later') throw new Error('Disk full');
    });
    renderModal(CONFLICT, onResolve);

    await userEvent.click(screen.getByRole('button', { name: 'Load the folder copy' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nothing was changed: the backup could not be saved to your folder.'
    );
    expect(dialog()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load the folder copy' })).toBeEnabled();
    expect(screen.getByRole('alert')).not.toHaveTextContent('Disk full');
  });

  it('does not decide later on Escape while a choice is being carried out', async () => {
    let finish!: () => void;
    const onResolve = vi.fn(
      (choice: FolderConflictChoice) =>
        new Promise<void>((resolve) => {
          if (choice === 'later') resolve();
          else finish = resolve;
        })
    );
    renderModal(CONFLICT, onResolve);

    await userEvent.click(screen.getByRole('button', { name: "Keep this computer's data" }));
    await userEvent.keyboard('{Escape}');
    await act(async () => finish());

    expect(onResolve).toHaveBeenCalledTimes(1);
  });
});
