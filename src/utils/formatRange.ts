/**
 * A range end as it reads: as printed, or, for one converted from another
 * unit and kept at full precision (8.416833667 mg/dL from 2.1 mmol/L), to
 * four significant figures. A printed number has no more than six, so
 * only a converted one is rounded.
 */
function formatBound(bound: number): string {
  const printed = Number(bound.toPrecision(6)) === bound;
  return String(printed ? bound : Number(bound.toPrecision(4)));
}

/**
 * A target or reference range for display: "70 - 90", "≤ 90", "≥ 70" or
 * "N/A". Range ends are inclusive, so one-sided ranges read ≤ and ≥.
 */
export function formatRange(low: number | undefined, high: number | undefined): string {
  if (low === undefined && high === undefined) return 'N/A';
  if (low === undefined) return `≤ ${formatBound(high!)}`;
  if (high === undefined) return `≥ ${formatBound(low)}`;
  return `${formatBound(low)} - ${formatBound(high)}`;
}
