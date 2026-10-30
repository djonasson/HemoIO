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
  Spoiler,
} from '@mantine/core';
import { IconEdit, IconTrash, IconNote } from '@tabler/icons-react';
import { RelativeTime } from '@components/common/RelativeTime';
import { SaveFailedAlert } from '@components/common/SaveFailedAlert';
import { useSaveState } from '@hooks/useSaveState';
import type { UserNote } from '@/types';
import { NoteEditor } from './NoteEditor';
import { NoteContent } from './NoteContent';

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
 * NoteDisplay component for showing a note with actions
 */
export function NoteDisplay({
  note,
  onUpdate,
  onDelete,
  isProcessing = false,
}: NoteDisplayProps): React.ReactNode {
  const [isEditing, setIsEditing] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  // Shown in the editor and the dialog while open, notified once they are
  // gone; the note is still as stored
  const edit = useSaveState('Note not saved');
  const deletion = useSaveState('Note not deleted');
  const isSaving = edit.isSaving;
  const isDeleting = deletion.isSaving;

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    edit.clear();
  };

  const handleSaveEdit = async (content: string, tags: string[]) => {
    const id = note.id;
    if (!id) return;
    if (await edit.run(() => onUpdate(id, content, tags))) setIsEditing(false);
  };

  const handleDeleteClick = () => {
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    const id = note.id;
    if (!id) return;
    if (await deletion.run(() => onDelete(id))) setDeleteConfirmOpen(false);
  };

  const handleCancelDelete = () => {
    // Stays open while deleting, so a failure is shown where it happened
    if (isDeleting) return;
    setDeleteConfirmOpen(false);
    deletion.clear();
  };

  if (isEditing) {
    return (
      <Stack gap="xs">
        {edit.error !== null && <SaveFailedAlert title="Note not saved" error={edit.error} />}
        <NoteEditor
          initialContent={note.content}
          initialTags={note.tags}
          onSave={handleSaveEdit}
          onCancel={handleCancelEdit}
          isEditing
          isSaving={isSaving}
        />
      </Stack>
    );
  }

  // An unreadable edit date (NaN) is not an edit
  const wasEdited =
    !Number.isNaN(note.updatedAt.getTime()) &&
    note.updatedAt.getTime() !== note.createdAt.getTime();

  return (
    <>
      <Paper p="sm" withBorder>
        <Stack gap="xs">
          <Group justify="space-between" align="flex-start">
            <Group gap="xs">
              <IconNote size={14} color="gray" />
              <RelativeTime date={note.createdAt} />
              {wasEdited && (
                <RelativeTime date={note.updatedAt} template={(r) => `(edited ${r})`} />
              )}
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

          <Spoiler
            maxHeight={120}
            showLabel="Show full note"
            hideLabel="Show less"
            styles={{ control: { fontSize: 'var(--mantine-font-size-xs)' } }}
          >
            <NoteContent content={note.content} />
          </Spoiler>

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
          {deletion.error !== null && (
            <SaveFailedAlert title="Note not deleted" error={deletion.error} />
          )}
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
