/**
 * Calendar days in the user's timezone, for date pickers and date filters.
 *
 * Mantine's pickers give "YYYY-MM-DD" strings. new Date() parses those as
 * UTC midnight, which is the previous evening west of UTC, so they are read
 * as local days here. Lab results are stored at noon, so a range must
 * include the whole of its end day.
 */

export function toLocalDay(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

/** The day `date` falls on where the user is, as "YYYY-MM-DD" */
export function toLocalDayString(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function endOfDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Whether a moment falls on or between two days; a missing bound is open.
 * A missing date (an invalid Date) falls within no range, only within no bounds.
 */
export function isWithinDays(date: Date, startDay: Date | null, endDay: Date | null): boolean {
  if ((startDay || endDay) && Number.isNaN(date.getTime())) return false;
  if (startDay && date.getTime() < startDay.getTime()) return false;
  if (endDay && date.getTime() > endOfDay(endDay).getTime()) return false;
  return true;
}
