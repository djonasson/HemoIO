/**
 * Lab Result Persistence Service
 *
 * Transforms reviewed import results into database format and saves them.
 */

import type { ReviewedResult } from '@components/import';
import type { MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';
import type { EncryptedDb } from '@data/db';
import type { LabResult, TestValue } from '@/types';
import { findBiomarker, unknownBiomarkerKey } from '@data/biomarkers/dictionary';
import { normalizeLabDate } from '@/utils/labDate';

/**
 * Output from saving a lab result
 */
export interface SaveLabResultOutput {
  /** The saved lab result ID */
  labResultId: number;
  /** Count of test values saved */
  testValueCount: number;
  /** Any warnings during save */
  warnings: string[];
}

/**
 * Result of saving multiple import results
 */
export interface SaveImportResultsOutput {
  /** Individual save results */
  results: SaveLabResultOutput[];
  /** Total lab results saved */
  totalLabResults: number;
  /** Total test values saved */
  totalTestValues: number;
  /** Any errors that occurred */
  errors: Array<{ fileName: string; error: string }>;
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
 * Resolve the stored biomarker key: the dictionary match, else a stable key
 * for the unknown name. A value the analyzer identified (it has
 * identification flags) is saved as review showed it: without a match it
 * is not in the dictionary, whatever its name. Only values from elsewhere
 * (manual entry) are still looked up by name.
 */
function resolveBiomarkerKey(biomarker: MatchedBiomarker): string {
  // The user chose "Not in dictionary", or review showed it
  if (biomarker.savedAsUnknown || (biomarker.identificationFlags && !biomarker.dictionaryMatch)) {
    return unknownBiomarkerKey(biomarker.name);
  }
  const definition = biomarker.dictionaryMatch ?? findBiomarker(biomarker.name);
  return definition?.key ?? unknownBiomarkerKey(biomarker.name);
}

/**
 * Transform a MatchedBiomarker to a TestValue for database storage
 */
function transformBiomarkerToTestValue(
  biomarker: MatchedBiomarker,
  labResultId: number
): Omit<TestValue, 'id'> {
  const now = new Date();

  return {
    labResultId,
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
 * Save a single reviewed result to the database
 *
 * @param reviewed - The reviewed result from the import wizard
 * @param db - The encrypted database instance
 * @returns SaveLabResultOutput with the saved IDs and any warnings
 */
export async function saveReviewedResult(
  reviewed: ReviewedResult,
  db: EncryptedDb
): Promise<SaveLabResultOutput> {
  const warnings: string[] = [];

  // Transform and save the lab result
  const labResultData = transformReviewedToLabResult(reviewed);
  const labResultId = await db.addLabResult(labResultData);

  // Transform and save all test values
  const testValueData = reviewed.editedBiomarkers.map((biomarker) =>
    transformBiomarkerToTestValue(biomarker, labResultId)
  );

  // Track biomarkers that couldn't be matched to dictionary
  const unmatchedBiomarkers = reviewed.editedBiomarkers.filter(
    (b) => !b.dictionaryMatch && !findBiomarker(b.name)
  );
  if (unmatchedBiomarkers.length > 0) {
    warnings.push(
      `${unmatchedBiomarkers.length} biomarker(s) not found in dictionary: ${unmatchedBiomarkers
        .map((b) => b.name)
        .join(', ')}`
    );
  }

  // Save test values in bulk
  if (testValueData.length > 0) {
    await db.addTestValues(testValueData);
  }

  return {
    labResultId,
    testValueCount: testValueData.length,
    warnings,
  };
}

/**
 * Save multiple reviewed results to the database
 *
 * @param results - Array of reviewed results from the import wizard
 * @param db - The encrypted database instance
 * @returns SaveImportResultsOutput with all saved IDs and any errors
 *
 * @example
 * ```tsx
 * const { db } = useEncryptedDb();
 * const output = await saveImportResults(reviewedResults, db);
 * console.log(`Saved ${output.totalLabResults} results with ${output.totalTestValues} test values`);
 * ```
 */
export async function saveImportResults(
  results: ReviewedResult[],
  db: EncryptedDb
): Promise<SaveImportResultsOutput> {
  const output: SaveImportResultsOutput = {
    results: [],
    totalLabResults: 0,
    totalTestValues: 0,
    errors: [],
  };

  for (const reviewed of results) {
    try {
      const saveResult = await saveReviewedResult(reviewed, db);
      output.results.push(saveResult);
      output.totalLabResults++;
      output.totalTestValues += saveResult.testValueCount;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      output.errors.push({
        fileName: reviewed.fileName,
        error: errorMessage,
      });
    }
  }

  return output;
}
