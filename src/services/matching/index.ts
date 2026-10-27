import { BIOMARKER_DEFINITIONS } from '@data/biomarkers/dictionary';
import { createSimilarNameMatcher, type SimilarNameMatcher } from './similarNames';
import { loadTransformersEmbedder } from './transformersEmbedder';

export const MATCHING_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
/** The model repository's commit the threshold was calibrated on (2025-07-22) */
export const MATCHING_MODEL_REVISION = '2c4055b12046f11709e9df2c122e59ffbdc2f900';
/**
 * Calibrated on labelledNames (similarNames.calibration.ts): the lowest
 * similarity at which no labelled name is filed under the wrong test and no
 * name of a test the dictionary lacks is matched. A wrong match is worse
 * than none, so below it a name is "Not identified". (multilingual-e5-small
 * matched more names first, but scored names of tests the dictionary lacks
 * as high as right ones, so no threshold kept them out.) In the browser the
 * scores are within ±0.03 of Node's; the closest wrong match, "Azotemia" as
 * Urine Urea, scores 0.85–0.87, so the threshold clears it by more than that.
 */
export const SIMILARITY_THRESHOLD = 0.91;

let matcher: Promise<SimilarNameMatcher> | undefined;

/** The matcher, loading the model on first use; a failed load is retried next time */
export function getSimilarNameMatcher(onLoading?: () => void): Promise<SimilarNameMatcher> {
  if (!matcher) {
    onLoading?.();
    matcher = loadTransformersEmbedder(MATCHING_MODEL, MATCHING_MODEL_REVISION).then((embedder) =>
      createSimilarNameMatcher(embedder, BIOMARKER_DEFINITIONS, SIMILARITY_THRESHOLD)
    );
    matcher.catch(() => {
      matcher = undefined;
    });
  }
  return matcher;
}

export type { Embedder, SimilarNameMatcher } from './similarNames';
export { MODEL_LOADING_STAGE, MODEL_LOAD_NOTE } from './notes';
