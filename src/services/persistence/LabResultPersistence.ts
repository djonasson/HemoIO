/**
 * Lab Result Persistence Service
 *
 * Transforms reviewed import results into database format and saves them.
 */

import type { ReviewedResult } from '@components/import';
import type { MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';
import type { EncryptedDb } from '@data/db';
import type { LabResult, TestValue } from '@/types';
import { findBiomarker, BIOMARKER_DEFINITIONS } from '@data/biomarkers/dictionary';

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
 * Parse a date string into a Date object
 * Supports formats: YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY
 * Uses UTC to avoid timezone issues when storing dates
 */
function parseLabDate(dateStr: string | undefined): Date {
  if (!dateStr) {
    return new Date();
  }

  // Try ISO format first (YYYY-MM-DD)
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    // Use UTC to store the date consistently
    return new Date(Date.UTC(
      parseInt(isoMatch[1]),
      parseInt(isoMatch[2]) - 1,
      parseInt(isoMatch[3]),
      12, 0, 0 // Noon UTC to avoid date shift issues
    ));
  }

  // Try US format (MM/DD/YYYY)
  const usMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) {
    return new Date(Date.UTC(
      parseInt(usMatch[3]),
      parseInt(usMatch[1]) - 1,
      parseInt(usMatch[2]),
      12, 0, 0
    ));
  }

  // Try European format (DD/MM/YYYY)
  const euMatch = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (euMatch) {
    return new Date(Date.UTC(
      parseInt(euMatch[3]),
      parseInt(euMatch[2]) - 1,
      parseInt(euMatch[1]),
      12, 0, 0
    ));
  }

  // Fallback to Date constructor
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Resolve biomarker ID from a matched biomarker
 *
 * Uses the dictionary match if available, otherwise looks up by name.
 * Returns a stable ID based on the biomarker's position in the dictionary.
 */
function resolveBiomarkerId(biomarker: MatchedBiomarker): number {
  // If we have a dictionary match, find its index in the definitions
  if (biomarker.dictionaryMatch) {
    const index = BIOMARKER_DEFINITIONS.findIndex(
      (b) => b.name === biomarker.dictionaryMatch!.name
    );
    if (index >= 0) {
      return index + 1; // 1-based ID
    }
  }

  // Try to find by name
  const found = findBiomarker(biomarker.name);
  if (found) {
    const index = BIOMARKER_DEFINITIONS.findIndex((b) => b.name === found.name);
    if (index >= 0) {
      return index + 1;
    }
  }

  // Return a high ID for unknown biomarkers (will be stored but not matched to dictionary)
  // Use a hash of the name for consistency
  let hash = 0;
  for (let i = 0; i < biomarker.name.length; i++) {
    const char = biomarker.name.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return 10000 + Math.abs(hash % 90000);
}

/**
 * Transform a MatchedBiomarker to a TestValue for database storage
 */
function transformBiomarkerToTestValue(
  biomarker: MatchedBiomarker,
  labResultId: number
): Omit<TestValue, 'id'> {
  const now = new Date();
  const biomarkerId = resolveBiomarkerId(biomarker);

  return {
    labResultId,
    biomarkerId,
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
  const labDate = parseLabDate(reviewed.editedLabDate || reviewed.labDate);
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
