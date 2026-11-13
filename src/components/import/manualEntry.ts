/**
 * Manual entry: a file the analysis could not read becomes an empty result
 * whose values the user types in on the review step
 */
import type { AnalysisResult } from './AnalysisStep';

// The analysis result each manual entry was made from
const sources = new WeakMap<AnalysisResult, AnalysisResult>();

export function manualEntryResult(result: AnalysisResult): AnalysisResult {
  const entry: AnalysisResult = {
    ...result,
    success: true,
    error: undefined,
    biomarkers: [],
    confidence: 1,
    warnings: [],
    duplicateConflicts: undefined,
    manualEntry: true,
  };
  sources.set(entry, result);
  return entry;
}

/**
 * The analysis result a result stands for: a manual entry's source, or the
 * result itself
 */
export function analysisSource(result: AnalysisResult): AnalysisResult {
  return sources.get(result) ?? result;
}
