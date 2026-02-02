import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractTextFromPDF,
  needsOCR,
  getPageCount,
  extractPageRange,
  PDFExtractionError,
} from './pdfExtractor';

// Mock PDF.js
vi.mock('pdfjs-dist', () => {
  const mockTextContent = {
    items: [
      { str: 'Patient Name: John Doe' },
      { str: 'Lab Report' },
      { str: 'Glucose: 95 mg/dL' },
      { str: 'Reference Range: 70-100 mg/dL' },
      { str: 'Hemoglobin: 14.5 g/dL' },
      { str: 'Reference Range: 12-17 g/dL' },
    ],
  };

  const mockEmptyTextContent = {
    items: [],
  };

  const mockOperatorList = {
    fnArray: [],
  };

  const mockOperatorListWithImages = {
    fnArray: [85], // OPS.paintImageXObject
  };

  // Store mock configuration
  let mockConfig = {
    numPages: 1,
    isScanned: false,
    throwError: false,
    pageErrors: [] as number[],
  };

  const createMockPage = () => ({
    getTextContent: vi.fn().mockResolvedValue(
      mockConfig.isScanned ? mockEmptyTextContent : mockTextContent
    ),
    getOperatorList: vi.fn().mockResolvedValue(
      mockConfig.isScanned ? mockOperatorListWithImages : mockOperatorList
    ),
  });

  const createMockDocument = () => ({
    numPages: mockConfig.numPages,
    getPage: vi.fn().mockImplementation((pageNum: number) => {
      if (mockConfig.pageErrors.includes(pageNum)) {
        return Promise.reject(new Error(`Page ${pageNum} error`));
      }
      return Promise.resolve(createMockPage());
    }),
  });

  return {
    GlobalWorkerOptions: { workerSrc: '' },
    OPS: {
      paintImageXObject: 85,
      paintJpegXObject: 86,
      paintImageMaskXObject: 87,
    },
    getDocument: vi.fn().mockImplementation(() => {
      if (mockConfig.throwError) {
        return {
          promise: Promise.reject(new Error('PDF load error')),
        };
      }
      return {
        promise: Promise.resolve(createMockDocument()),
      };
    }),
    // Expose mock control
    __setMockConfig: (config: Partial<typeof mockConfig>) => {
      mockConfig = { ...mockConfig, ...config };
    },
    __resetMockConfig: () => {
      mockConfig = {
        numPages: 1,
        isScanned: false,
        throwError: false,
        pageErrors: [],
      };
    },
  };
});

// Get mock control functions
import * as pdfjsLib from 'pdfjs-dist';
const { __setMockConfig, __resetMockConfig } = pdfjsLib as unknown as {
  __setMockConfig: (config: { numPages?: number; isScanned?: boolean; throwError?: boolean; pageErrors?: number[] }) => void;
  __resetMockConfig: () => void;
};

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

  describe('needsOCR', () => {
    it('returns false for text-based PDF', async () => {
      const mockFile = new ArrayBuffer(100);

      const result = await needsOCR(mockFile);

      expect(result).toBe(false);
    });

    it('returns true for scanned PDF', async () => {
      __setMockConfig({ numPages: 3, isScanned: true });
      const mockFile = new ArrayBuffer(100);

      const result = await needsOCR(mockFile);

      expect(result).toBe(true);
    });
  });

  describe('getPageCount', () => {
    it('returns page count without full extraction', async () => {
      __setMockConfig({ numPages: 15 });
      const mockFile = new ArrayBuffer(100);

      const count = await getPageCount(mockFile);

      expect(count).toBe(15);
    });

    it('handles File input', async () => {
      __setMockConfig({ numPages: 5 });
      const buffer = new ArrayBuffer(100);
      const mockFile = new File([buffer], 'test.pdf');
      // Add arrayBuffer method since jsdom may not fully support it
      (mockFile as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = () =>
        Promise.resolve(buffer);

      const count = await getPageCount(mockFile);

      expect(count).toBe(5);
    });
  });

  describe('extractPageRange', () => {
    it('extracts text from specified page range', async () => {
      __setMockConfig({ numPages: 10 });
      const mockFile = new ArrayBuffer(100);

      const result = await extractPageRange(mockFile, 3, 5);

      expect(result.totalPages).toBe(10);
      expect(result.pages).toHaveLength(3);
      expect(result.pages[0].pageNumber).toBe(3);
      expect(result.pages[2].pageNumber).toBe(5);
    });

    it('clamps page range to document bounds', async () => {
      __setMockConfig({ numPages: 5 });
      const mockFile = new ArrayBuffer(100);

      const result = await extractPageRange(mockFile, 0, 10);

      expect(result.pages).toHaveLength(5);
      expect(result.pages[0].pageNumber).toBe(1);
      expect(result.pages[4].pageNumber).toBe(5);
    });

    it('provides progress callback for page range', async () => {
      __setMockConfig({ numPages: 10 });
      const mockFile = new ArrayBuffer(100);
      const progressCalls: [number, number][] = [];

      await extractPageRange(mockFile, 3, 5, (current, total) => {
        progressCalls.push([current, total]);
      });

      expect(progressCalls).toEqual([
        [1, 3],
        [2, 3],
        [3, 3],
      ]);
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
