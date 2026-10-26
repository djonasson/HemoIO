/**
 * The name of the cache the service worker keeps the OCR files in, for the
 * build (vite.config.ts) and the tests (vitest.config.ts). It names the
 * tesseract.js release the files come from: a release that changes them
 * caches them anew, instead of mixing new code with old files.
 */

import { readFileSync } from 'fs';
import { ocrCacheName } from './src/services/ocr/ocrAssets';

function versionOf(pkg: string): string {
  return JSON.parse(readFileSync(`node_modules/${pkg}/package.json`, 'utf8')).version;
}

export const OCR_CACHE_NAME = ocrCacheName(
  `${versionOf('tesseract.js')}-${versionOf('tesseract.js-core')}`
);
