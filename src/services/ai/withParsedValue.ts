/**
 * A model's value for a biomarker, read the same way by every provider
 */

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
