import { describe, it, expect } from 'vitest';
import { OCR_LANGUAGES, ocrAssetUrls, ocrCopyTargets } from './ocrAssets';

describe('OCR assets', () => {
  it('bundles English and Italian', () => {
    expect(OCR_LANGUAGES).toEqual(['eng', 'ita']);
  });

  it('serves everything from the app origin', () => {
    expect(ocrAssetUrls('https://app.example', '/')).toEqual({
      workerPath: 'https://app.example/tesseract/worker.min.js',
      corePath: 'https://app.example/tesseract/core',
      langPath: 'https://app.example/tesseract/lang',
    });
    expect(ocrAssetUrls('https://app.example', '/hemo/').langPath).toBe(
      'https://app.example/hemo/tesseract/lang'
    );
  });

  it('copies the worker, the three cores and one data file per language', () => {
    const sources = ocrCopyTargets().map((t) => t.src);
    expect(sources).toContain('node_modules/tesseract.js/dist/worker.min.js');
    expect(sources.filter((src) => src.includes('tesseract.js-core/'))).toHaveLength(3);
    for (const lang of OCR_LANGUAGES) {
      expect(sources).toContain(
        `node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`
      );
    }
  });
});
