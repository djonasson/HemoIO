/**
 * Manual entry: a file the analysis could not read becomes an empty result
 * whose values the user types in on the review step
 */
import type { AnalysisResult } from './AnalysisStep';

export function manualEntryResult(result: AnalysisResult): AnalysisResult {
  return {
    ...result,
    success: true,
    error: undefined,
    biomarkers: [],
    confidence: 1,
    warnings: [],
    duplicateConflicts: undefined,
    manualEntry: true,
  };
}
