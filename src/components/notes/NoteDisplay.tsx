/**
 * NoteDisplay Component
 *
 * Displays a user note with content, tags, and actions.
 */

import { useState } from 'react';
import {
  Paper,
  Text,
  Group,
  Badge,
  ActionIcon,
  Stack,
  Modal,
  Button,
} from '@mantine/core';
import { IconEdit, IconTrash, IconNote } from '@tabler/icons-react';
import type { UserNote } from '@/types';
import { NoteEditor } from './NoteEditor';

/**
 * Props for NoteDisplay component
 */
export interface NoteDisplayProps {
  /** The note to display */
  note: UserNote;
  /** Called when note is updated */
  onUpdate: (id: number, content: string, tags: string[]) => Promise<void>;
  /** Called when note is deleted */
  onDelete: (id: number) => Promise<void>;
  /** Whether actions are currently processing */
  isProcessing?: boolean;
}

/**
 * Formats a date for display
 */
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/**
 * NoteDisplay component for showing a note with actions
 */
export function NoteDisplay({
  note,
  onUpdate,
  onDelete,
  isProcessing = false,
}: NoteDisplayProps): React.ReactNode {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleSaveEdit = async (content: string, tags: string[]) => {
    if (!note.id) return;
    setIsSaving(true);
    try {
      await onUpdate(note.id, content, tags);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteClick = () => {
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!note.id) return;
    setIsDeleting(true);
    try {
      await onDelete(note.id);
      setDeleteConfirmOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false);
  };

  if (isEditing) {
    return (
      <NoteEditor
        initialContent={note.content}
        initialTags={note.tags}
        onSave={handleSaveEdit}
        onCancel={handleCancelEdit}
        isEditing
        isSaving={isSaving}
      />
    );
  }

  const wasEdited =
    note.updatedAt.getTime() !== note.createdAt.getTime();

  return (
    <>
      <Paper p="sm" withBorder>
        <Stack gap="xs">
          <Group justify="space-between" align="flex-start">
            <Group gap="xs">
              <IconNote size={14} color="gray" />
              <Text size="xs" c="dimmed">
                {formatDate(note.createdAt)}
                {wasEdited && ' (edited)'}
              </Text>
            </Group>
            <Group gap="xs">
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={handleEdit}
                disabled={isProcessing}
                aria-label="Edit note"
              >
                <IconEdit size={14} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                onClick={handleDeleteClick}
                disabled={isProcessing}
                aria-label="Delete note"
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Group>
          </Group>

          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {note.content}
          </Text>

          {note.tags.length > 0 && (
            <Group gap="xs">
              {note.tags.map((tag) => (
                <Badge key={tag} size="xs" variant="light">
                  {tag}
                </Badge>
              ))}
            </Group>
          )}
        </Stack>
      </Paper>

      <Modal
        opened={deleteConfirmOpen}
        onClose={handleCancelDelete}
        title="Delete Note"
        centered
        size="sm"
      >
        <Stack>
          <Text size="sm">
            Are you sure you want to delete this note? This action cannot be
            undone.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button
              variant="subtle"
              color="gray"
              onClick={handleCancelDelete}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              color="red"
              onClick={handleConfirmDelete}
              loading={isDeleting}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
