import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as pdfjsLib from 'pdfjs-dist';
import { readPdf, readingScore } from './pdfReader';
import { PDFExtractionError } from './pdfExtractor';
import { OCRError, recognizeImage, type OCRResult } from './tesseractService';
import type { PdfjsMockControls } from '@/test/mocks/pdfjs';

vi.mock('pdfjs-dist', async () => (await import('@/test/mocks/pdfjs')).createPdfjsMock());
vi.mock('./tesseractService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tesseractService')>()),
  recognizeImage: vi.fn(),
}));

const { __setMockConfig, __resetMockConfig, __openedDocuments } = pdfjsLib as unknown as PdfjsMockControls;

describe('PDF reader', () => {
  beforeEach(() => {
    __resetMockConfig();
    vi.clearAllMocks();
  });

  describe('readingScore', () => {
    it('scores a report, even of short names and units, above the same marks read the wrong way round', () => {
      const report = readingScore({ text: 'Hb 14 g/dl\nGR 4,5\nGB 6,9 10^3/ul', confidence: 61 });
      const sideways = readingScore({ text: 'Tr oO O = © = 9 Q = O Dj = © OO e I Q n = QD o © o ©', confidence: 61 });
      expect(report).toBeGreaterThan(sideways * 1.2);
    });

    it('gives the confidence itself for text all in words, and nothing for no text', () => {
      expect(readingScore({ text: 'Glucose 95 mg', confidence: 90 })).toBe(90);
      expect(readingScore({ text: ' \n', confidence: 0 })).toBe(0);
    });
  });

  describe('readPdf', () => {
    let renderedSizes: string[];

    function ocr(text: string, confidence: number): OCRResult {
      return { text, confidence, words: [], wasRotated: false, rotationAngle: 0, processingTime: 1 };
    }

    beforeEach(() => {
      renderedSizes = [];
      // jsdom has no canvas implementation
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
        this: HTMLCanvasElement,
        callback: BlobCallback
      ) {
        renderedSizes.push(`${this.width}x${this.height}`);
        callback(new Blob(['png'], { type: 'image/png' }));
      });
      vi.mocked(recognizeImage).mockResolvedValue(ocr('Glucose 95 mg/dL read from the scan', 90));
    });

    it('reads a page with text of its own as it is, with no OCR', async () => {
      __setMockConfig({ numPages: 2 });

      const reading = await readPdf(new ArrayBuffer(100));

      expect(reading.pages.map((page) => page.method)).toEqual(['pdf-text', 'pdf-text']);
      expect(reading.text).toContain('Glucose: 95 mg/dL (page 1)');
      expect(reading.text.indexOf('(page 1)')).toBeLessThan(reading.text.indexOf('(page 2)'));
      expect(recognizeImage).not.toHaveBeenCalled();
    });

    it('OCRs a scanned page from an image at about 300 DPI', async () => {
      __setMockConfig({ numPages: 1, isScanned: true });

      const reading = await readPdf(new ArrayBuffer(100), { language: 'ita' });

      // 100 × 150 points at 300/72
      expect(renderedSizes).toEqual(['417x625']);
      expect(recognizeImage).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ language: 'ita' }));
      expect(reading.pages).toEqual([
        { pageNumber: 1, text: 'Glucose 95 mg/dL read from the scan', method: 'ocr', confidence: 90 },
      ]);
    });

    it('renders an oversized page no larger than an A4 page at 300 DPI', async () => {
      __setMockConfig({ numPages: 1, isScanned: true, pageSize: [1400, 4000] });

      await readPdf(new ArrayBuffer(100));

      expect(renderedSizes).toEqual(['1228x3508']);
    });

    it('reads a report of typed and scanned pages whole, each its own way, in page order', async () => {
      __setMockConfig({ numPages: 3, scannedPages: [2] });

      const reading = await readPdf(new ArrayBuffer(100));

      expect(reading.pages.map((page) => page.method)).toEqual(['pdf-text', 'ocr', 'pdf-text']);
      const text = reading.text;
      expect(text.indexOf('(page 1)')).toBeLessThan(text.indexOf('read from the scan'));
      expect(text.indexOf('read from the scan')).toBeLessThan(text.indexOf('(page 3)'));
      expect(recognizeImage).toHaveBeenCalledTimes(1);
    });

    it('reads a page scanned sideways turned, keeping the most confident reading', async () => {
      __setMockConfig({ numPages: 1, isScanned: true });
      vi.mocked(recognizeImage)
        .mockResolvedValueOnce(ocr('q~ ;l 1r ,;', 20))
        .mockResolvedValueOnce(ocr('Glucose 95 mg/dL', 88));

      const reading = await readPdf(new ArrayBuffer(100));

      expect(renderedSizes).toEqual(['417x625', '625x417']);
      expect(reading.pages[0]).toMatchObject({ text: 'Glucose 95 mg/dL', confidence: 88, turned: 90 });
    });

    it('keeps the best of every turn when none reads well', async () => {
      __setMockConfig({ numPages: 1, isScanned: true });
      vi.mocked(recognizeImage)
        .mockResolvedValueOnce(ocr('noise', 30))
        .mockResolvedValueOnce(ocr('more noise', 20))
        .mockResolvedValueOnce(ocr('Glucose 9S mg/dL', 45))
        .mockResolvedValueOnce(ocr('upside down', 10));

      const reading = await readPdf(new ArrayBuffer(100));

      expect(recognizeImage).toHaveBeenCalledTimes(4);
      expect(reading.pages[0]).toMatchObject({ text: 'Glucose 9S mg/dL', confidence: 45, turned: 270 });
    });

    it('does not turn a blank page', async () => {
      __setMockConfig({ numPages: 1, isScanned: true });
      vi.mocked(recognizeImage).mockResolvedValueOnce(ocr('', 0));

      const reading = await readPdf(new ArrayBuffer(100));

      expect(recognizeImage).toHaveBeenCalledTimes(1);
      expect(reading.text).toBe('');
    });

    it('fails when OCR cannot start, rather than leaving pages out', async () => {
      __setMockConfig({ numPages: 2, isScanned: true });
      vi.mocked(recognizeImage).mockRejectedValueOnce(new OCRError('OCR could not load'));

      await expect(readPdf(new ArrayBuffer(100))).rejects.toThrow(OCRError);
    });

    it('notes a page it cannot read and keeps the others', async () => {
      __setMockConfig({ numPages: 3, pageErrors: [2] });

      const reading = await readPdf(new ArrayBuffer(100));

      expect(reading.pages.map((page) => page.pageNumber)).toEqual([1, 3]);
      expect(reading.errors).toEqual(['Error extracting page 2: Error: Page 2 error']);
    });

    it('fails a document it cannot open', async () => {
      __setMockConfig({ throwError: true });

      await expect(readPdf(new ArrayBuffer(100))).rejects.toThrow(PDFExtractionError);
    });

    it('reports progress per page', async () => {
      __setMockConfig({ numPages: 2, scannedPages: [2] });
      const onProgress = vi.fn();

      await readPdf(new ArrayBuffer(100), { onProgress });

      expect(onProgress).toHaveBeenCalledWith('Extracting page 1/2', 0.5);
      expect(onProgress).toHaveBeenCalledWith('Rendering page 2/2', 0.5);
      expect(onProgress).toHaveBeenLastCalledWith('Extracting page 2/2', 1);
    });
  });

  it('destroys the document it opens, so no PDF worker is left running', async () => {
    __openedDocuments.length = 0;
    await readPdf(new ArrayBuffer(8));
    expect(__openedDocuments).toHaveLength(1);
    expect(__openedDocuments[0].destroy).toHaveBeenCalled();
  });
});
