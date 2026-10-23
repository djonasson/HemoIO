/**
 * Lab dates are calendar days, written YYYY-MM-DD. The AI usually returns
 * that form, but not always; anything else is treated as "no date" so the
 * user is asked for it instead of a wrong day being saved.
 */
export function normalizeLabDate(value: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value?.trim() ?? '');
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  const real =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return real ? `${match[1]}-${match[2]}-${match[3]}` : null;
}
