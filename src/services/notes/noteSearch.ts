/**
 * Client-side note filtering: notes are only searchable after decryption
 */
import type { UserNote } from '@/types';
import { toPlainText } from './noteMarkdown';

export interface NoteListFilters {
  searchTerm?: string;
  startDate?: Date | null;
  endDate?: Date | null;
  biomarkerKey?: string | null;
  tag?: string | null;
}

function endOfDay(date: Date): number {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

/** Notes matching every set filter, newest first */
export function filterNotes(notes: UserNote[], filters: NoteListFilters): UserNote[] {
  const term = filters.searchTerm?.trim().toLowerCase();
  return notes
    .filter((note) => {
      const created = note.createdAt.getTime();
      if (filters.startDate && created < filters.startDate.getTime()) return false;
      if (filters.endDate && created > endOfDay(filters.endDate)) return false;
      if (filters.biomarkerKey && note.biomarkerKey !== filters.biomarkerKey) return false;
      if (filters.tag && !note.tags.includes(filters.tag)) return false;
      if (term && !toPlainText(note.content).toLowerCase().includes(term)) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Split text around case-insensitive matches of a term. Uses plain string
 * search, so a term is never treated as a pattern.
 */
export function splitForHighlight(
  text: string,
  term: string | undefined
): Array<{ text: string; match: boolean }> {
  const needle = term?.trim().toLowerCase();
  if (!needle) return [{ text, match: false }];

  const parts: Array<{ text: string; match: boolean }> = [];
  const haystack = text.toLowerCase();
  let from = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), match: false });
    parts.push({ text: text.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts;
}
