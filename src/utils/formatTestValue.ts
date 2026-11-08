/**
 * How a saved test value reads wherever it is shown or exported
 */

import type { TestValue } from '@/types';

/** The fields of a saved value that say how it reads */
export type FormattableTestValue = Pick<TestValue, 'value' | 'numericValueType' | 'intervalLow' | 'intervalHigh'>;

/**
 * A saved value as it reads: an interval as its ends ("5-10"), not the
 * midpoint kept for charts and status; a qualitative result as printed
 * ("Assenti"); a yes/no as Positive or Negative; else the number, written
 * by `formatNumber`
 */
export function formatTestValue(
  testValue: FormattableTestValue,
  formatNumber: (value: number) => string = String
): string {
  const { value, numericValueType, intervalLow, intervalHigh } = testValue;
  if (numericValueType === 'interval' && intervalLow !== undefined && intervalHigh !== undefined) {
    // Written as formatIntervalValue writes the interval on review
    return `${formatNumber(intervalLow)}-${formatNumber(intervalHigh)}`;
  }
  if (typeof value === 'boolean') return value ? 'Positive' : 'Negative';
  if (typeof value === 'number') return formatNumber(value);
  return value;
}

/**
 * A charted point's value as it reads: an interval as its ends ("5-10"),
 * though the chart plots its midpoint
 */
export function formatPointValue(point: { value: number; interval?: { low: number; high: number } }): string {
  return point.interval ? `${point.interval.low}-${point.interval.high}` : String(point.value);
}
