/**
 * A test's standard range beside the user's personal target, as the
 * targets list and the target editor show it. A target is the test's, so it
 * applies to every code of its trend group; it is kept under the trend code.
 */
import { standardRange, targetUnit, testDisplayName } from '@data/loinc/display';
import type { Catalog } from '@data/loinc/catalog';

export interface PersonalTarget {
  /** The test's trend code */
  biomarkerKey: string;
  biomarkerName: string;
  unit: string;
  standardLow?: number;
  standardHigh?: number;
  personalLow?: number;
  personalHigh?: number;
}

interface TargetRange {
  low?: number;
  high?: number;
}

/** Whether a stored target sets at least one bound */
export function hasTargetRange(range: TargetRange | undefined): range is TargetRange {
  return range !== undefined && (range.low !== undefined || range.high !== undefined);
}

/**
 * A test's target, given in its standard unit, else in its range's unit,
 * else in the first unit LOINC gives the test
 */
export function toPersonalTarget(
  catalog: Catalog,
  code: string,
  target: TargetRange | undefined
): PersonalTarget {
  const standard = standardRange(catalog, code);
  return {
    biomarkerKey: code,
    biomarkerName: testDisplayName(catalog, { biomarkerKey: code }),
    unit: targetUnit(catalog, code),
    standardLow: standard?.low,
    standardHigh: standard?.high,
    personalLow: target?.low,
    personalHigh: target?.high,
  };
}
