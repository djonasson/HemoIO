/**
 * A measurement from the trend chart: its value and notes, and adding one
 */
import { useRef, useState } from 'react';
import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { SaveFailedAlert } from '@components/common/SaveFailedAlert';
import { useSaveState } from '@hooks/useSaveState';
import { NoteDisplay, NoteEditor } from '@components/notes';
import { formatShortDate } from '@/utils/formatShortDate';
import type { UserNote } from '@/types';

export interface Measurement {
  testValueId: number;
  labResultId?: number;
  value: number;
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
    ? `${measurement.value} ${measurement.unit} on ${formatShortDate(measurement.date)}`
    : '';
  const stopAdding = () => {
    setAdding(false);
    clear();
  };
  // Each opening of the editor, so a save from an earlier one does not close a new one
  const opening = useRef(0);
  const startAdding = () => {
    opening.current += 1;
    setAdding(true);
  };
  const close = () => {
    // A save still under way reports a failure as a notification
    stopAdding();
    onClose();
  };
  const save = async (content: string, tags: string[]) => {
    const current = opening.current;
    if ((await run(() => onCreateNote(content, tags))) && opening.current === current) {
      setAdding(false);
    }
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
              onClick={startAdding}
            >
              Add Note
            </Button>
          )}
        </Stack>
      )}
    </Modal>
  );
}
