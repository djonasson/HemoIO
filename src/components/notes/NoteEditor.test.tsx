/**
 * Tests for NoteEditor component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { NoteEditor } from './NoteEditor';

function renderWithProviders(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe('NoteEditor', () => {
  const defaultProps = {
    onSave: vi.fn(),
    onCancel: vi.fn(),
  };

  describe('rendering', () => {
    it('should render the editor', () => {
      renderWithProviders(<NoteEditor {...defaultProps} />);

      expect(screen.getByText('Add Note')).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /note content/i })).toBeInTheDocument();
    });

    it('should show "Edit Note" when isEditing is true', () => {
      renderWithProviders(<NoteEditor {...defaultProps} isEditing />);

      expect(screen.getByText('Edit Note')).toBeInTheDocument();
    });

    it('should render with initial content', () => {
      renderWithProviders(
        <NoteEditor {...defaultProps} initialContent="Initial note" />
      );

      expect(screen.getByDisplayValue('Initial note')).toBeInTheDocument();
    });

    it('should render with initial tags', () => {
      renderWithProviders(
        <NoteEditor {...defaultProps} initialTags={['symptom', 'medication']} />
      );

      expect(screen.getByText('symptom')).toBeInTheDocument();
      expect(screen.getByText('medication')).toBeInTheDocument();
    });

    it('should show character count', () => {
      renderWithProviders(<NoteEditor {...defaultProps} maxLength={1000} />);

      expect(screen.getByText('0 / 1000')).toBeInTheDocument();
    });

    it('should show keyboard shortcuts hint', () => {
      renderWithProviders(<NoteEditor {...defaultProps} />);

      expect(screen.getByText(/ctrl\+enter to save/i)).toBeInTheDocument();
    });
  });

  describe('content input', () => {
    it('should update content when typing', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NoteEditor {...defaultProps} />);

      const textarea = screen.getByRole('textbox', { name: /note content/i });
      await user.type(textarea, 'Hello world');

      expect(textarea).toHaveValue('Hello world');
    });

    it('should update character count when typing', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NoteEditor {...defaultProps} maxLength={100} />);

      const textarea = screen.getByRole('textbox', { name: /note content/i });
      await user.type(textarea, 'Hello');

      expect(screen.getByText('5 / 100')).toBeInTheDocument();
    });

    it('should not allow content beyond maxLength', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NoteEditor {...defaultProps} maxLength={5} />);

      const textarea = screen.getByRole('textbox', { name: /note content/i });
      await user.type(textarea, 'Hello World');

      expect(textarea).toHaveValue('Hello');
    });

    it('should use custom placeholder', () => {
      renderWithProviders(
        <NoteEditor {...defaultProps} placeholder="Custom placeholder" />
      );

      expect(screen.getByPlaceholderText('Custom placeholder')).toBeInTheDocument();
    });
  });

  describe('save functionality', () => {
    it('should call onSave with content and tags when save button is clicked', async () => {
      const onSave = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<NoteEditor {...defaultProps} onSave={onSave} />);

      const textarea = screen.getByRole('textbox', { name: /note content/i });
      await user.type(textarea, 'Test note');

      const saveButton = screen.getByRole('button', { name: /save note/i });
      await user.click(saveButton);

      expect(onSave).toHaveBeenCalledWith('Test note', []);
    });

    it('should trim whitespace from content before saving', async () => {
      const onSave = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<NoteEditor {...defaultProps} onSave={onSave} />);

      const textarea = screen.getByRole('textbox', { name: /note content/i });
      await user.type(textarea, '  Test note  ');

      const saveButton = screen.getByRole('button', { name: /save note/i });
      await user.click(saveButton);

      expect(onSave).toHaveBeenCalledWith('Test note', []);
    });

    it('should disable save button when content is empty', () => {
      renderWithProviders(<NoteEditor {...defaultProps} />);

      const saveButton = screen.getByRole('button', { name: /save note/i });
      expect(saveButton).toBeDisabled();
    });

    it('should enable save button when content is entered', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NoteEditor {...defaultProps} />);

      const textarea = screen.getByRole('textbox', { name: /note content/i });
      await user.type(textarea, 'Test');

      const saveButton = screen.getByRole('button', { name: /save note/i });
      expect(saveButton).toBeEnabled();
    });

    it('should not save when content is only whitespace', async () => {
      const onSave = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<NoteEditor {...defaultProps} onSave={onSave} />);

      const textarea = screen.getByRole('textbox', { name: /note content/i });
      await user.type(textarea, '   ');

      const saveButton = screen.getByRole('button', { name: /save note/i });
      expect(saveButton).toBeDisabled();
    });

    it('should show "Save Changes" button when editing', () => {
      renderWithProviders(
        <NoteEditor {...defaultProps} isEditing initialContent="Test" />
      );

      expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    });

    it('should show loading state when saving', () => {
      renderWithProviders(
        <NoteEditor {...defaultProps} isSaving initialContent="Test" />
      );

      const saveButton = screen.getByRole('button', { name: /save note/i });
      expect(saveButton).toBeDisabled();
    });
  });

  describe('cancel functionality', () => {
    it('should call onCancel when cancel button is clicked', async () => {
      const onCancel = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<NoteEditor {...defaultProps} onCancel={onCancel} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(onCancel).toHaveBeenCalled();
    });

    it('should disable cancel button when saving', () => {
      renderWithProviders(<NoteEditor {...defaultProps} isSaving />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      expect(cancelButton).toBeDisabled();
    });
  });

  describe('keyboard shortcuts', () => {
    it('should save on Ctrl+Enter', async () => {
      const onSave = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<NoteEditor {...defaultProps} onSave={onSave} />);

      const textarea = screen.getByRole('textbox', { name: /note content/i });
      await user.type(textarea, 'Test note');

      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

      expect(onSave).toHaveBeenCalledWith('Test note', []);
    });

    it('should cancel on Escape', async () => {
      const onCancel = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<NoteEditor {...defaultProps} onCancel={onCancel} />);

      const textarea = screen.getByRole('textbox', { name: /note content/i });
      await user.click(textarea);

      fireEvent.keyDown(textarea, { key: 'Escape' });

      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe('tags', () => {
    it('should render tags input', () => {
      renderWithProviders(<NoteEditor {...defaultProps} />);

      // TagsInput renders with "Tags" label text
      expect(screen.getByText('Tags')).toBeInTheDocument();
    });

    it('should include tags in onSave callback', async () => {
      const onSave = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(
        <NoteEditor
          {...defaultProps}
          onSave={onSave}
          initialContent="Test"
          initialTags={['symptom']}
        />
      );

      const saveButton = screen.getByRole('button', { name: /save note/i });
      await user.click(saveButton);

      expect(onSave).toHaveBeenCalledWith('Test', ['symptom']);
    });
  });

  describe('accessibility', () => {
    it('should have accessible textarea label', () => {
      renderWithProviders(<NoteEditor {...defaultProps} />);

      expect(screen.getByRole('textbox', { name: /note content/i })).toBeInTheDocument();
    });

    it('should have accessible tags input', () => {
      renderWithProviders(<NoteEditor {...defaultProps} />);

      // TagsInput has aria-label on the input field
      expect(screen.getByRole('textbox', { name: /note tags/i })).toBeInTheDocument();
    });

    it('should have focusable elements', () => {
      renderWithProviders(<NoteEditor {...defaultProps} />);

      // Both textareas should be in the document
      const textareas = screen.getAllByRole('textbox');
      expect(textareas.length).toBeGreaterThanOrEqual(2); // Note content + tags input
    });
  });
});
