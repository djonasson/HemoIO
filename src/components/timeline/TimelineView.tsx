/**
 * Timeline View Component
 *
 * Main container for displaying lab results in chronological order.
 */

import { useCallback } from 'react';
import { Stack, Text, Loader, Alert, Center } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useLabResults } from '@hooks/useLabResults';
import { useNotes } from '@hooks/useNotes';
import { LabResultCard } from './LabResultCard';
import { TimelineFilters } from './TimelineFilters';
import { EmptyTimeline } from './EmptyTimeline';

export interface TimelineViewProps {
  /** Callback when user wants to navigate to import view */
  onNavigateToImport: () => void;
}

/**
 * Timeline view displaying all lab results
 */
export function TimelineView({
  onNavigateToImport,
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
        <Text
          size="sm"
          c="blue"
          style={{ cursor: 'pointer', textDecoration: 'underline' }}
          onClick={() => refresh()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              refresh();
            }
          }}
        >
          Try again
        </Text>
      </Alert>
    );
  }

  // Check if we have any results at all (before filtering)
  const hasAnyResults = results.length > 0 || filters.searchTerm || filters.startDate || filters.endDate;

  // Empty state (no results and no filters applied)
  if (!hasAnyResults) {
    return <EmptyTimeline onImportClick={onNavigateToImport} />;
  }

  // Handle delete with error handling
  const handleDelete = async (id: number) => {
    try {
      await deleteResult(id);
    } catch (err) {
      console.error('Failed to delete result:', err);
    }
  };

  return (
    <Stack gap="md">
      <TimelineFilters filters={filters} onFiltersChange={setFilters} />

      {results.length === 0 ? (
        // No results matching current filters
        <Center py="xl">
          <Stack align="center" gap="sm">
            <Text c="dimmed">No lab results match your filters.</Text>
            <Text
              size="sm"
              c="blue"
              style={{ cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => setFilters({})}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setFilters({});
                }
              }}
            >
              Clear filters
            </Text>
          </Stack>
        </Center>
      ) : (
        // Results list
        <Stack gap="sm">
          {results.map((result) => (
            <LabResultCard
              key={result.id}
              result={result}
              onDelete={handleDelete}
              notes={result.id !== undefined ? getNotesForLabResult(result.id) : []}
              onCreateNote={handleCreateNote}
              onUpdateNote={handleUpdateNote}
              onDeleteNote={handleDeleteNote}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
