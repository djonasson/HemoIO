/**
 * A range end as it reads: to four significant figures, without trailing
 * zeros, so one converted from another unit reads 8.417, not 8.416833667
 * (from 2.1 mmol/L). A printed end of four figures or fewer reads as
 * printed, and an integer part is never rounded (150000 stays 150000).
 */
function formatBound(bound: number): string {
  if (!Number.isFinite(bound)) return String(bound);
  const integerDigits = Math.abs(bound) >= 1 ? Math.floor(Math.log10(Math.abs(bound))) + 1 : 1;
  return String(Number(bound.toPrecision(Math.min(21, Math.max(4, integerDigits)))));
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
