/**
 * How a value reads wherever it is shown or exported: one core
 * (formatReading) for saved values, charted points and reviewed values
 */

import type { CensoredComparator, LabFlag, TestValue, ValueReading } from '@/types';

/** The fields of a saved value that say how it reads */
export type FormattableTestValue = Pick<
  TestValue,
  'value' | 'numericValueType' | 'intervalLow' | 'intervalHigh' | 'censored'
>;

/** How each comparator is written before a censored value's bound */
export const COMPARATOR_SIGNS: Record<CensoredComparator, string> = { '<': '<', '<=': '≤', '>': '>', '>=': '≥' };

/**
 * A number as it reads: an interval as its ends ("5-10"), not the midpoint
 * kept for charts and status; a censored value with its comparator
 * ("< 10"), never as a plain number; else the number. Every number is
 * written by `formatNumber`.
 */
export function formatReading(
  reading: ValueReading & { value: number },
  formatNumber: (value: number) => string = String
): string {
  const { value, interval, censored } = reading;
  if (interval) return `${formatNumber(interval.low)}-${formatNumber(interval.high)}`;
  const number = formatNumber(value);
  return censored ? `${COMPARATOR_SIGNS[censored]} ${number}` : number;
}

/** A saved interval value's ends; undefined for any other value, or an interval missing an end */
export function savedInterval(
  testValue: Pick<TestValue, 'numericValueType' | 'intervalLow' | 'intervalHigh'>
): ValueReading['interval'] {
  const { numericValueType, intervalLow: low, intervalHigh: high } = testValue;
  return numericValueType === 'interval' && low !== undefined && high !== undefined ? { low, high } : undefined;
}

/**
 * A saved value as it reads: as formatReading reads its number; a
 * qualitative result as printed ("Assenti"); a yes/no as Positive or Negative
 */
export function formatTestValue(
  testValue: FormattableTestValue,
  formatNumber: (value: number) => string = String
): string {
  const { value, censored } = testValue;
  if (typeof value === 'boolean') return value ? 'Positive' : 'Negative';
  if (typeof value === 'string') return value;
  return formatReading({ value, interval: savedInterval(testValue), censored }, formatNumber);
}

/**
 * A charted point's value as it reads (see formatReading), though the
 * chart plots an interval's midpoint and a censored value's bound
 */
export function formatPointValue(point: ValueReading & { value: number }): string {
  return formatReading(point);
}

/** The lab's mark as printed beside a value ("H"), and as said in full */
export const LAB_FLAG_TEXT: Record<LabFlag, { mark: string; label: string }> = {
  high: { mark: 'H', label: 'flagged high by the lab' },
  low: { mark: 'L', label: 'flagged low by the lab' },
  abnormal: { mark: '*', label: 'flagged abnormal by the lab' },
};
