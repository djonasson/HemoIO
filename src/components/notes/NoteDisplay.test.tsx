/**
 * Tests for NoteDisplay component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { NoteDisplay } from './NoteDisplay';
import type { UserNote } from '@/types';

function renderWithProviders(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

function createMockNote(overrides: Partial<UserNote> = {}): UserNote {
  const now = new Date('2024-01-15T10:30:00');
  return {
    id: 1,
    content: 'Test note content',
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('NoteDisplay', () => {
  const defaultProps = {
    note: createMockNote(),
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render note content', () => {
      renderWithProviders(<NoteDisplay {...defaultProps} />);

      expect(screen.getByText('Test note content')).toBeInTheDocument();
    });

    it('should render note date', () => {
      renderWithProviders(<NoteDisplay {...defaultProps} />);

      expect(screen.getByText(/Jan 15, 2024/)).toBeInTheDocument();
    });

    it('should render tags', () => {
      const note = createMockNote({ tags: ['symptom', 'medication'] });
      renderWithProviders(<NoteDisplay {...defaultProps} note={note} />);

      expect(screen.getByText('symptom')).toBeInTheDocument();
      expect(screen.getByText('medication')).toBeInTheDocument();
    });

    it('should not render tags section when no tags', () => {
      renderWithProviders(<NoteDisplay {...defaultProps} />);

      // Only the note content and date should be present
      const badges = screen.queryAllByRole('status');
      expect(badges).toHaveLength(0);
    });

    it('should show "(edited)" when note was updated', () => {
      const note = createMockNote({
        createdAt: new Date('2024-01-15T10:00:00'),
        updatedAt: new Date('2024-01-15T11:00:00'),
      });
      renderWithProviders(<NoteDisplay {...defaultProps} note={note} />);

      expect(screen.getByText(/\(edited\)/)).toBeInTheDocument();
    });

    it('should not show "(edited)" when note was not updated', () => {
      renderWithProviders(<NoteDisplay {...defaultProps} />);

      expect(screen.queryByText(/\(edited\)/)).not.toBeInTheDocument();
    });

    it('should render edit and delete buttons', () => {
      renderWithProviders(<NoteDisplay {...defaultProps} />);

      expect(screen.getByRole('button', { name: /edit note/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /delete note/i })).toBeInTheDocument();
    });
  });

  describe('edit functionality', () => {
    it('should show editor when edit button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NoteDisplay {...defaultProps} />);

      const editButton = screen.getByRole('button', { name: /edit note/i });
      await user.click(editButton);

      expect(screen.getByText('Edit Note')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Test note content')).toBeInTheDocument();
    });

    it('should hide editor when cancel is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NoteDisplay {...defaultProps} />);

      // Open editor
      await user.click(screen.getByRole('button', { name: /edit note/i }));
      expect(screen.getByText('Edit Note')).toBeInTheDocument();

      // Cancel
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      // Should show note display again
      expect(screen.queryByText('Edit Note')).not.toBeInTheDocument();
      expect(screen.getByText('Test note content')).toBeInTheDocument();
    });

    it('should call onUpdate when saving edits', async () => {
      const onUpdate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderWithProviders(<NoteDisplay {...defaultProps} onUpdate={onUpdate} />);

      // Open editor
      await user.click(screen.getByRole('button', { name: /edit note/i }));

      // Edit content
      const textarea = screen.getByRole('textbox', { name: /note content/i });
      await user.clear(textarea);
      await user.type(textarea, 'Updated content');

      // Save
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      expect(onUpdate).toHaveBeenCalledWith(1, 'Updated content', []);
    });

    it('should close editor after successful save', async () => {
      const onUpdate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderWithProviders(<NoteDisplay {...defaultProps} onUpdate={onUpdate} />);

      await user.click(screen.getByRole('button', { name: /edit note/i }));
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(screen.queryByText('Edit Note')).not.toBeInTheDocument();
      });
    });

    it('should preserve existing tags when editing', async () => {
      const note = createMockNote({ tags: ['symptom'] });
      const onUpdate = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderWithProviders(
        <NoteDisplay {...defaultProps} note={note} onUpdate={onUpdate} />
      );

      await user.click(screen.getByRole('button', { name: /edit note/i }));
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      expect(onUpdate).toHaveBeenCalledWith(1, 'Test note content', ['symptom']);
    });
  });

  describe('delete functionality', () => {
    it('should show confirmation modal when delete is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NoteDisplay {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /delete note/i }));

      await waitFor(() => {
        expect(screen.getByText('Delete Note')).toBeInTheDocument();
      });
      expect(screen.getByText(/Are you sure/)).toBeInTheDocument();
    });

    it('should close modal when cancel is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NoteDisplay {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /delete note/i }));

      // Wait for modal to appear
      await waitFor(() => {
        expect(screen.getByText('Delete Note')).toBeInTheDocument();
      });

      // Click cancel in the modal
      const cancelButtons = screen.getAllByRole('button', { name: /cancel/i });
      await user.click(cancelButtons[cancelButtons.length - 1]);

      await waitFor(() => {
        expect(screen.queryByText('Delete Note')).not.toBeInTheDocument();
      });
    });

    it('should call onDelete when confirmed', async () => {
      const onDelete = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderWithProviders(<NoteDisplay {...defaultProps} onDelete={onDelete} />);

      await user.click(screen.getByRole('button', { name: /delete note/i }));

      // Wait for modal to appear
      await waitFor(() => {
        expect(screen.getByText('Delete Note')).toBeInTheDocument();
      });

      // Click the Delete button in the modal (second button with that name)
      const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
      const confirmButton = deleteButtons.find(btn => btn.textContent === 'Delete');
      await user.click(confirmButton!);

      expect(onDelete).toHaveBeenCalledWith(1);
    });

    it('should close modal after successful delete', async () => {
      const onDelete = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderWithProviders(<NoteDisplay {...defaultProps} onDelete={onDelete} />);

      await user.click(screen.getByRole('button', { name: /delete note/i }));

      // Wait for modal to appear
      await waitFor(() => {
        expect(screen.getByText('Delete Note')).toBeInTheDocument();
      });

      // Click the Delete button in the modal
      const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
      const confirmButton = deleteButtons.find(btn => btn.textContent === 'Delete');
      await user.click(confirmButton!);

      await waitFor(() => {
        expect(screen.queryByText('Delete Note')).not.toBeInTheDocument();
      });
    });
  });

  describe('disabled state', () => {
    it('should disable edit button when processing', () => {
      renderWithProviders(<NoteDisplay {...defaultProps} isProcessing />);

      expect(screen.getByRole('button', { name: /edit note/i })).toBeDisabled();
    });

    it('should disable delete button when processing', () => {
      renderWithProviders(<NoteDisplay {...defaultProps} isProcessing />);

      expect(screen.getByRole('button', { name: /delete note/i })).toBeDisabled();
    });
  });

  describe('multiline content', () => {
    it('should preserve line breaks in content', () => {
      const note = createMockNote({ content: 'Line 1\nLine 2\nLine 3' });
      renderWithProviders(<NoteDisplay {...defaultProps} note={note} />);

      const contentElement = screen.getByText(/Line 1/);
      expect(contentElement).toHaveStyle({ whiteSpace: 'pre-wrap' });
    });
  });
});
