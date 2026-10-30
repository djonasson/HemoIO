import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { SaveError } from '@data/db/saveError';
import { MeasurementNotesDialog } from './MeasurementNotesDialog';
import type { UserNote } from '@/types';

const measurement = {
  testValueId: 2,
  labResultId: 1,
  value: 125,
  unit: 'mg/dL',
  date: new Date('2024-01-15T12:00:00Z'),
  status: 'high',
  labName: 'Quest Diagnostics',
};

function renderDialog(props: Partial<React.ComponentProps<typeof MeasurementNotesDialog>> = {}) {
  const handlers = {
    onClose: vi.fn(),
    onCreateNote: vi.fn().mockResolvedValue(undefined),
    onUpdateNote: vi.fn().mockResolvedValue(undefined),
    onDeleteNote: vi.fn().mockResolvedValue(undefined),
  };
  render(
    <MantineProvider env="test">
      <MeasurementNotesDialog measurement={measurement} notes={[]} {...handlers} {...props} />
    </MantineProvider>
  );
  return handlers;
}

describe('MeasurementNotesDialog', () => {
  it('shows the measurement and offers to add a note', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('125 mg/dL');
    expect(dialog).toHaveTextContent('Quest Diagnostics');
    expect(screen.getByRole('button', { name: 'Add Note' })).toBeInTheDocument();
  });

  it('heads the editor with the measurement and saves the note', async () => {
    const { onCreateNote } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Add Note' }));

    expect(
      screen.getByRole('heading', { name: 'Note for 125 mg/dL on Jan 15, 2024' })
    ).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Note content' }), 'Big dinner');
    await userEvent.click(screen.getByRole('button', { name: 'Save Note' }));

    expect(onCreateNote).toHaveBeenCalledWith('Big dinner', []);
  });

  it('says why a note was not saved, and keeps it in the editor to try again', async () => {
    renderDialog({ onCreateNote: vi.fn().mockRejectedValue(new SaveError('quota')) });
    await userEvent.click(screen.getByRole('button', { name: 'Add Note' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Note content' }), 'Big dinner');
    await userEvent.click(screen.getByRole('button', { name: 'Save Note' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Note not saved');
    expect(alert).toHaveTextContent(/no room left/);
    expect(alert).not.toHaveTextContent('Big dinner');
    expect(screen.getByRole('textbox', { name: 'Note content' })).toHaveValue('Big dinner');
  });

  it('forgets a failed save once the editor is closed', async () => {
    renderDialog({ onCreateNote: vi.fn().mockRejectedValue(new SaveError('failed')) });
    await userEvent.click(screen.getByRole('button', { name: 'Add Note' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Note content' }), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Save Note' }));
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add Note' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lists the notes on the measurement', () => {
    const note: UserNote = {
      id: 1,
      testValueId: 2,
      content: 'Fasted',
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    renderDialog({ notes: [note] });
    expect(screen.getByText('Fasted')).toBeInTheDocument();
  });

  it('renders nothing without a measurement', () => {
    renderDialog({ measurement: null });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cancels the editor on Escape without closing the dialog', async () => {
    const { onClose } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Add Note' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Note content' }), 'draft');

    await userEvent.keyboard('{Escape}');

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Note content' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Note' })).toBeInTheDocument();
  });

  it('returns focus to what opened it when it closes', async () => {
    function Page() {
      const [open, setOpen] = useState(false);
      return (
        <MantineProvider env="test">
          <button onClick={() => setOpen(true)}>125 mg/dL point</button>
          <MeasurementNotesDialog
            measurement={open ? measurement : null}
            notes={[]}
            onClose={() => setOpen(false)}
            onCreateNote={vi.fn()}
            onUpdateNote={vi.fn()}
            onDeleteNote={vi.fn()}
          />
        </MantineProvider>
      );
    }
    render(<Page />);
    const opener = screen.getByRole('button', { name: '125 mg/dL point' });
    opener.focus();
    await userEvent.keyboard('{Enter}');
    await screen.findByRole('dialog');

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
