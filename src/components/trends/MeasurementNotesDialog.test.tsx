import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
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
});
