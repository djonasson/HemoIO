/**
 * Review edits kept across going back to the analysis step
 */
import { analysisSource } from './manualEntry';
import type { AnalysisResult } from './AnalysisStep';
import type { ReviewedResult } from './ReviewStep';

/**
 * The results to review, keeping the user's edits of each file whose result
 * did not change since it was last reviewed. A file whose result changed (it
 * was analysed again) or that was not reviewed before starts afresh. The
 * results' order is kept.
 *
 * @param reviewed - The results as last reviewed
 * @param previous - The analysis results they were reviewed from
 * @param results - The analysis results to review now
 */
export function keepReviewEdits(
  reviewed: ReviewedResult[],
  previous: AnalysisResult[],
  results: AnalysisResult[]
): ReviewedResult[] {
  return results.map((result) => {
    const before = previous.find((p) => p.fileId === result.fileId);
    const kept = reviewed.find((r) => r.fileId === result.fileId);
    // Manual entry makes a new result each time, from the same analysis result
    const unchanged = before !== undefined && analysisSource(before) === analysisSource(result);
    if (kept && unchanged) return kept;
    return { ...result, editedBiomarkers: [...result.biomarkers] };
  });
}
