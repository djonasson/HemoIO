/**
 * Tests for NotesSection component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { SaveError } from '@data/db/saveError';
import { notifySaveFailed } from '@components/common/notifySaveFailed';
import { NotesSection } from './NotesSection';
import type { UserNote } from '@/types';

vi.mock('@components/common/notifySaveFailed', () => ({ notifySaveFailed: vi.fn() }));

function renderWithProviders(ui: React.ReactElement) {
  return render(<MantineProvider env="test">{ui}</MantineProvider>);
}

function createMockNote(id: number, overrides: Partial<UserNote> = {}): UserNote {
  const now = new Date('2024-01-15T10:30:00');
  return {
    id,
    content: `Note ${id} content`,
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('NotesSection', () => {
  const defaultProps = {
    notes: [] as UserNote[],
    onCreateNote: vi.fn(),
    onUpdateNote: vi.fn(),
    onDeleteNote: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the section title', () => {
      renderWithProviders(<NotesSection {...defaultProps} />);

      expect(screen.getByText('Notes')).toBeInTheDocument();
    });

    it('should render with custom title', () => {
      renderWithProviders(<NotesSection {...defaultProps} title="My Notes" />);

      expect(screen.getByText('My Notes')).toBeInTheDocument();
    });

    it('should show note count when notes exist', () => {
      const notes = [createMockNote(1), createMockNote(2)];
      renderWithProviders(<NotesSection {...defaultProps} notes={notes} />);

      expect(screen.getByText('(2)')).toBeInTheDocument();
    });

    it('should render existing notes', () => {
      const notes = [
        createMockNote(1, { content: 'First note' }),
        createMockNote(2, { content: 'Second note' }),
      ];
      renderWithProviders(<NotesSection {...defaultProps} notes={notes} />);

      expect(screen.getByText('First note')).toBeInTheDocument();
      expect(screen.getByText('Second note')).toBeInTheDocument();
    });

    it('should show empty state when no notes', () => {
      renderWithProviders(<NotesSection {...defaultProps} />);

      expect(screen.getByText('No notes yet')).toBeInTheDocument();
    });

    it('should show Add Note button', () => {
      renderWithProviders(<NotesSection {...defaultProps} />);

      expect(screen.getByRole('button', { name: /add note/i })).toBeInTheDocument();
    });
  });

  describe('collapse/expand', () => {
    it('should start expanded by default', () => {
      renderWithProviders(<NotesSection {...defaultProps} />);

      expect(screen.getByText('No notes yet')).toBeVisible();
    });

    it('should start collapsed when defaultCollapsed is true', () => {
      renderWithProviders(<NotesSection {...defaultProps} defaultCollapsed />);

      // Content should not be visible
      expect(screen.queryByText('No notes yet')).not.toBeVisible();
    });

    it('should follow defaultCollapsed when it changes before the user toggles', () => {
      // Lab result cards render before their notes have loaded, so the
      // default changes from collapsed (no notes) to expanded (has notes)
      const { rerender } = renderWithProviders(<NotesSection {...defaultProps} defaultCollapsed />);
      rerender(
        <MantineProvider env="test">
          <NotesSection {...defaultProps} defaultCollapsed={false} />
        </MantineProvider>
      );

      expect(
        screen.getByRole('button', { name: /section, expanded/ })
      ).toHaveAttribute('aria-expanded', 'true');
    });

    it('should keep the user\'s choice when defaultCollapsed changes', async () => {
      const user = userEvent.setup();
      const { rerender } = renderWithProviders(<NotesSection {...defaultProps} defaultCollapsed />);

      await user.click(screen.getByRole('button', { name: /section, collapsed/ }));
      await user.click(screen.getByRole('button', { name: /section, expanded/ }));
      rerender(
        <MantineProvider env="test">
          <NotesSection {...defaultProps} defaultCollapsed={false} />
        </MantineProvider>
      );

      expect(screen.getByRole('button', { name: /section, collapsed/ })).toBeInTheDocument();
    });

    it('should toggle collapse when header is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NotesSection {...defaultProps} />);

      // Click to collapse
      const header = screen.getByRole('button', { name: /notes section/i });
      await user.click(header);

      // Content should be hidden
      await waitFor(() => {
        expect(screen.queryByText('No notes yet')).not.toBeVisible();
      });

      // Click to expand
      await user.click(header);

      // Content should be visible again
      await waitFor(() => {
        expect(screen.getByText('No notes yet')).toBeVisible();
      });
    });
  });

  describe('add note', () => {
    it('should show editor when Add Note is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NotesSection {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /add note/i }));

      // NoteEditor shows "Add Note" in the header
      expect(screen.getByRole('textbox', { name: /note content/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save note/i })).toBeInTheDocument();
    });

    it('should hide editor when cancel is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NotesSection {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /add note/i }));
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      expect(screen.queryByRole('textbox', { name: /note content/i })).not.toBeInTheDocument();
    });

    it('should call onCreateNote when saving', async () => {
      const onCreateNote = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderWithProviders(<NotesSection {...defaultProps} onCreateNote={onCreateNote} />);

      await user.click(screen.getByRole('button', { name: /add note/i }));
      await user.type(screen.getByRole('textbox', { name: /note content/i }), 'New note');
      await user.click(screen.getByRole('button', { name: /save note/i }));

      expect(onCreateNote).toHaveBeenCalledWith('New note', []);
    });

    it('should hide editor after successful save', async () => {
      const onCreateNote = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderWithProviders(<NotesSection {...defaultProps} onCreateNote={onCreateNote} />);

      await user.click(screen.getByRole('button', { name: /add note/i }));
      await user.type(screen.getByRole('textbox', { name: /note content/i }), 'New note');
      await user.click(screen.getByRole('button', { name: /save note/i }));

      await waitFor(() => {
        expect(screen.queryByRole('textbox', { name: /note content/i })).not.toBeInTheDocument();
      });
    });

    it('should show editor by default when showEditorByDefault is true', () => {
      renderWithProviders(<NotesSection {...defaultProps} showEditorByDefault />);

      expect(screen.getByRole('textbox', { name: /note content/i })).toBeInTheDocument();
    });

    it('should use custom placeholder', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <NotesSection {...defaultProps} editorPlaceholder="Custom placeholder" />
      );

      await user.click(screen.getByRole('button', { name: /add note/i }));

      expect(screen.getByPlaceholderText('Custom placeholder')).toBeInTheDocument();
    });
  });

  describe('update note', () => {
    it('should call onUpdateNote when note is updated', async () => {
      const onUpdateNote = vi.fn().mockResolvedValue(undefined);
      const notes = [createMockNote(1, { content: 'Original content' })];
      const user = userEvent.setup();
      renderWithProviders(
        <NotesSection {...defaultProps} notes={notes} onUpdateNote={onUpdateNote} />
      );

      // Click edit on the note
      await user.click(screen.getByRole('button', { name: /edit note/i }));

      // Edit and save
      const textarea = screen.getByRole('textbox', { name: /note content/i });
      await user.clear(textarea);
      await user.type(textarea, 'Updated content');
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      expect(onUpdateNote).toHaveBeenCalledWith(1, 'Updated content', []);
    });
  });

  describe('delete note', () => {
    it('should call onDeleteNote when note is deleted', async () => {
      const onDeleteNote = vi.fn().mockResolvedValue(undefined);
      const notes = [createMockNote(1)];
      const user = userEvent.setup();
      renderWithProviders(
        <NotesSection {...defaultProps} notes={notes} onDeleteNote={onDeleteNote} />
      );

      // Click delete
      await user.click(screen.getByRole('button', { name: /delete note/i }));

      // Confirm deletion in modal
      await waitFor(() => {
        expect(screen.getByText('Delete Note')).toBeInTheDocument();
      });

      const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
      const confirmButton = deleteButtons.find(btn => btn.textContent === 'Delete');
      await user.click(confirmButton!);

      expect(onDeleteNote).toHaveBeenCalledWith(1);
    });
  });

  describe('disabled state', () => {
    it('should disable Add Note button when processing', () => {
      renderWithProviders(<NotesSection {...defaultProps} isProcessing />);

      expect(screen.getByRole('button', { name: /add note/i })).toBeDisabled();
    });
  });

  describe('a note that cannot be saved', () => {
    it('stays in the editor and says why, without quoting the note', async () => {
      const onCreateNote = vi.fn().mockRejectedValue(new SaveError('quota'));
      const user = userEvent.setup();
      renderWithProviders(<NotesSection {...defaultProps} onCreateNote={onCreateNote} />);

      await user.click(screen.getByRole('button', { name: /add note/i }));
      await user.type(screen.getByRole('textbox', { name: /note content/i }), 'Felt tired');
      await user.click(screen.getByRole('button', { name: /save note/i }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Note not saved');
      expect(alert).toHaveTextContent(/no room left/);
      expect(alert).not.toHaveTextContent('Felt tired');
      expect(screen.getByRole('textbox', { name: /note content/i })).toHaveValue('Felt tired');
    });

    it('notifies a failure that comes after the section was closed', async () => {
      let fail!: (err: unknown) => void;
      const onCreateNote = vi.fn(() => new Promise<void>((_, reject) => (fail = reject)));
      const user = userEvent.setup();
      const { unmount } = renderWithProviders(
        <NotesSection {...defaultProps} onCreateNote={onCreateNote} />
      );

      await user.click(screen.getByRole('button', { name: /add note/i }));
      await user.type(screen.getByRole('textbox', { name: /note content/i }), 'Note');
      await user.click(screen.getByRole('button', { name: /save note/i }));
      unmount();
      fail(new SaveError('timeout'));

      await waitFor(() =>
        expect(notifySaveFailed).toHaveBeenCalledWith('Note not saved', expect.any(SaveError))
      );
    });

    it('stays open while a note saves, so the outcome is seen', async () => {
      const onCreateNote = vi.fn(() => new Promise<void>(() => {}));
      const user = userEvent.setup();
      renderWithProviders(<NotesSection {...defaultProps} onCreateNote={onCreateNote} />);

      await user.click(screen.getByRole('button', { name: /add note/i }));
      await user.type(screen.getByRole('textbox', { name: /note content/i }), 'Note');
      await user.click(screen.getByRole('button', { name: /save note/i }));
      await user.click(screen.getByRole('button', { name: /section, expanded/ }));

      expect(screen.getByRole('button', { name: /section, expanded/ })).toBeInTheDocument();
    });

    it('clears the error once the note is saved, or the editor is closed', async () => {
      const onCreateNote = vi
        .fn()
        .mockRejectedValueOnce(new SaveError('failed'))
        .mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderWithProviders(<NotesSection {...defaultProps} onCreateNote={onCreateNote} />);

      await user.click(screen.getByRole('button', { name: /add note/i }));
      await user.type(screen.getByRole('textbox', { name: /note content/i }), 'Note');
      await user.click(screen.getByRole('button', { name: /save note/i }));
      await screen.findByRole('alert');
      await user.click(screen.getByRole('button', { name: /save note/i }));

      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
      expect(screen.queryByRole('textbox', { name: /note content/i })).not.toBeInTheDocument();
    });
  });
});
