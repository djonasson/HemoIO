/**
 * Lab dates are calendar days, written YYYY-MM-DD. The AI returns that form
 * when the report's order is certain, else copies the report's own:
 * "15.01.2024", "03/04/2024" or "03-04-2024". Those are read when their order
 * is certain, or by the order the user writes dates in (their date format
 * setting); anything else is treated as "no date", so the user is asked for
 * it instead of a wrong day being saved.
 */

import { toLocalDayString } from './localDate';
import type { UserPreferences } from '@/types';

/** The order of day and month in a date written with numbers only */
export type DayOrder = 'day-first' | 'month-first';

/** The order a date format setting writes day and month in; none for a year-first one */
export function dayOrderOf(dateFormat: UserPreferences['dateFormat'] | undefined): DayOrder | undefined {
  if (dateFormat === 'DD/MM/YYYY') return 'day-first';
  if (dateFormat === 'MM/DD/YYYY') return 'month-first';
  return undefined;
}

function isoDay(year: number, month: number, day: number): string | null {
  const date = new Date(year, month - 1, day);
  const real = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return real ? toLocalDayString(date) : null;
}

export function normalizeLabDate(value: string | null | undefined, order?: DayOrder): string | null {
  const text = value?.trim() ?? '';

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return isoDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // Year first is unambiguous with slashes too
  const yearFirst = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(text);
  if (yearFirst) return isoDay(Number(yearFirst[1]), Number(yearFirst[2]), Number(yearFirst[3]));

  // Dots are written day first (European)
  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  if (dotted) return isoDay(Number(dotted[3]), Number(dotted[2]), Number(dotted[1]));

  // Slashes and dashes are written either way: a part above 12 settles the order, else the user's own order
  const slashed = /^(\d{1,2})([/-])(\d{1,2})\2(\d{4})$/.exec(text);
  if (slashed) {
    const [first, second, year] = [Number(slashed[1]), Number(slashed[3]), Number(slashed[4])];
    if (first > 12) return isoDay(year, second, first);
    if (second > 12) return isoDay(year, first, second);
    if (order === 'day-first') return isoDay(year, second, first);
    if (order === 'month-first') return isoDay(year, first, second);
  }

  return null;
}

/**
 * The date a reviewed result is saved under: the date set in review, else
 * the detected one. A date cleared in review ('') is no date, not a cue to
 * fall back to the detected date.
 */
export function reviewedLabDate(result: {
  labDate?: string | null;
  editedLabDate?: string;
}): string | null {
  return normalizeLabDate(result.editedLabDate ?? result.labDate);
}
