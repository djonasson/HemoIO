/**
 * Alert rules: pure functions deciding severity, trends, wording and colour.
 */

import { formatRange } from '@/utils/formatRange';
import { directionPoints } from '@services/statistics/trendAnalysis';
import type { ValueReading } from '@/types';

export type AlertSeverity = 'critical' | 'warning' | 'positive';
export type AlertType = 'out_of_range' | 'trend' | 'improvement';
export type TrendDirection = 'increasing' | 'decreasing';

export interface ReferenceRange {
  low?: number;
  high?: number;
}

export const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, positive: 2 };

/** Fraction beyond the nearest bound at which a value becomes critical */
const CRITICAL_DEVIATION = 0.5;
/** Consecutive same-direction values needed for a trend alert */
const MIN_TREND_VALUES = 4;

/**
 * How far out of range a value is. A censored value ("< 30") is only
 * known on one side of its bound, so it is critical only when that side
 * is surely far enough out: "< 5" below a low of 20, not "< 30" the lab
 * marked low, which may be 25.
 */
export function outOfRangeSeverity(
  value: number,
  status: 'high' | 'low',
  range?: ReferenceRange,
  censored?: ValueReading['censored']
): 'critical' | 'warning' {
  const bound = status === 'high' ? range?.high : range?.low;
  if (bound === undefined || bound === 0) return 'warning';
  if (censored) {
    const beyond = status === 'low' ? censored.startsWith('<') && value <= bound : censored.startsWith('>') && value >= bound;
    if (!beyond) return 'warning';
  }
  const deviation = Math.abs(value - bound) / Math.abs(bound);
  return deviation >= CRITICAL_DEVIATION ? 'critical' : 'warning';
}

export function detectConsistentDirection(
  points: ReadonlyArray<{ date: Date; value: number } & Pick<ValueReading, 'censored'>>
): { direction: TrendDirection; count: number; start: Date; end: Date } | null {
  // One point per day (their mean): two labs on one day are not two steps.
  // A censored value is a bound, not a step, and one proving a turn leaves no direction (see directionPoints).
  const { points: measured, consistent } = directionPoints(points);
  if (!consistent) return null;
  const byDay = new Map<string, { date: Date; total: number; count: number }>();
  for (const point of measured) {
    const day = `${point.date.getFullYear()}-${point.date.getMonth()}-${point.date.getDate()}`;
    const entry = byDay.get(day);
    if (entry) {
      entry.total += point.value;
      entry.count += 1;
    } else {
      byDay.set(day, { date: point.date, total: point.value, count: 1 });
    }
  }
  const sorted = [...byDay.values()]
    .map(({ date, total, count }) => ({ date, value: total / count }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  if (sorted.length < MIN_TREND_VALUES) return null;

  const last = sorted.length - 1;
  const step = Math.sign(sorted[last].value - sorted[last - 1].value);
  if (step === 0) return null;

  let first = last - 1;
  while (first > 0 && Math.sign(sorted[first].value - sorted[first - 1].value) === step) {
    first--;
  }
  const count = last - first + 1;
  if (count < MIN_TREND_VALUES) return null;

  return {
    direction: step > 0 ? 'increasing' : 'decreasing',
    count,
    start: sorted[first].date,
    end: sorted[last].date,
  };
}

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'short' });

export function formatTimeframe(start: Date, end: Date): string {
  // Whole months only: Jan 30 to Feb 2 is 3 days, not a month
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth()) -
    (end.getDate() < start.getDate() ? 1 : 0);
  const span =
    months >= 1
      ? `${months} ${months === 1 ? 'month' : 'months'}`
      : `${Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000))} days`;

  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  const label = sameMonth
    ? `${MONTH.format(start)} ${start.getFullYear()}`
    : sameYear
      ? `${MONTH.format(start)}–${MONTH.format(end)} ${end.getFullYear()}`
      : `${MONTH.format(start)} ${start.getFullYear()}–${MONTH.format(end)} ${end.getFullYear()}`;

  return `over ${span} (${label})`;
}

export function formatReferenceRange(range: ReferenceRange | undefined, unit: string): string | null {
  if (!range || (range.low === undefined && range.high === undefined)) return null;
  return `${formatRange(range.low, range.high)} ${unit}`.trimEnd();
}

export function outOfRangeMessage(
  name: string,
  status: 'high' | 'low',
  /** The value as it reads: a number, or an interval's ends */
  value: number | string,
  unit: string,
  range?: ReferenceRange
): string {
  const reference = formatReferenceRange(range, unit);
  const base = `${name} is ${status} at ${value} ${unit}`;
  return reference ? `${base} (reference ${reference})` : base;
}

export function trendMessage(direction: TrendDirection, start: Date, end: Date): string {
  return `Consistently ${direction} ${formatTimeframe(start, end)}`;
}

export function improvementMessage(name: string): string {
  return `Improved: ${name} now within range`;
}

export function indicatorColor(alert: {
  type: AlertType;
  status: string;
  direction?: TrendDirection;
}): 'red' | 'orange' | 'green' {
  if (alert.type === 'improvement') return 'green';
  if (alert.type === 'trend') return alert.direction === 'increasing' ? 'red' : 'orange';
  return alert.status === 'high' ? 'red' : 'orange';
}
