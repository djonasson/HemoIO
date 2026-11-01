/**
 * How a reviewed value's number reads in the import wizard
 */

import { formatIntervalValue } from '@services/ai';
import { formatReferenceRange } from '@services/alerts/alertRules';
import type { MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';

/**
 * A value's number, or its interval ("0-1"), or nothing when it has no
 * number yet (a cleared field or a row not filled in)
 */
export function formatReviewedValue(
  biomarker: Pick<MatchedBiomarker, 'value' | 'isInterval' | 'intervalLow' | 'intervalHigh'>
): string {
  if (biomarker.isInterval && biomarker.intervalLow !== undefined && biomarker.intervalHigh !== undefined) {
    return formatIntervalValue(biomarker.intervalLow, biomarker.intervalHigh);
  }
  return Number.isFinite(biomarker.value) ? String(biomarker.value) : '';
}

/**
 * A value's reference range with its unit, or null when it has none. A
 * range typed before its unit has none of its own, so it reads in the
 * value's unit.
 */
export function formatReviewedRange({
  referenceRange: range,
  unit,
}: Pick<MatchedBiomarker, 'referenceRange' | 'unit'>): string | null {
  return range ? formatReferenceRange(range, range.unit || unit) : null;
}
