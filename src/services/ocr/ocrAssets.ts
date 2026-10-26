/**
 * OCR assets served by the app itself (copied at build time), so OCR needs no
 * CDN. The service worker caches each file the first time OCR loads it, so
 * OCR works offline after its first use without every user downloading all
 * three cores and every language when the app is installed.
 *
 * To add a language: add its Tesseract code here and install
 * @tesseract.js-data/<code>.
 *
 * Imported by vite.config.ts: keep it free of browser APIs and path aliases.
 */

export const OCR_LANGUAGES: readonly string[] = ['eng', 'ita'];

export const OCR_ASSET_DIR = 'tesseract';

/** tesseract.js picks one of these LSTM cores by the browser's SIMD support */
export const OCR_CORE_FILES: readonly string[] = [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
];

/** Where the browser loads the assets from */
export function ocrAssetUrls(
  origin: string,
  base: string
): { workerPath: string; corePath: string; langPath: string } {
  const root = `${origin}${base.endsWith('/') ? base : `${base}/`}${OCR_ASSET_DIR}`;
  return {
    workerPath: `${root}/worker.min.js`,
    corePath: `${root}/core`,
    langPath: `${root}/lang`,
  };
}

/** Files to copy into the build, relative to the project root */
export function ocrCopyTargets(): Array<{ src: string; dest: string }> {
  return [
    { src: 'node_modules/tesseract.js/dist/worker.min.js', dest: OCR_ASSET_DIR },
    ...OCR_CORE_FILES.map((file) => ({
      src: `node_modules/tesseract.js-core/${file}`,
      dest: `${OCR_ASSET_DIR}/core`,
    })),
    ...OCR_LANGUAGES.map((lang) => ({
      src: `node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,
      dest: `${OCR_ASSET_DIR}/lang`,
    })),
  ];
}

/** App files the service worker downloads on install; the OCR files are left out */
export const OCR_PRECACHE_GLOBS: readonly string[] = [
  // .mjs: the PDF.js worker, without which no PDF opens offline
  '**/*.{js,mjs,css,html,ico,png,svg,woff,woff2}',
];

/** The OCR worker and cores are .js files, which the precache globs would match */
export const OCR_PRECACHE_IGNORES: readonly string[] = [`${OCR_ASSET_DIR}/**`];

/** The Workbox runtime caching rule for the OCR files */
export function ocrRuntimeCaching(): {
  urlPattern: RegExp;
  handler: 'CacheFirst';
  options: { cacheName: string; cacheableResponse: { statuses: number[] } };
} {
  return {
    urlPattern: new RegExp(`/${OCR_ASSET_DIR}/`),
    // The files never change within a build
    handler: 'CacheFirst',
    options: { cacheName: 'ocr-assets', cacheableResponse: { statuses: [200] } },
  };
}
