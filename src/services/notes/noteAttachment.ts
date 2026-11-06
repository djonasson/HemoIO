/**
 * What a note is attached to, as a label and a place to navigate to
 */
import { formatShortDate } from '@/utils/formatShortDate';
import type { UserNote } from '@/types';

export type NoteAttachment =
  | { kind: 'measurement'; label: string; biomarkerKey: string; date: Date }
  | { kind: 'biomarker'; label: string; biomarkerKey: string }
  | { kind: 'lab-result'; label: string; labResultId: number }
  | { kind: 'none'; label: string };

export interface AttachmentLookup {
  labResults: ReadonlyMap<number, { labName: string; date: Date }>;
  testValues: ReadonlyMap<number, { value: number | string; unit: string; labResultId: number }>;
  biomarkerName: (biomarkerKey: string) => string;
}

/** Whether a result has a date: one that could not be read is listed under "No date" */
const isDated = (date: Date): boolean => !Number.isNaN(date.getTime());
const dateLabel = (date: Date): string => (isDated(date) ? formatShortDate(date) : 'No date');

export function describeNoteAttachment(note: UserNote, lookup: AttachmentLookup): NoteAttachment {
  if (note.biomarkerKey) {
    const name = lookup.biomarkerName(note.biomarkerKey);
    const testValue =
      note.testValueId !== undefined ? lookup.testValues.get(note.testValueId) : undefined;
    const result = testValue ? lookup.labResults.get(testValue.labResultId) : undefined;
    if (testValue && result) {
      const label = `${name} · ${testValue.value} ${testValue.unit} · ${dateLabel(result.date)}`;
      // An undated value is on no trend: the note leads to its test
      return isDated(result.date)
        ? { kind: 'measurement', label, biomarkerKey: note.biomarkerKey, date: result.date }
        : { kind: 'biomarker', label, biomarkerKey: note.biomarkerKey };
    }
    // The measurement is gone: the note still belongs to its biomarker
    return { kind: 'biomarker', label: name, biomarkerKey: note.biomarkerKey };
  }

  if (note.labResultId !== undefined) {
    const result = lookup.labResults.get(note.labResultId);
    return result
      ? {
          kind: 'lab-result',
          label: `${result.labName} · ${dateLabel(result.date)}`,
          labResultId: note.labResultId,
        }
      : { kind: 'none', label: 'Deleted lab result' };
  }

  return { kind: 'none', label: 'General note' };
}
