/**
 * Lab Result Card Component
 *
 * Expandable card displaying a lab result summary with test values.
 */

import { useState, useCallback } from 'react';
import {
  Paper,
  Group,
  Stack,
  Text,
  Badge,
  ActionIcon,
  Collapse,
  Tooltip,
  Modal,
  Button,
  Divider,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconChevronDown,
  IconChevronUp,
  IconTrash,
  IconCalendar,
  IconBuilding,
  IconAlertTriangle,
  IconNote,
} from '@tabler/icons-react';
import type { LabResultWithDetails } from '@hooks/useLabResults';
import type { UserNote } from '@/types';
import { TestValuesList } from './TestValuesList';
import { NotesSection } from '@components/notes';

export interface LabResultCardProps {
  /** The lab result to display */
  result: LabResultWithDetails;
  /** Callback when delete is confirmed */
  onDelete: (id: number) => void;
  /** Whether the card is initially expanded */
  defaultExpanded?: boolean;
  /** Notes attached to this lab result */
  notes?: UserNote[];
  /** Callback when creating a note */
  onCreateNote?: (labResultId: number, content: string, tags: string[]) => Promise<void>;
  /** Callback when updating a note */
  onUpdateNote?: (id: number, content: string, tags: string[]) => Promise<void>;
  /** Callback when deleting a note */
  onDeleteNote?: (id: number) => Promise<void>;
}

/**
 * Format a date for display
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format a date for short display
 */
function formatDateShort(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Expandable card showing a lab result with its test values
 */
export function LabResultCard({
  result,
  onDelete,
  defaultExpanded = false,
  notes = [],
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
}: LabResultCardProps): React.ReactNode {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] =
    useDisclosure(false);

  const handleCreateNote = useCallback(
    async (content: string, tags: string[]) => {
      if (result.id !== undefined && onCreateNote) {
        await onCreateNote(result.id, content, tags);
      }
    },
    [result.id, onCreateNote]
  );

  const handleUpdateNote = useCallback(
    async (id: number, content: string, tags: string[]) => {
      if (onUpdateNote) {
        await onUpdateNote(id, content, tags);
      }
    },
    [onUpdateNote]
  );

  const handleDeleteNote = useCallback(
    async (id: number) => {
      if (onDeleteNote) {
        await onDeleteNote(id);
      }
    },
    [onDeleteNote]
  );

  const notesEnabled = onCreateNote && onUpdateNote && onDeleteNote;

  const handleToggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      openDeleteModal();
    },
    [openDeleteModal]
  );

  const handleConfirmDelete = useCallback(() => {
    if (result.id !== undefined) {
      onDelete(result.id);
    }
    closeDeleteModal();
  }, [result.id, onDelete, closeDeleteModal]);

  const hasAbnormalValues = result.abnormalCount > 0;

  return (
    <>
      <Paper
        p="md"
        withBorder
        radius="md"
        shadow={expanded ? 'sm' : undefined}
        role="region"
        aria-label={`Lab result from ${formatDate(result.date)}`}
        aria-expanded={expanded}
      >
        <Stack gap="sm">
          {/* Header - clickable to expand */}
          <Group
            justify="space-between"
            wrap="nowrap"
            style={{ cursor: 'pointer' }}
            onClick={handleToggle}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleToggle();
              }
            }}
            tabIndex={0}
            role="button"
            aria-controls={`lab-result-${result.id}-content`}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} lab result from ${formatDate(result.date)}`}
          >
            <Group gap="md" wrap="nowrap">
              {/* Expand/collapse icon */}
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-hidden="true"
                tabIndex={-1}
              >
                {expanded ? (
                  <IconChevronUp size={20} />
                ) : (
                  <IconChevronDown size={20} />
                )}
              </ActionIcon>

              {/* Date and lab info */}
              <Stack gap={4}>
                <Group gap="xs">
                  <IconCalendar size={16} style={{ opacity: 0.6 }} aria-hidden="true" />
                  <Text fw={600}>{formatDateShort(result.date)}</Text>
                </Group>
                <Group gap="xs">
                  <IconBuilding size={14} style={{ opacity: 0.5 }} aria-hidden="true" />
                  <Text size="sm" c="dimmed">
                    {result.labName}
                  </Text>
                </Group>
              </Stack>
            </Group>

            {/* Badges and actions */}
            <Group gap="sm" wrap="nowrap">
              {/* Biomarker count badge */}
              <Badge variant="light" color="blue">
                {result.totalCount} test{result.totalCount !== 1 ? 's' : ''}
              </Badge>

              {/* Abnormal count badge */}
              {hasAbnormalValues && (
                <Tooltip label={`${result.abnormalCount} value(s) outside reference range`}>
                  <Badge
                    variant="light"
                    color="orange"
                    leftSection={<IconAlertTriangle size={12} />}
                    aria-label={`${result.abnormalCount} abnormal value${result.abnormalCount !== 1 ? 's' : ''}`}
                  >
                    {result.abnormalCount} abnormal
                  </Badge>
                </Tooltip>
              )}

              {/* Notes count badge */}
              {notes.length > 0 && (
                <Tooltip label={`${notes.length} note${notes.length !== 1 ? 's' : ''}`}>
                  <Badge
                    variant="light"
                    color="gray"
                    leftSection={<IconNote size={12} />}
                    aria-label={`${notes.length} note${notes.length !== 1 ? 's' : ''}`}
                  >
                    {notes.length}
                  </Badge>
                </Tooltip>
              )}

              {/* Delete button */}
              <Tooltip label="Delete result">
                <ActionIcon
                  variant="subtle"
                  color="red"
                  onClick={handleDeleteClick}
                  aria-label="Delete this lab result"
                >
                  <IconTrash size={18} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>

          {/* Expandable content */}
          <Collapse in={expanded}>
            <div id={`lab-result-${result.id}-content`}>
              <TestValuesList testValues={result.testValues} />

              {/* Notes section */}
              {notesEnabled && (
                <>
                  <Divider my="md" />
                  <NotesSection
                    notes={notes}
                    onCreateNote={handleCreateNote}
                    onUpdateNote={handleUpdateNote}
                    onDeleteNote={handleDeleteNote}
                    defaultCollapsed={notes.length === 0}
                    editorPlaceholder="Add a note about this lab result..."
                  />
                </>
              )}
            </div>
          </Collapse>
        </Stack>
      </Paper>

      {/* Delete confirmation modal */}
      <Modal
        opened={deleteModalOpened}
        onClose={closeDeleteModal}
        title="Delete Lab Result"
        centered
      >
        <Stack gap="md">
          <Text>
            Are you sure you want to delete this lab result from{' '}
            <strong>{formatDate(result.date)}</strong>?
          </Text>
          <Text c="dimmed" size="sm">
            This will permanently remove the lab result and all {result.totalCount}{' '}
            associated test value{result.totalCount !== 1 ? 's' : ''}. This action
            cannot be undone.
          </Text>

          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" onClick={closeDeleteModal}>
              Cancel
            </Button>
            <Button color="red" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
