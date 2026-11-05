/**
 * The Notes view: every note, newest first, with search and filters.
 * Notes are decrypted when loaded, so all filtering happens here.
 */
import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { toLocalDay } from '@/utils/localDate';
import { IconNotes, IconSearch } from '@tabler/icons-react';
import { useNotes } from '@hooks/useNotes';
import { useLabResults } from '@hooks/useLabResults';
import { RelativeTime } from '@components/common/RelativeTime';
import { testDisplayName, trendCode } from '@data/loinc/display';
import { useCatalog } from '@contexts/useCatalog';
import {
  describeNoteAttachment,
  filterNotes,
  type AttachmentLookup,
  type NoteAttachment,
} from '@services/notes';
import { NoteContent } from './NoteContent';

export interface NotesViewProps {
  onOpenLabResult: (labResultId: number) => void;
  onOpenTrend: (biomarkerKey: string, date?: Date) => void;
}

export function NotesView({ onOpenLabResult, onOpenTrend }: NotesViewProps): React.ReactNode {
  const catalog = useCatalog();
  const { notes: stored, isLoading, allTags } = useNotes();
  // Notes are the test's whatever code of its trend group they were kept under
  const notes = useMemo(
    () =>
      stored.map((note) =>
        note.biomarkerKey ? { ...note, biomarkerKey: trendCode(catalog, note.biomarkerKey) } : note
      ),
    [catalog, stored]
  );
  const { results, isLoading: isLoadingResults } = useLabResults();
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [biomarkerKey, setBiomarkerKey] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);

  const lookup = useMemo<AttachmentLookup>(() => {
    const labResults = new Map<number, { labName: string; date: Date }>();
    const testValues = new Map<
      number,
      { value: number | string; unit: string; labResultId: number }
    >();
    // The printed names of values that are not a LOINC test
    const printed = new Map<string, string | undefined>();
    for (const result of results) {
      if (result.id !== undefined) {
        labResults.set(result.id, { labName: result.labName, date: result.date });
      }
      for (const tv of result.testValues) {
        if (tv.id !== undefined) {
          testValues.set(tv.id, {
            value: String(tv.value),
            unit: tv.unit,
            labResultId: tv.labResultId,
          });
        }
        printed.set(tv.biomarkerKey, tv.rawText);
      }
    }
    return {
      labResults,
      testValues,
      // A note can name a test no result has a value for
      biomarkerName: (key) => testDisplayName(catalog, { biomarkerKey: key, rawText: printed.get(key) }),
    };
  }, [catalog, results]);

  const biomarkerOptions = useMemo(() => {
    const keys = [...new Set(notes.flatMap((n) => (n.biomarkerKey ? [n.biomarkerKey] : [])))];
    return keys
      .map((key) => ({ value: key, label: lookup.biomarkerName(key) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [notes, lookup]);

  const visible = useMemo(
    () => filterNotes(notes, { searchTerm, startDate, endDate, biomarkerKey, tag }),
    [notes, searchTerm, startDate, endDate, biomarkerKey, tag]
  );

  const open = (attachment: NoteAttachment) => {
    if (attachment.kind === 'lab-result') onOpenLabResult(attachment.labResultId);
    else if (attachment.kind === 'measurement')
      onOpenTrend(attachment.biomarkerKey, attachment.date);
    else if (attachment.kind === 'biomarker') onOpenTrend(attachment.biomarkerKey);
  };

  // Labels need the lab results: without them every note would look detached
  if (isLoading || isLoadingResults) {
    return (
      <Center h="50vh">
        <Loader aria-label="Loading notes" />
      </Center>
    );
  }

  return (
    <Stack gap="md">
      <Group gap="xs">
        <IconNotes size={24} />
        <Title order={2}>Notes</Title>
      </Group>

      {notes.length === 0 ? (
        <Text c="dimmed">
          No notes yet. Add notes to a lab result in the Timeline or to a biomarker in Trends.
        </Text>
      ) : (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 5 }}>
            <TextInput
              aria-label="Search notes"
              placeholder="Search notes"
              leftSection={<IconSearch size={14} />}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.currentTarget.value)}
            />
            <DatePickerInput
              aria-label="Notes from date"
              placeholder="From"
              value={startDate}
              onChange={(value) => setStartDate(toLocalDay(value))}
              clearable
            />
            <DatePickerInput
              aria-label="Notes to date"
              placeholder="To"
              value={endDate}
              onChange={(value) => setEndDate(toLocalDay(value))}
              clearable
            />
            <Select
              aria-label="Filter notes by biomarker"
              placeholder="All biomarkers"
              data={biomarkerOptions}
              value={biomarkerKey}
              onChange={setBiomarkerKey}
              clearable
              searchable
            />
            <Select
              aria-label="Filter notes by tag"
              placeholder="All tags"
              data={allTags}
              value={tag}
              onChange={setTag}
              clearable
              searchable
            />
          </SimpleGrid>

          <Text size="sm" c="dimmed" aria-live="polite">
            {visible.length} {visible.length === 1 ? 'note' : 'notes'}
          </Text>

          {visible.length === 0 ? (
            <Text c="dimmed">No notes match these filters</Text>
          ) : (
            visible.map((note) => {
              const attachment = describeNoteAttachment(note, lookup);
              return (
                <Paper
                  key={note.id}
                  component="article"
                  p="sm"
                  withBorder
                  aria-label={`Note attached to ${attachment.label}`}
                >
                  <Stack gap="xs">
                    <Group justify="space-between" wrap="nowrap">
                      {attachment.kind === 'none' ? (
                        <Text size="sm" fw={500}>
                          {attachment.label}
                        </Text>
                      ) : (
                        <Button
                          variant="subtle"
                          size="compact-sm"
                          px={0}
                          onClick={() => open(attachment)}
                        >
                          {attachment.label}
                        </Button>
                      )}
                      <RelativeTime date={note.createdAt} />
                    </Group>
                    <NoteContent content={note.content} highlight={searchTerm} />
                    {note.tags.length > 0 && (
                      <Group gap="xs">
                        {note.tags.map((t) => (
                          <Badge key={t} size="xs" variant="light">
                            {t}
                          </Badge>
                        ))}
                      </Group>
                    )}
                  </Stack>
                </Paper>
              );
            })
          )}
        </>
      )}
    </Stack>
  );
}
