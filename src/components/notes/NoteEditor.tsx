/**
 * NoteEditor Component
 *
 * A component for creating and editing user notes.
 * Supports basic text input with tag management.
 */

import { useState, useCallback } from 'react';
import {
  Stack,
  Textarea,
  Group,
  Button,
  TagsInput,
  Text,
  Paper,
} from '@mantine/core';
import { IconNote, IconX, IconCheck } from '@tabler/icons-react';

/**
 * Props for NoteEditor component
 */
export interface NoteEditorProps {
  /** Initial content for editing an existing note */
  initialContent?: string;
  /** Initial tags for editing an existing note */
  initialTags?: string[];
  /** Called when the note is saved */
  onSave: (content: string, tags: string[]) => void;
  /** Called when editing is cancelled */
  onCancel: () => void;
  /** Whether the editor is in edit mode (vs create mode) */
  isEditing?: boolean;
  /** Placeholder text for the textarea */
  placeholder?: string;
  /** Auto-focus the textarea on mount */
  autoFocus?: boolean;
  /** Maximum character count */
  maxLength?: number;
  /** Whether save is in progress */
  isSaving?: boolean;
}

/**
 * Common tags for suggestions
 */
const COMMON_TAGS = [
  'symptom',
  'medication',
  'diet',
  'exercise',
  'sleep',
  'stress',
  'fasting',
  'followup',
];

/**
 * NoteEditor component for creating and editing notes
 */
export function NoteEditor({
  initialContent = '',
  initialTags = [],
  onSave,
  onCancel,
  isEditing = false,
  placeholder = 'Add a note about this result...',
  autoFocus = true,
  maxLength = 5000,
  isSaving = false,
}: NoteEditorProps): React.ReactNode {
  const [content, setContent] = useState(initialContent);
  const [tags, setTags] = useState<string[]>(initialTags);

  const handleContentChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newContent = event.target.value;
      if (newContent.length <= maxLength) {
        setContent(newContent);
      }
    },
    [maxLength]
  );

  const handleSave = useCallback(() => {
    const trimmedContent = content.trim();
    if (trimmedContent.length === 0) {
      return;
    }
    onSave(trimmedContent, tags);
  }, [content, tags, onSave]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Ctrl/Cmd + Enter to save
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        handleSave();
      }
      // Escape to cancel
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    },
    [handleSave, onCancel]
  );

  const canSave = content.trim().length > 0 && !isSaving;
  const characterCount = content.length;
  const isNearLimit = characterCount > maxLength * 0.9;

  return (
    <Paper p="md" withBorder>
      <Stack gap="sm">
        <Group gap="xs">
          <IconNote size={16} />
          <Text size="sm" fw={500}>
            {isEditing ? 'Edit Note' : 'Add Note'}
          </Text>
        </Group>

        <Textarea
          value={content}
          onChange={handleContentChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          minRows={3}
          maxRows={10}
          autosize
          autoFocus={autoFocus}
          aria-label={isEditing ? 'Edit note content' : 'Note content'}
        />

        <Group justify="space-between">
          <Text size="xs" c={isNearLimit ? 'orange' : 'dimmed'}>
            {characterCount} / {maxLength}
          </Text>
          <Text size="xs" c="dimmed">
            Ctrl+Enter to save, Esc to cancel
          </Text>
        </Group>

        <TagsInput
          label="Tags"
          placeholder="Add tags (press Enter)"
          value={tags}
          onChange={setTags}
          data={COMMON_TAGS}
          clearable
          maxTags={10}
          aria-label="Note tags"
        />

        <Group justify="flex-end" gap="sm">
          <Button
            variant="subtle"
            color="gray"
            leftSection={<IconX size={16} />}
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            leftSection={<IconCheck size={16} />}
            onClick={handleSave}
            disabled={!canSave}
            loading={isSaving}
          >
            {isEditing ? 'Save Changes' : 'Save Note'}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
