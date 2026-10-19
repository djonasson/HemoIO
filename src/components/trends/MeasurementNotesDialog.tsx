/**
 * A measurement from the trend chart: its value and notes, and adding one
 */
import { useState } from 'react';
import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { NoteDisplay, NoteEditor } from '@components/notes';
import type { UserNote } from '@/types';

const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

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
  const [saving, setSaving] = useState(false);

  if (!measurement) return null;

  const what = `${measurement.value} ${measurement.unit} on ${DATE.format(measurement.date)}`;
  const close = () => {
    setAdding(false);
    onClose();
  };
  const save = async (content: string, tags: string[]) => {
    setSaving(true);
    try {
      await onCreateNote(content, tags);
      setAdding(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened onClose={close} title={adding ? `Note for ${what}` : what} centered>
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
          <NoteDisplay key={note.id} note={note} onUpdate={onUpdateNote} onDelete={onDeleteNote} />
        ))}
        {adding ? (
          <NoteEditor
            onSave={save}
            onCancel={() => setAdding(false)}
            isSaving={saving}
            placeholder="Add a note about this measurement..."
          />
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
    </Modal>
  );
}
