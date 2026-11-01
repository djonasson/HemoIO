/**
 * Timeline View Component
 *
 * Main container for displaying lab results in chronological order.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Anchor, Stack, Text, Loader, Alert, Center } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconCheck } from '@tabler/icons-react';
import { useLabResults } from '@hooks/useLabResults';
import { useNotes } from '@hooks/useNotes';
import { notifySaveFailed } from '@components/common/notifySaveFailed';
import { LabResultCard } from './LabResultCard';
import { TimelineFilters } from './TimelineFilters';
import { EmptyTimeline } from './EmptyTimeline';

export interface TimelineViewProps {
  /** Callback when user wants to navigate to import view */
  onNavigateToImport: () => void;
  /** Lab result to open and scroll to, e.g. when coming from a note */
  focusLabResultId?: number;
  /** Open a test's trend at a result's date */
  onOpenTrend?: (biomarkerKey: string, date: Date) => void;
}

/**
 * Timeline view displaying all lab results
 */
export function TimelineView({
  onNavigateToImport,
  focusLabResultId,
  onOpenTrend,
}: TimelineViewProps): React.ReactNode {
  const { results, isLoading, error, filters, setFilters, deleteResult, refresh } =
    useLabResults();
  const {
    createNote,
    updateNote,
    deleteNote,
    getNotesForLabResult,
  } = useNotes();

  // Handle note creation
  const handleCreateNote = useCallback(
    async (labResultId: number, content: string, tags: string[]) => {
      await createNote({ labResultId, content, tags });
    },
    [createNote]
  );

  // Handle note update
  const handleUpdateNote = useCallback(
    async (id: number, content: string, tags: string[]) => {
      await updateNote(id, { content, tags });
    },
    [updateNote]
  );

  // Handle note deletion
  const handleDeleteNote = useCallback(
    async (id: number) => {
      await deleteNote(id);
    },
    [deleteNote]
  );

  // Where keyboard focus goes once a deleted card is gone: the card after
  // it, or before it, or else the first control on the page. The delete
  // button that had focus goes with its card.
  const rootRef = useRef<HTMLDivElement>(null);
  const focusAfterDelete = useRef<{ nextId?: number } | null>(null);
  const [deletions, setDeletions] = useState(0);
  useEffect(() => {
    const pending = focusAfterDelete.current;
    const root = rootRef.current;
    if (!pending || !root) return;
    focusAfterDelete.current = null;
    const next =
      pending.nextId !== undefined
        ? root.querySelector<HTMLElement>(`[aria-controls="lab-result-${pending.nextId}-content"]`)
        : null;
    (next ?? root.querySelector<HTMLElement>('button, a[href], input, [tabindex="0"]'))?.focus();
  }, [deletions, results]);

  // Loading state
  if (isLoading) {
    return (
      <Center py="xl">
        <Stack align="center" gap="md">
          <Loader size="lg" />
          <Text c="dimmed">Loading lab results...</Text>
        </Stack>
      </Center>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert
        icon={<IconAlertCircle size={16} />}
        title="Error Loading Results"
        color="red"
        variant="light"
      >
        {error}
        <Anchor component="button" type="button" size="sm" underline="always" onClick={() => refresh()}>
          Try again
        </Anchor>
      </Alert>
    );
  }

  // Check if we have any results at all (before filtering)
  const hasAnyResults = results.length > 0 || filters.searchTerm || filters.startDate || filters.endDate;

  // Empty state (no results and no filters applied)
  if (!hasAnyResults) {
    return (
      <div ref={rootRef}>
        <EmptyTimeline onImportClick={onNavigateToImport} />
      </div>
    );
  }

  // Handle delete with error handling
  const handleDelete = async (id: number) => {
    const index = results.findIndex((result) => result.id === id);
    const neighbour = results[index + 1] ?? results[index - 1];
    try {
      await deleteResult(id);
      focusAfterDelete.current = { nextId: neighbour?.id };
      setDeletions((count) => count + 1);
      notifications.show({
        title: 'Lab result deleted',
        message: 'The lab result and its values were removed.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    } catch (err) {
      notifySaveFailed('Lab result not deleted', err);
    }
  };

  return (
    <Stack gap="md" ref={rootRef}>
      <TimelineFilters filters={filters} onFiltersChange={setFilters} />

      {results.length === 0 ? (
        // No results matching current filters
        <Center py="xl">
          <Stack align="center" gap="sm">
            <Text c="dimmed">No lab results match your filters.</Text>
            <Anchor component="button" type="button" size="sm" underline="always" onClick={() => setFilters({})}>
              Clear filters
            </Anchor>
          </Stack>
        </Center>
      ) : (
        // Results list
        <Stack gap="sm">
          {results.map((result) => (
            <LabResultCard
              key={result.id}
              result={result}
              defaultExpanded={result.id === focusLabResultId}
              scrollIntoViewOnMount={result.id === focusLabResultId}
              onDelete={handleDelete}
              notes={result.id !== undefined ? getNotesForLabResult(result.id) : []}
              onCreateNote={handleCreateNote}
              onUpdateNote={handleUpdateNote}
              onDeleteNote={handleDeleteNote}
              onOpenTrend={onOpenTrend}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
