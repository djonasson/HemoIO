/**
 * OCR assets served by the app itself (copied at build time, precached by
 * the service worker), so OCR needs no CDN and works offline.
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
