import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractTextFromPDF,
  PDFExtractionError,
} from './pdfExtractor';

vi.mock('pdfjs-dist', async () => (await import('@/test/mocks/pdfjs')).createPdfjsMock());

// Get mock control functions
import * as pdfjsLib from 'pdfjs-dist';
import type { PdfjsMockControls } from '@/test/mocks/pdfjs';
const { __setMockConfig, __resetMockConfig, __openedDocuments } = pdfjsLib as unknown as PdfjsMockControls;

describe('PDF Text Extractor', () => {
  beforeEach(() => {
    __resetMockConfig();
    vi.clearAllMocks();
  });

  describe('extractTextFromPDF', () => {
    it('extracts text from a single-page PDF', async () => {
      const mockFile = new ArrayBuffer(100);

      const result = await extractTextFromPDF(mockFile);

      expect(result.totalPages).toBe(1);
      expect(result.fullText).toContain('Patient Name');
      expect(result.fullText).toContain('Glucose');
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].hasText).toBe(true);
      expect(result.isScanned).toBe(false);
    });

    it('extracts text from a multi-page PDF', async () => {
      __setMockConfig({ numPages: 5 });
      const mockFile = new ArrayBuffer(100);

      const result = await extractTextFromPDF(mockFile);

      expect(result.totalPages).toBe(5);
      expect(result.pages).toHaveLength(5);
      expect(result.pages.every((p) => p.hasText)).toBe(true);
    });

    it('handles File input', async () => {
      const buffer = new ArrayBuffer(100);
      const mockFile = new File([buffer], 'test.pdf', {
        type: 'application/pdf',
      });
      // Add arrayBuffer method since jsdom may not fully support it
      (mockFile as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = () =>
        Promise.resolve(buffer);

      const result = await extractTextFromPDF(mockFile);

      expect(result.totalPages).toBe(1);
      expect(result.fullText).toContain('Patient Name');
    });

    it('detects scanned PDFs with images and no text', async () => {
      __setMockConfig({ numPages: 3, isScanned: true });
      const mockFile = new ArrayBuffer(100);

      const result = await extractTextFromPDF(mockFile);

      expect(result.isScanned).toBe(true);
      expect(result.textConfidence).toBeLessThan(0.5);
      expect(result.pages.every((p) => p.hasImages)).toBe(true);
      expect(result.pages.every((p) => !p.hasText)).toBe(true);
    });

    it('provides progress callback', async () => {
      __setMockConfig({ numPages: 3 });
      const mockFile = new ArrayBuffer(100);
      const progressCalls: [number, number][] = [];

      await extractTextFromPDF(mockFile, {
        onProgress: (current, total) => {
          progressCalls.push([current, total]);
        },
      });

      expect(progressCalls).toEqual([
        [1, 3],
        [2, 3],
        [3, 3],
      ]);
    });

    it('respects maxPages option', async () => {
      __setMockConfig({ numPages: 10 });
      const mockFile = new ArrayBuffer(100);

      const result = await extractTextFromPDF(mockFile, { maxPages: 3 });

      expect(result.totalPages).toBe(10);
      expect(result.pages).toHaveLength(3);
    });

    it('handles page extraction errors gracefully', async () => {
      __setMockConfig({ numPages: 3, pageErrors: [2] });
      const mockFile = new ArrayBuffer(100);

      const result = await extractTextFromPDF(mockFile);

      expect(result.pages).toHaveLength(3);
      expect(result.pages[0].hasText).toBe(true);
      expect(result.pages[1].text).toBe('');
      expect(result.pages[2].hasText).toBe(true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('page 2');
    });

    it('throws PDFExtractionError on document load failure', async () => {
      __setMockConfig({ throwError: true });
      const mockFile = new ArrayBuffer(100);

      await expect(extractTextFromPDF(mockFile)).rejects.toThrow(PDFExtractionError);
    });

    it('stops early in quick scan mode when result is clear', async () => {
      __setMockConfig({ numPages: 10, isScanned: true });
      const mockFile = new ArrayBuffer(100);
      const progressCalls: number[] = [];

      await extractTextFromPDF(mockFile, {
        quickScan: true,
        onProgress: (current) => progressCalls.push(current),
      });

      // Should stop before processing all 10 pages
      expect(progressCalls.length).toBeLessThanOrEqual(5);
    });
  });

  describe('releasing documents', () => {
    it('destroys every document it opens, so no PDF worker is left running', async () => {
      __openedDocuments.length = 0;
      const pdf = new ArrayBuffer(8);

      await extractTextFromPDF(pdf);

      expect(__openedDocuments).toHaveLength(1);
      for (const doc of __openedDocuments) expect(doc.destroy).toHaveBeenCalled();
    });
  });

  describe('PDFExtractionError', () => {
    it('has correct name property', () => {
      const error = new PDFExtractionError('Test error');

      expect(error.name).toBe('PDFExtractionError');
      expect(error.message).toBe('Test error');
    });
  });
});
