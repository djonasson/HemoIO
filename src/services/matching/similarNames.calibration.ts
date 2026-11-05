/**
 * Calibration of the matching model on real printed names (labelledNames).
 * Downloads the model: run with
 *   npx vitest run --config vitest.calibration.config.ts
 */
import { it, expect } from 'vitest';
import { loadCatalog } from '@data/loinc/catalog';
import { loadTransformersEmbedder } from './transformersEmbedder';
import { MATCHING_MODEL, MATCHING_MODEL_REVISION, SIMILARITY_THRESHOLD, namedTests } from './index';
import { createSimilarNameMatcher } from './similarNames';
import { LABELLED_NAMES } from './labelledNames';

it('never files a labelled name under the wrong test, and matches as many as calibrated', async () => {
  const matcher = createSimilarNameMatcher(
    await loadTransformersEmbedder(MATCHING_MODEL, MATCHING_MODEL_REVISION),
    namedTests(await loadCatalog()),
    SIMILARITY_THRESHOLD
  );
  let matched = 0;
  for (const [name, key] of LABELLED_NAMES) {
    const [first] = await matcher.similar(name);
    // A wrong match is worse than none
    if (first) expect(first.key, name).toBe(key);
    if (first) matched++;
  }
  // Measured at calibration (2026-10-27): 5 of the 19 names of known tests
  expect(matched).toBeGreaterThanOrEqual(5);
});
