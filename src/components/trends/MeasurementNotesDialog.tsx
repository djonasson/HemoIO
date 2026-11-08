/**
 * A measurement from the trend chart: its value and notes, and adding one
 */
import { useState } from 'react';
import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { SaveFailedAlert } from '@components/common/SaveFailedAlert';
import { useSaveState } from '@hooks/useSaveState';
import { NoteDisplay, NoteEditor } from '@components/notes';
import { formatShortDate } from '@/utils/formatShortDate';
import { formatPointValue } from '@/utils/formatTestValue';
import type { CensoredComparator, UserNote } from '@/types';

export interface Measurement {
  testValueId: number;
  labResultId?: number;
  value: number;
  /** The ends of an interval, which reads as them rather than as its midpoint */
  interval?: { low: number; high: number };
  /** A censored value's comparator, which reads before its bound */
  censored?: CensoredComparator;
  unit: string;
  date: Date;
  status?: string;
  labName?: string;
}

export interface MeasurementNotesDialogProps {
  measurement: Measurement | null;
  notes: UserNote[];
  onClose: () => void;
  onCreateNote: (content: string, tags: string[]) => Promise<void>;
  onUpdateNote: (id: number, content: string, tags: string[]) => Promise<void>;
  onDeleteNote: (id: number) => Promise<void>;
}

export function MeasurementNotesDialog({
  measurement,
  notes,
  onClose,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
}: MeasurementNotesDialogProps): React.ReactNode {
  const [adding, setAdding] = useState(false);
  // Shown in the editor, which keeps the note to save again; notified once
  // the editor is gone
  const { isSaving: saving, error: saveError, run, clear } = useSaveState('Note not saved');

  // The modal stays mounted and opens and closes through `opened`, so it can
  // return focus to the point that opened it
  const what = measurement
    ? `${formatPointValue(measurement)} ${measurement.unit} on ${formatShortDate(measurement.date)}`
    : '';
  const stopAdding = () => {
    setAdding(false);
    clear();
  };
  const close = () => {
    // A save still under way reports a failure as a notification
    stopAdding();
    onClose();
  };
  const save = async (content: string, tags: string[]) => {
    if (await run(() => onCreateNote(content, tags))) setAdding(false);
  };

  return (
    <Modal
      opened={measurement !== null}
      onClose={close}
      title={adding ? `Note for ${what}` : what}
      centered
    >
      {measurement && (
        <Stack gap="sm">
          <Group gap="xs">
            {measurement.status && <Text size="sm">Status: {measurement.status}</Text>}
            {measurement.labName && (
              <Text size="sm" c="dimmed">
                {measurement.labName}
              </Text>
            )}
          </Group>
          {notes.map((note) => (
            <NoteDisplay
              key={note.id}
              note={note}
              onUpdate={onUpdateNote}
              onDelete={onDeleteNote}
            />
          ))}
          {adding ? (
            <>
              {saveError !== null && <SaveFailedAlert title="Note not saved" error={saveError} />}
              <NoteEditor
                onSave={save}
                onCancel={stopAdding}
                isSaving={saving}
                placeholder="Add a note about this measurement..."
              />
            </>
          ) : (
            <Button
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={() => setAdding(true)}
            >
              Add Note
            </Button>
          )}
        </Stack>
      )}
    </Modal>
  );
}
