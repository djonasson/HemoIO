/**
 * A saved value's status against its reference range: what the timeline,
 * the trends and the alerts call high, low or normal.
 *
 * A censored value ("< 10") is some value beyond its bound, so it is high,
 * low or normal only when every value it may be is: "< 10" with a range of
 * 0-50 is normal, "> 200" above a high of 150 is high, "< 10" below a low
 * of 20 is low, and "< 30" with a low of 20 cannot be told. Lab values are
 * taken to be zero or more, so "< 10" lies between 0 and 10.
 *
 * The range decides. When it cannot (none, or a censored value it cannot
 * place), the lab's own high or low mark does; the mark is shown beside
 * the value either way, so a range and a mark that disagree both show.
 */

import { canConvert, convertMeasurement, unitsMatch } from '@services/units';
import type { Catalog } from '@data/loinc/catalog';
import type { CensoredComparator, LabFlag, TestValue } from '@/types';

export type ValueStatus = 'normal' | 'low' | 'high' | 'unknown';

/** What a value's status is read from */
export interface StatusInput {
  value: unknown;
  censored?: CensoredComparator;
  labFlag?: LabFlag;
  referenceRangeLow?: number;
  referenceRangeHigh?: number;
  /** A range in a unit the value's does not convert to: shown, never compared */
  unconvertedRange?: UnconvertedRange;
}

/**
 * What gave a value its status: its range; the lab's mark, when the range
 * could not tell; neither, though it has a range it cannot be compared with
 * (a censored value it cannot place, a range in another unit, a word); or
 * no range at all
 */
export type StatusBasis = 'range' | 'lab' | 'uncomparable' | 'none';

/** The status a range gives a plain or censored number; unknown when it cannot tell */
function rangeStatus(
  value: number,
  censored: CensoredComparator | undefined,
  low: number | undefined,
  high: number | undefined
): ValueStatus {
  if (low === undefined && high === undefined) return 'unknown';
  switch (censored) {
    case undefined:
      if (low !== undefined && value < low) return 'low';
      if (high !== undefined && value > high) return 'high';
      return 'normal';
    case '<':
    case '<=': {
      // Somewhere from 0 up to the bound (the bound itself only for "<=")
      if (low !== undefined && (censored === '<' ? value <= low : value < low)) return 'low';
      const lowMet = low === undefined || low <= 0;
      const highMet = high === undefined || value <= high;
      return lowMet && highMet ? 'normal' : 'unknown';
    }
    case '>':
    case '>=': {
      // Anywhere above the bound (from the bound itself for ">=")
      if (high !== undefined && (censored === '>' ? value >= high : value > high)) return 'high';
      return high === undefined && low !== undefined && value >= low ? 'normal' : 'unknown';
    }
  }
}

function flagStatus(flag: LabFlag | undefined): ValueStatus {
  return flag === 'high' || flag === 'low' ? flag : 'unknown';
}

/** A value's status: by its range when it tells, else by the lab's mark; with what gave it */
export function readValueStatus(input: StatusInput): { status: ValueStatus; basis: StatusBasis } {
  const { referenceRangeLow: low, referenceRangeHigh: high } = input;
  const byRange = typeof input.value === 'number' ? rangeStatus(input.value, input.censored, low, high) : 'unknown';
  if (byRange !== 'unknown') return { status: byRange, basis: 'range' };
  const byLab = flagStatus(input.labFlag);
  if (byLab !== 'unknown') return { status: byLab, basis: 'lab' };
  const hasRange = low !== undefined || high !== undefined || input.unconvertedRange !== undefined;
  return { status: 'unknown', basis: hasRange ? 'uncomparable' : 'none' };
}

/** A range printed in a unit it cannot be converted from to the value's */
export interface UnconvertedRange {
  low?: number;
  high?: number;
  unit: string;
}

/**
 * A range's ends converted from the unit it was printed in to its value's,
 * as the test converts; undefined when they cannot be. The import saves a
 * range so, so a saved range in another unit than its value's is one that
 * could not be converted.
 */
export function convertRange(
  catalog: Catalog,
  biomarkerKey: string | undefined,
  range: { low?: number; high?: number },
  fromUnit: string,
  toUnit: string
): { low?: number; high?: number } | undefined {
  if (unitsMatch(fromUnit, toUnit)) return range;
  const test = biomarkerKey ? catalog.test(biomarkerKey) : undefined;
  if (!test || !canConvert(test, fromUnit, toUnit)) return undefined;
  const converted = convertMeasurement(
    test,
    { value: range.low ?? range.high ?? 0, unit: fromUnit, referenceRangeLow: range.low, referenceRangeHigh: range.high },
    toUnit
  );
  return converted.unit === toUnit ? converted.referenceRange : undefined;
}

/**
 * A saved value whose range is in another unit than its own: the range is
 * set apart (`unconvertedRange`), shown in its own unit but never compared
 * with the value, since the import converts every range that converts
 */
export function withRangeInValueUnit<T extends TestValue>(
  testValue: T
): T & { unconvertedRange?: UnconvertedRange } {
  const { referenceRangeUnit: rangeUnit, referenceRangeLow: low, referenceRangeHigh: high, unit } = testValue;
  if (!rangeUnit || unitsMatch(rangeUnit, unit) || (low === undefined && high === undefined)) {
    return testValue;
  }
  return {
    ...testValue,
    referenceRangeLow: undefined,
    referenceRangeHigh: undefined,
    unconvertedRange: { low, high, unit: rangeUnit },
  };
}
