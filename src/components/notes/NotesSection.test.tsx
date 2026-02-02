/**
 * Tests for NotesSection component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { NotesSection } from './NotesSection';
import type { UserNote } from '@/types';

function renderWithProviders(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
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
});
