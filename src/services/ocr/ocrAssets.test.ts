import { describe, it, expect } from 'vitest';
import {
  OCR_LANGUAGES,
  OCR_PRECACHE_GLOBS,
  OCR_PRECACHE_IGNORES,
  ocrAssetUrls,
  ocrCopyTargets,
  ocrRuntimeCaching,
} from './ocrAssets';

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

  describe('offline caching', () => {
    const urls = ocrAssetUrls('https://app.example', '/HemoIO/');
    const matches = (url: string) => {
      const pattern = ocrRuntimeCaching().urlPattern;
      return pattern instanceof RegExp && pattern.test(url);
    };

    it('does not download the OCR files when the app is installed', () => {
      expect(OCR_PRECACHE_GLOBS.some((glob) => glob.includes('tesseract'))).toBe(false);
      // The OCR worker and cores are .js files, which the globs match
      expect(OCR_PRECACHE_IGNORES).toContain('tesseract/**');
    });

    it('caches each OCR file the first time OCR loads it', () => {
      expect(ocrRuntimeCaching().handler).toBe('CacheFirst');
      expect(matches(urls.workerPath)).toBe(true);
      expect(matches(`${urls.corePath}/tesseract-core-simd-lstm.wasm.js`)).toBe(true);
      expect(matches(`${urls.langPath}/ita.traineddata.gz`)).toBe(true);
    });

    it('leaves other files to the precache', () => {
      expect(matches('https://app.example/HemoIO/assets/index-abc.js')).toBe(false);
    });
  });
});
