import { describe, it, expect } from 'vitest';
import { filterNotes, splitForHighlight } from './noteSearch';
import type { UserNote } from '@/types';

function note(id: number, content: string, created: string, extra: Partial<UserNote> = {}): UserNote {
  return {
    id,
    content,
    tags: [],
    createdAt: new Date(created),
    updatedAt: new Date(created),
    ...extra,
  };
}

const NOTES = [
  note(1, 'Felt a **headache**', '2024-01-16T12:00:00', { tags: ['symptoms'], labResultId: 1 }),
  note(2, 'Cutting back on sugar', '2024-03-01T12:00:00', {
    tags: ['diet'],
    biomarkerKey: 'glucose',
  }),
  note(3, 'Retest planned (50%)', '2024-06-30T18:00:00', {
    biomarkerKey: 'glucose',
    testValueId: 2,
  }),
  note(4, 'c++ is not a vitamin', '2024-08-10T12:00:00'),
];

describe('filterNotes', () => {
  it('returns all notes newest first', () => {
    expect(filterNotes(NOTES, {}).map((n) => n.id)).toEqual([4, 3, 2, 1]);
  });

  it('searches the visible text, ignoring case and formatting markers', () => {
    expect(filterNotes(NOTES, { searchTerm: 'HEADACHE' }).map((n) => n.id)).toEqual([1]);
  });

  it('treats regex characters literally', () => {
    expect(filterNotes(NOTES, { searchTerm: '(50%)' }).map((n) => n.id)).toEqual([3]);
    expect(filterNotes(NOTES, { searchTerm: 'c++' }).map((n) => n.id)).toEqual([4]);
  });

  it('includes the whole end day of a date range', () => {
    const ids = filterNotes(NOTES, {
      startDate: new Date('2024-01-01T00:00:00'),
      endDate: new Date('2024-06-30T00:00:00'),
    }).map((n) => n.id);
    expect(ids).toEqual([3, 2, 1]);
  });

  it('filters by biomarker and by tag', () => {
    expect(filterNotes(NOTES, { biomarkerKey: 'glucose' }).map((n) => n.id)).toEqual([3, 2]);
    expect(filterNotes(NOTES, { tag: 'symptoms' }).map((n) => n.id)).toEqual([1]);
  });
});

describe('splitForHighlight', () => {
  it('splits out every case-insensitive match', () => {
    expect(splitForHighlight('Iron, then iron', 'IRON')).toEqual([
      { text: 'Iron', match: true },
      { text: ', then ', match: false },
      { text: 'iron', match: true },
    ]);
  });

  it('handles regex characters and empty terms', () => {
    expect(splitForHighlight('a (50%) b', '(50%)')).toEqual([
      { text: 'a ', match: false },
      { text: '(50%)', match: true },
      { text: ' b', match: false },
    ]);
    expect(splitForHighlight('text', '  ')).toEqual([{ text: 'text', match: false }]);
  });
});
