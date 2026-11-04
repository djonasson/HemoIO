/**
 * Lab Result Persistence Service
 *
 * Transforms reviewed import results into database format and saves them.
 */

import type { ReviewedResult } from '@components/import';
import type { MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';
import type { EncryptedDb, LabResultWithValues } from '@data/db/encryptedDb';
import type { LabResult, TestValue } from '@/types';
import { unknownBiomarkerKey } from '@data/biomarkers/dictionary';
import { normalizeLabDate } from '@/utils/labDate';

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
 * a value from elsewhere with no code) the unknown key of its printed name.
 * The name alone never picks a test.
 */
function resolveBiomarkerKey(biomarker: MatchedBiomarker): string {
  return biomarker.savedAsUnknown || !biomarker.loincCode
    ? unknownBiomarkerKey(biomarker.name)
    : biomarker.loincCode;
}

/**
 * Transform a MatchedBiomarker to a TestValue for database storage
 */
function transformBiomarkerToTestValue(
  biomarker: MatchedBiomarker
): Omit<TestValue, 'id' | 'labResultId'> {
  const now = new Date();

  return {
    biomarkerKey: resolveBiomarkerKey(biomarker),
    value: biomarker.value,
    unit: biomarker.unit,
    referenceRangeLow: biomarker.referenceRange?.low,
    referenceRangeHigh: biomarker.referenceRange?.high,
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
 * @returns What was saved
 * @throws SaveError when the browser's storage did not keep the import
 */
export async function saveImportResults(
  results: ReviewedResult[],
  db: EncryptedDb
): Promise<SaveImportResultsOutput> {
  const entries: LabResultWithValues[] = results.map((reviewed) => ({
    labResult: transformReviewedToLabResult(reviewed),
    testValues: reviewed.editedBiomarkers.map(transformBiomarkerToTestValue),
  }));
  if (entries.length > 0) await db.addLabResultsWithValues(entries);
  return {
    totalLabResults: entries.length,
    totalTestValues: entries.reduce((sum, entry) => sum + entry.testValues.length, 0),
  };
}
