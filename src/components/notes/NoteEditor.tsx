/**
 * NoteEditor Component
 *
 * A component for creating and editing user notes.
 * Supports basic text input with tag management.
 */

import { useState, useCallback, useLayoutEffect, useRef, useId } from 'react';
import {
  Stack,
  Textarea,
  Group,
  Button,
  TagsInput,
  Text,
  Paper,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import {
  IconNote,
  IconX,
  IconCheck,
  IconBold,
  IconItalic,
  IconList,
  IconListNumbers,
} from '@tabler/icons-react';
import { applyNoteFormat, type NoteFormat } from '@/utils/noteFormatting';

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

const FORMATS: Array<{
  format: NoteFormat;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
}> = [
  { format: 'bold', label: 'Bold', shortcut: 'Ctrl+B', icon: <IconBold size={16} /> },
  { format: 'italic', label: 'Italic', shortcut: 'Ctrl+I', icon: <IconItalic size={16} /> },
  { format: 'bullet-list', label: 'Bullet list', icon: <IconList size={16} /> },
  { format: 'numbered-list', label: 'Numbered list', icon: <IconListNumbers size={16} /> },
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textareaId = useId();
  const pendingSelection = useRef<[number, number] | null>(null);
  const [activeFormat, setActiveFormat] = useState(0);
  const toolbarButtons = useRef<Array<HTMLButtonElement | null>>([]);

  // Restore the selection after React has written the formatted text
  useLayoutEffect(() => {
    const selection = pendingSelection.current;
    if (selection && textareaRef.current) {
      textareaRef.current.setSelectionRange(selection[0], selection[1]);
      pendingSelection.current = null;
    }
  }, [content]);

  const applyFormat = useCallback(
    (format: NoteFormat) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const edit = applyNoteFormat(content, textarea.selectionStart, textarea.selectionEnd, format);
      if (edit.text.length > maxLength) return;
      pendingSelection.current = [edit.selectionStart, edit.selectionEnd];
      setContent(edit.text);
      textarea.focus();
    },
    [content, maxLength]
  );

  // One Tab stop for the toolbar; arrow keys move between its buttons
  const handleToolbarKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : FORMATS.length - 1;
    const next = (activeFormat + step) % FORMATS.length;
    setActiveFormat(next);
    toolbarButtons.current[next]?.focus();
  };

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
    // The save button is disabled while saving; the shortcut must be too
    if (trimmedContent.length === 0 || isSaving) {
      return;
    }
    onSave(trimmedContent, tags);
  }, [content, tags, onSave, isSaving]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Ctrl/Cmd + Enter to save
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        handleSave();
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'b' || event.key === 'i')) {
        event.preventDefault();
        applyFormat(event.key === 'b' ? 'bold' : 'italic');
        return;
      }
      // Escape to cancel
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    },
    [handleSave, onCancel, applyFormat]
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

        <Group
          gap={4}
          role="toolbar"
          aria-label="Formatting"
          aria-controls={textareaId}
          onKeyDown={handleToolbarKeyDown}
        >
          {FORMATS.map(({ format, label, shortcut, icon }, i) => (
            <Tooltip key={format} label={shortcut ? `${label} (${shortcut})` : label}>
              <ActionIcon
                ref={(el) => {
                  toolbarButtons.current[i] = el;
                }}
                variant="subtle"
                color="gray"
                aria-label={label}
                tabIndex={i === activeFormat ? 0 : -1}
                // Keep the textarea's selection: a click must not move focus first
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setActiveFormat(i);
                  applyFormat(format);
                }}
              >
                {icon}
              </ActionIcon>
            </Tooltip>
          ))}
        </Group>

        <Textarea
          ref={textareaRef}
          id={textareaId}
          // Escape cancels the editor; inside a modal it must not also close the modal
          data-mantine-stop-propagation="true"
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
