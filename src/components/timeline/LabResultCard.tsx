/**
 * Lab Result Card Component
 *
 * Expandable card displaying a lab result summary with test values.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Paper,
  Group,
  Stack,
  Text,
  Badge,
  ActionIcon,
  ThemeIcon,
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
  /** Scroll the card into view when it mounts (opened from elsewhere) */
  scrollIntoViewOnMount?: boolean;
  /** Notes attached to this lab result */
  notes?: UserNote[];
  /** Callback when creating a note */
  onCreateNote?: (labResultId: number, content: string, tags: string[]) => Promise<void>;
  /** Callback when updating a note */
  onUpdateNote?: (id: number, content: string, tags: string[]) => Promise<void>;
  /** Callback when deleting a note */
  onDeleteNote?: (id: number) => Promise<void>;
  /** Open a test's trend at this result's date */
  onOpenTrend?: (biomarkerKey: string, date: Date) => void;
  /** Receives the card's expand button, for the list to move focus to it */
  toggleRef?: React.Ref<HTMLDivElement>;
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
  scrollIntoViewOnMount = false,
  notes = [],
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  onOpenTrend,
  toggleRef,
}: LabResultCardProps): React.ReactNode {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Opened from elsewhere (e.g. a note): bring the card into view and move
    // keyboard focus to it, so keyboard and screen-reader users land there too
    if (scrollIntoViewOnMount) {
      cardRef.current?.scrollIntoView?.({ block: 'center' });
      cardRef.current?.focus({ preventScroll: true });
    }
  }, [scrollIntoViewOnMount]);
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
        ref={cardRef}
        tabIndex={scrollIntoViewOnMount ? -1 : undefined}
        p="md"
        withBorder
        radius="md"
        shadow={expanded ? 'sm' : undefined}
        role="region"
        aria-label={`Lab result from ${formatDate(result.date)}`}
      >
        <Stack gap="sm">
          {/* Header: a click anywhere on it expands. Wraps on a narrow screen
              so the badges keep their full width. The keyboard's expand button
              is the date part alone, so the delete button is not inside it. */}
          <Group justify="space-between" style={{ cursor: 'pointer' }} onClick={handleToggle}>
            <Group
              ref={toggleRef}
              gap="md"
              wrap="nowrap"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleToggle();
                }
              }}
              tabIndex={0}
              role="button"
              aria-expanded={expanded}
              aria-controls={`lab-result-${result.id}-content`}
              aria-label={`${expanded ? 'Collapse' : 'Expand'} lab result from ${formatDate(result.date)}`}
            >
              {/* Expand/collapse icon: the header is the button */}
              <ThemeIcon variant="transparent" color="gray" aria-hidden="true">
                {expanded ? <IconChevronUp size={20} /> : <IconChevronDown size={20} />}
              </ThemeIcon>

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

            {/* Badges and actions; on a very narrow screen they wrap rather than shrink */}
            <Group gap="sm">
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
              <TestValuesList
                testValues={result.testValues}
                onOpenTrend={
                  onOpenTrend ? (biomarkerKey) => onOpenTrend(biomarkerKey, result.date) : undefined
                }
              />

              {/* Notes section: mounted with the open card, as a collapse that
                  opens inside a closed one measures no height and stays shut */}
              {notesEnabled && expanded && (
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
