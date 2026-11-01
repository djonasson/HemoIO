/**
 * A target or reference range for display: "70 - 90", "≤ 90", "≥ 70" or
 * "N/A". Range ends are inclusive, so one-sided ranges read ≤ and ≥.
 */
export function formatRange(low: number | undefined, high: number | undefined): string {
  if (low === undefined && high === undefined) return 'N/A';
  if (low === undefined) return `≤ ${high}`;
  if (high === undefined) return `≥ ${low}`;
  return `${low} - ${high}`;
}
