/**
 * A model's value for a biomarker, read the same way by every provider
 */

import { unitsMatch } from '@/utils/unitSpelling';
import { parseExtractedValue } from './parseQualitativeValue';
import { withLabFlag } from './labFlag';
import type { ExtractedBiomarker } from './types';

/**
 * A biomarker's value as read from what the model gave (an interval like
 * "5-10", a censored "< 10", a qualitative word like "Assenti"), its unit,
 * blank for a qualitative result, which has none, and the lab's mark
 */
export function withParsedValue(
  raw: Record<string, unknown>,
  unit: string
): Pick<
  ExtractedBiomarker,
  'value' | 'unit' | 'labFlag' | 'censored' | 'isInterval' | 'intervalLow' | 'intervalHigh' | 'rawValue' | 'qualitative'
> {
  const parsed = parseExtractedValue(raw.value, raw.qualitativeValue);
  return {
    value: parsed.value,
    unit: parsed.qualitative ? '' : unit,
    ...withLabFlag(raw),
    censored: parsed.censored,
    isInterval: parsed.isInterval,
    intervalLow: parsed.intervalLow,
    intervalHigh: parsed.intervalHigh,
    rawValue: parsed.rawValue,
    qualitative: parsed.qualitative,
  };
}

/**
 * A range's own unit: only one the model gave that is not the value's.
 * Else the range has none and is in the value's unit, so it follows a
 * value unit corrected on review, its numbers kept as printed.
 */
export function rangeUnitOf(printed: unknown, valueUnit: string): string | undefined {
  const unit = typeof printed === 'string' ? printed.trim() : '';
  return unit && !unitsMatch(unit, valueUnit) ? unit : undefined;
}
