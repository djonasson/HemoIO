/**
 * Lab dates are calendar days, written YYYY-MM-DD. The AI usually returns
 * that form, but may copy the report's own: "15.01.2024" or "15/01/2024".
 * Those are read when their order is certain; anything else (including
 * "03/04/2024", which could be either day first or month first) is treated
 * as "no date", so the user is asked for it instead of a wrong day being saved.
 */
function isoDay(year: number, month: number, day: number): string | null {
  const date = new Date(year, month - 1, day);
  const real = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  if (!real) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function normalizeLabDate(value: string | null | undefined): string | null {
  const text = value?.trim() ?? '';

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return isoDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // Year first is unambiguous with slashes too
  const yearFirst = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(text);
  if (yearFirst) return isoDay(Number(yearFirst[1]), Number(yearFirst[2]), Number(yearFirst[3]));

  // Dots are written day first (European)
  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  if (dotted) return isoDay(Number(dotted[3]), Number(dotted[2]), Number(dotted[1]));

  // Slashes are written either way: only a part above 12 settles the order
  const slashed = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (slashed) {
    const [first, second, year] = [Number(slashed[1]), Number(slashed[2]), Number(slashed[3])];
    if (first > 12) return isoDay(year, second, first);
    if (second > 12) return isoDay(year, first, second);
  }

  return null;
}
