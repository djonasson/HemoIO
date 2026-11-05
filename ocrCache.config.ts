/**
 * The name of the cache the service worker keeps the OCR files in, for the
 * build (vite.config.ts) and the tests (vitest.config.ts). It names the
 * tesseract.js release the files come from: a release that changes them
 * caches them anew, instead of mixing new code with old files.
 */

import { installedVersion } from './packageVersions.config';
import { ocrCacheName } from './src/services/ocr/ocrAssets';

export const OCR_CACHE_NAME = ocrCacheName(
  `${installedVersion('tesseract.js')}-${installedVersion('tesseract.js-core')}`
);
