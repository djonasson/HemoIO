/**
 * How a saved test value reads wherever it is shown or exported
 */

import type { CensoredComparator, LabFlag, TestValue } from '@/types';

/** The fields of a saved value that say how it reads */
export type FormattableTestValue = Pick<
  TestValue,
  'value' | 'numericValueType' | 'intervalLow' | 'intervalHigh' | 'censored'
>;

const COMPARATOR_SIGNS: Record<CensoredComparator, string> = { '<': '<', '<=': '≤', '>': '>', '>=': '≥' };

/** A censored value's bound with its comparator ("< 10"); a plain number as it is */
export function withComparator(number: string, censored: CensoredComparator | undefined): string {
  return censored ? `${COMPARATOR_SIGNS[censored]} ${number}` : number;
}

/**
 * A saved value as it reads: an interval as its ends ("5-10"), not the
 * midpoint kept for charts and status; a censored value with its
 * comparator ("< 10"), never as a plain number; a qualitative result as
 * printed ("Assenti"); a yes/no as Positive or Negative; else the number,
 * written by `formatNumber`
 */
export function formatTestValue(
  testValue: FormattableTestValue,
  formatNumber: (value: number) => string = String
): string {
  const { value, numericValueType, intervalLow, intervalHigh, censored } = testValue;
  if (numericValueType === 'interval' && intervalLow !== undefined && intervalHigh !== undefined) {
    // Written as formatIntervalValue writes the interval on review
    return `${formatNumber(intervalLow)}-${formatNumber(intervalHigh)}`;
  }
  if (typeof value === 'boolean') return value ? 'Positive' : 'Negative';
  if (typeof value === 'number') return withComparator(formatNumber(value), censored);
  return value;
}

/**
 * A charted point's value as it reads: an interval as its ends ("5-10"),
 * though the chart plots its midpoint; a censored value with its
 * comparator ("< 10"), though the chart plots its bound
 */
export function formatPointValue(point: {
  value: number;
  interval?: { low: number; high: number };
  censored?: CensoredComparator;
}): string {
  return point.interval
    ? `${point.interval.low}-${point.interval.high}`
    : withComparator(String(point.value), point.censored);
}

/** The lab's mark as printed beside a value ("H"), and as said in full */
export const LAB_FLAG_TEXT: Record<LabFlag, { mark: string; label: string }> = {
  high: { mark: 'H', label: 'flagged high by the lab' },
  low: { mark: 'L', label: 'flagged low by the lab' },
  abnormal: { mark: '*', label: 'flagged abnormal by the lab' },
};
