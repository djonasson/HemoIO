import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractTextFromPDF,
  needsOCR,
  getPageCount,
  extractPageRange,
  renderPdfPages,
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
    getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: 100 * scale, height: 150 * scale })),
    render: vi.fn(() => ({ promise: Promise.resolve() })),
  });

  // Every document a call opens; each must be destroyed, or its worker leaks
  const openedDocuments: Array<{ destroy: ReturnType<typeof vi.fn> }> = [];

  const createMockDocument = () => {
    const doc = {
    destroy: vi.fn().mockResolvedValue(undefined),
    numPages: mockConfig.numPages,
    getPage: vi.fn().mockImplementation((pageNum: number) => {
      if (mockConfig.pageErrors.includes(pageNum)) {
        return Promise.reject(new Error(`Page ${pageNum} error`));
      }
      return Promise.resolve(createMockPage());
    }),
    };
    openedDocuments.push(doc);
    return doc;
  };

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
    __openedDocuments: openedDocuments,
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
const { __setMockConfig, __resetMockConfig, __openedDocuments } = pdfjsLib as unknown as {
  __openedDocuments: Array<{ destroy: ReturnType<typeof vi.fn> }>;
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

  describe('releasing documents', () => {
    it('destroys every document it opens, so no PDF worker is left running', async () => {
      __openedDocuments.length = 0;
      const pdf = new ArrayBuffer(8);
      // jsdom has no canvas implementation
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
        {} as CanvasRenderingContext2D
      );
      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback: BlobCallback) =>
        callback(new Blob(['png'], { type: 'image/png' }))
      );

      await extractTextFromPDF(pdf);
      await getPageCount(pdf);
      await extractPageRange(pdf, 1, 1);
      await renderPdfPages(pdf);

      expect(__openedDocuments).toHaveLength(4);
      for (const doc of __openedDocuments) expect(doc.destroy).toHaveBeenCalled();
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

  describe('renderPdfPages', () => {
    let renderedSizes: string[];

    beforeEach(() => {
      renderedSizes = [];
      // jsdom has no canvas implementation
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
        {} as CanvasRenderingContext2D
      );
      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
        this: HTMLCanvasElement,
        callback: BlobCallback
      ) {
        renderedSizes.push(`${this.width}x${this.height}`);
        callback(new Blob(['png'], { type: 'image/png' }));
      });
    });

    it('renders each page to a PNG image at the requested scale', async () => {
      __setMockConfig({ numPages: 3, isScanned: true });

      const images = await renderPdfPages(new ArrayBuffer(100), { scale: 2 });

      expect(images).toHaveLength(3);
      expect(images[0].type).toBe('image/png');
      expect(renderedSizes).toEqual(['200x300', '200x300', '200x300']);
    });

    it('reports progress per page and honours maxPages', async () => {
      __setMockConfig({ numPages: 5, isScanned: true });
      const onProgress = vi.fn();

      const images = await renderPdfPages(new ArrayBuffer(100), { maxPages: 2, onProgress });

      expect(images).toHaveLength(2);
      expect(onProgress).toHaveBeenLastCalledWith(2, 2);
    });
  });
});
