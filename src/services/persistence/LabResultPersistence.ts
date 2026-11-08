/**
 * Lab Result Persistence Service
 *
 * Transforms reviewed import results into database format and saves them.
 */

import { heldQualitative } from '@services/ai/parseQualitativeValue';
import { extractedInterval } from '@services/ai/parseIntervalValue';
import { unknownKeyOf } from '@services/analysis/identification';
import { convertRange } from '@services/statistics/valueStatus';
import { normalizeLabDate } from '@/utils/labDate';
import type { ReviewedResult } from '@components/import';
import type { MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';
import type { EncryptedDb, LabResultWithValues } from '@data/db/encryptedDb';
import type { Catalog } from '@data/loinc/catalog';
import type { LabResult, TestValue } from '@/types';

/**
 * What an import saved
 */
export interface SaveImportResultsOutput {
  /** Lab results saved, one per file */
  totalLabResults: number;
  /** Test values saved, across the files */
  totalTestValues: number;
}

/**
 * The stored date of a lab result: its calendar day at noon UTC, so it shows
 * as the same day in every timezone. Review requires a readable date; today
 * is only a last resort for results saved without one.
 */
function parseLabDate(dateStr: string | undefined): Date {
  const day = normalizeLabDate(dateStr);
  if (!day) return new Date();
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date, 12, 0, 0));
}

/**
 * The stored key of a value: its LOINC code, else ("Not a LOINC test", or
 * a value from elsewhere with no code) its unknown key (see unknownKeyOf).
 * The name alone never picks a test.
 */
function resolveBiomarkerKey(biomarker: MatchedBiomarker): string {
  return biomarker.savedAsUnknown || !biomarker.loincCode ? unknownKeyOf(biomarker) : biomarker.loincCode;
}

/**
 * The stored value: a qualitative result as printed ("Assenti"), with the
 * number it reads as; an interval's midpoint, with its ends; a censored
 * value's bound, with its comparator; else the number
 */
function storedValue(
  biomarker: MatchedBiomarker
): Pick<
  TestValue,
  'value' | 'qualitativeType' | 'ordinalValue' | 'numericValueType' | 'intervalLow' | 'intervalHigh' | 'censored'
> {
  const qualitative = heldQualitative(biomarker);
  if (qualitative) {
    return { value: qualitative.text, qualitativeType: qualitative.kind, ordinalValue: qualitative.value };
  }
  const interval = extractedInterval(biomarker);
  if (interval) {
    return { value: biomarker.value, numericValueType: 'interval', intervalLow: interval.low, intervalHigh: interval.high };
  }
  // A censored value keeps its comparator: "< 10" is never a plain 10
  return biomarker.censored ? { value: biomarker.value, censored: biomarker.censored } : { value: biomarker.value };
}

/**
 * The stored range: in the value's unit when it was printed in another
 * that converts, else as printed with its unit (never compared then)
 */
function storedRange(
  biomarker: MatchedBiomarker,
  catalog: Catalog
): Pick<TestValue, 'referenceRangeLow' | 'referenceRangeHigh' | 'referenceRangeUnit'> {
  const range = biomarker.referenceRange;
  if (!range) return {};
  const printed = { low: range.low, high: range.high };
  const converted = range.unit ? convertRange(catalog, biomarker.loincCode, printed, range.unit, biomarker.unit) : printed;
  const { low, high } = converted ?? printed;
  return {
    referenceRangeLow: low,
    referenceRangeHigh: high,
    referenceRangeUnit: converted ? biomarker.unit || undefined : range.unit,
  };
}

/**
 * Transform a MatchedBiomarker to a TestValue for database storage
 */
function transformBiomarkerToTestValue(
  biomarker: MatchedBiomarker,
  catalog: Catalog
): Omit<TestValue, 'id' | 'labResultId'> {
  const now = new Date();

  return {
    biomarkerKey: resolveBiomarkerKey(biomarker),
    ...storedValue(biomarker),
    unit: biomarker.unit,
    ...storedRange(biomarker, catalog),
    labFlag: biomarker.labFlag,
    method: biomarker.method,
    rawText: biomarker.name, // Store original name as raw text
    confidence: biomarker.confidence,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Transform a ReviewedResult to a LabResult for database storage
 */
function transformReviewedToLabResult(
  reviewed: ReviewedResult
): Omit<LabResult, 'id'> {
  const now = new Date();
  const labDate = parseLabDate(reviewed.editedLabDate ?? reviewed.labDate);
  const labName = reviewed.editedLabName || reviewed.labName || 'Unknown Lab';

  return {
    date: labDate,
    labName,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Save the reviewed results of an import, every file or none: a partly
 * saved import could not be retried without duplicating what was kept
 *
 * @param results - The reviewed results from the import wizard, one per file
 * @param db - The encrypted database instance
 * @param catalog - Converts a range printed in another unit than its value's
 * @returns What was saved
 * @throws SaveError when the browser's storage did not keep the import
 */
export async function saveImportResults(
  results: ReviewedResult[],
  db: EncryptedDb,
  catalog: Catalog
): Promise<SaveImportResultsOutput> {
  const entries: LabResultWithValues[] = results.map((reviewed) => ({
    labResult: transformReviewedToLabResult(reviewed),
    testValues: reviewed.editedBiomarkers.map((biomarker) => transformBiomarkerToTestValue(biomarker, catalog)),
  }));
  if (entries.length > 0) await db.addLabResultsWithValues(entries);
  return {
    totalLabResults: entries.length,
    totalTestValues: entries.reduce((sum, entry) => sum + entry.testValues.length, 0),
  };
}
