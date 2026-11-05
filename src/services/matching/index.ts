import { TEST_ADDONS } from '@data/loinc/addons';
import { loadCatalog, type Catalog } from '@data/loinc/catalog';
import { testDisplayName } from '@data/loinc/display';
import { createSimilarNameMatcher, type NamedTest, type SimilarNameMatcher } from './similarNames';
import { loadTransformersEmbedder } from './transformersEmbedder';

export const MATCHING_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
/** The model repository's commit the threshold was calibrated on (2025-07-22) */
export const MATCHING_MODEL_REVISION = '2c4055b12046f11709e9df2c122e59ffbdc2f900';
/**
 * Calibrated on labelledNames (similarNames.calibration.ts): the lowest
 * similarity at which no labelled name is filed under the wrong test and no
 * name of a test HemoIO does not describe is matched. A wrong match is worse
 * than none, so below it a name is "Not identified". (multilingual-e5-small
 * matched more names first, but scored names of tests HemoIO does not describe
 * as high as right ones, so no threshold kept them out.) In the browser the
 * scores are within ±0.03 of Node's; the closest wrong match, "Azotemia" as
 * Urine Urea, scores 0.85–0.87, so the threshold clears it by more than that.
 */
export const SIMILARITY_THRESHOLD = 0.91;

/** The tests HemoIO describes, each with its name and LOINC's names for it */
export function namedTests(catalog: Catalog): NamedTest[] {
  return Object.keys(TEST_ADDONS).flatMap((code) => {
    const test = catalog.test(code);
    if (!test) return [];
    const names = new Set([testDisplayName(catalog, { biomarkerKey: code }), ...test.names]);
    return [{ key: code, names: [...names] }];
  });
}

let matcher: Promise<SimilarNameMatcher> | undefined;

/** The matcher, loading the model on first use; a failed load is retried next time */
export function getSimilarNameMatcher(onLoading?: () => void): Promise<SimilarNameMatcher> {
  if (!matcher) {
    onLoading?.();
    matcher = Promise.all([
      loadTransformersEmbedder(MATCHING_MODEL, MATCHING_MODEL_REVISION),
      loadCatalog(),
    ]).then(([embedder, catalog]) =>
      createSimilarNameMatcher(embedder, namedTests(catalog), SIMILARITY_THRESHOLD)
    );
    matcher.catch(() => {
      matcher = undefined;
    });
  }
  return matcher;
}

export type { Embedder, NamedTest, SimilarNameMatcher } from './similarNames';
export { MODEL_LOADING_STAGE, MODEL_LOAD_NOTE } from './notes';
