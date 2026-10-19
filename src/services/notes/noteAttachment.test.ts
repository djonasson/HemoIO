import { describe, it, expect } from 'vitest';
import { describeNoteAttachment, type AttachmentLookup } from './noteAttachment';
import type { UserNote } from '@/types';

const lookup: AttachmentLookup = {
  labResults: new Map([
    [1, { labName: 'Quest Diagnostics', date: new Date('2024-01-15T12:00:00Z') }],
  ]),
  testValues: new Map([[2, { value: 125, unit: 'mg/dL', labResultId: 1 }]]),
  biomarkerName: (key) => (key === 'glucose' ? 'Glucose' : key),
};

function note(extra: Partial<UserNote>): UserNote {
  return { id: 1, content: 'x', tags: [], createdAt: new Date(), updatedAt: new Date(), ...extra };
}

describe('describeNoteAttachment', () => {
  it('describes a measurement note', () => {
    expect(
      describeNoteAttachment(note({ biomarkerKey: 'glucose', testValueId: 2, labResultId: 1 }), lookup)
    ).toEqual({
      kind: 'measurement',
      label: 'Glucose · 125 mg/dL · Jan 15, 2024',
      biomarkerKey: 'glucose',
      date: new Date('2024-01-15T12:00:00Z'),
    });
  });

  it('describes a biomarker note', () => {
    expect(describeNoteAttachment(note({ biomarkerKey: 'glucose' }), lookup)).toEqual({
      kind: 'biomarker',
      label: 'Glucose',
      biomarkerKey: 'glucose',
    });
  });

  it('describes a lab result note', () => {
    expect(describeNoteAttachment(note({ labResultId: 1 }), lookup)).toEqual({
      kind: 'lab-result',
      label: 'Quest Diagnostics · Jan 15, 2024',
      labResultId: 1,
    });
  });

  it('falls back when what the note was attached to is gone', () => {
    expect(
      describeNoteAttachment(note({ biomarkerKey: 'glucose', testValueId: 99 }), lookup).kind
    ).toBe('biomarker');
    expect(describeNoteAttachment(note({ labResultId: 42 }), lookup)).toEqual({
      kind: 'none',
      label: 'Deleted lab result',
    });
    expect(describeNoteAttachment(note({}), lookup)).toEqual({ kind: 'none', label: 'General note' });
  });
});
