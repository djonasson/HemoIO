import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectDocumentType,
  isSupportedDocument,
  getSupportedExtensions,
  getAcceptString,
  DocumentDetectionError,
  SUPPORTED_MIME_TYPES,
} from './documentDetector';

// Mock the PDF extractor
vi.mock('./pdfExtractor', () => {
  let mockConfig = {
    isScanned: false,
    textConfidence: 0.9,
    totalPages: 1,
    fullText: 'Sample extracted text from PDF',
    throwError: false,
  };

  return {
    extractTextFromPDF: vi.fn().mockImplementation(() => {
      if (mockConfig.throwError) {
        return Promise.reject(new Error('PDF parsing failed'));
      }
      return Promise.resolve({
        isScanned: mockConfig.isScanned,
        textConfidence: mockConfig.textConfidence,
        totalPages: mockConfig.totalPages,
        fullText: mockConfig.fullText,
        pages: [],
        errors: [],
      });
    }),
    __setMockConfig: (config: Partial<typeof mockConfig>) => {
      mockConfig = { ...mockConfig, ...config };
    },
    __resetMockConfig: () => {
      mockConfig = {
        isScanned: false,
        textConfidence: 0.9,
        totalPages: 1,
        fullText: 'Sample extracted text from PDF',
        throwError: false,
      };
    },
  };
});

// Get mock control
import * as pdfExtractor from './pdfExtractor';
const { __setMockConfig, __resetMockConfig } = pdfExtractor as unknown as {
  __setMockConfig: (config: { isScanned?: boolean; textConfidence?: number; totalPages?: number; fullText?: string; throwError?: boolean }) => void;
  __resetMockConfig: () => void;
};

// Helper to create mock files
function createMockFile(
  name: string,
  type: string,
  size: number = 1024
): File {
  const content = new ArrayBuffer(size);
  const file = new File([content], name, { type });
  // Mock arrayBuffer for PDF processing
  (file as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = () =>
    Promise.resolve(content);
  return file;
}

describe('Document Detector', () => {
  beforeEach(() => {
    __resetMockConfig();
    vi.clearAllMocks();
  });

  describe('detectDocumentType', () => {
    describe('Image Detection', () => {
      it('detects JPEG images', async () => {
        const file = createMockFile('test.jpg', 'image/jpeg');

        const result = await detectDocumentType(file);

        expect(result.type).toBe('image');
        expect(result.mimeType).toBe('image/jpeg');
        expect(result.needsOCR).toBe(true);
        expect(result.confidence).toBe(1.0);
      });

      it('detects PNG images', async () => {
        const file = createMockFile('test.png', 'image/png');

        const result = await detectDocumentType(file);

        expect(result.type).toBe('image');
        expect(result.mimeType).toBe('image/png');
        expect(result.needsOCR).toBe(true);
      });

      it('detects WebP images', async () => {
        const file = createMockFile('test.webp', 'image/webp');

        const result = await detectDocumentType(file);

        expect(result.type).toBe('image');
        expect(result.mimeType).toBe('image/webp');
      });

      it('falls back to extension when MIME type is generic', async () => {
        const file = createMockFile('test.jpg', 'application/octet-stream');

        const result = await detectDocumentType(file);

        expect(result.type).toBe('image');
        expect(result.mimeType).toBe('image/jpeg');
      });
    });

    describe('Text PDF Detection', () => {
      it('detects text-based PDF', async () => {
        __setMockConfig({
          isScanned: false,
          textConfidence: 0.95,
          totalPages: 3,
          fullText: 'Patient lab report with extracted text content',
        });
        const file = createMockFile('report.pdf', 'application/pdf');

        const result = await detectDocumentType(file);

        expect(result.type).toBe('text-pdf');
        expect(result.needsOCR).toBe(false);
        expect(result.pageCount).toBe(3);
        expect(result.previewText).toContain('Patient lab report');
      });

      it('includes text confidence for PDFs', async () => {
        __setMockConfig({ textConfidence: 0.85 });
        const file = createMockFile('report.pdf', 'application/pdf');

        const result = await detectDocumentType(file);

        expect(result.confidence).toBe(0.85);
        expect(result.metadata.textConfidence).toBe(0.85);
      });
    });

    describe('Scanned PDF Detection', () => {
      it('detects scanned PDF', async () => {
        __setMockConfig({
          isScanned: true,
          textConfidence: 0.1,
          totalPages: 2,
          fullText: '',
        });
        const file = createMockFile('scanned.pdf', 'application/pdf');

        const result = await detectDocumentType(file);

        expect(result.type).toBe('scanned-pdf');
        expect(result.needsOCR).toBe(true);
        expect(result.pageCount).toBe(2);
      });

      it('handles PDF parsing errors', async () => {
        __setMockConfig({ throwError: true });
        const file = createMockFile('corrupt.pdf', 'application/pdf');

        const result = await detectDocumentType(file);

        expect(result.type).toBe('scanned-pdf');
        expect(result.needsOCR).toBe(true);
        expect(result.metadata.isValid).toBe(false);
        expect(result.metadata.validationError).toContain('Failed to parse PDF');
      });
    });

    describe('File Validation', () => {
      it('rejects empty files', async () => {
        const file = createMockFile('empty.pdf', 'application/pdf', 0);

        const result = await detectDocumentType(file);

        expect(result.metadata.isValid).toBe(false);
        expect(result.metadata.validationError).toContain('empty');
      });

      it('rejects files exceeding size limit', async () => {
        const largeSize = 100 * 1024 * 1024; // 100MB
        const file = createMockFile('large.pdf', 'application/pdf', largeSize);

        const result = await detectDocumentType(file);

        expect(result.metadata.isValid).toBe(false);
        expect(result.metadata.validationError).toContain('too large');
      });

      it('rejects unsupported file types', async () => {
        const file = createMockFile('test.exe', 'application/x-msdownload');

        const result = await detectDocumentType(file);

        expect(result.metadata.isValid).toBe(false);
        expect(result.metadata.validationError).toContain('Unsupported');
      });
    });

    describe('Options', () => {
      it('respects quickScan option', async () => {
        const file = createMockFile('report.pdf', 'application/pdf');

        await detectDocumentType(file, { quickScan: false });

        expect(pdfExtractor.extractTextFromPDF).toHaveBeenCalledWith(
          file,
          expect.objectContaining({ quickScan: false })
        );
      });

      it('respects maxPagesToScan option', async () => {
        const file = createMockFile('report.pdf', 'application/pdf');

        await detectDocumentType(file, { maxPagesToScan: 10 });

        expect(pdfExtractor.extractTextFromPDF).toHaveBeenCalledWith(
          file,
          expect.objectContaining({ maxPages: 10 })
        );
      });
    });
  });

  describe('isSupportedDocument', () => {
    it('returns true for PDFs', () => {
      const file = createMockFile('test.pdf', 'application/pdf');
      expect(isSupportedDocument(file)).toBe(true);
    });

    it('returns true for JPEG images', () => {
      const file = createMockFile('test.jpg', 'image/jpeg');
      expect(isSupportedDocument(file)).toBe(true);
    });

    it('returns true for PNG images', () => {
      const file = createMockFile('test.png', 'image/png');
      expect(isSupportedDocument(file)).toBe(true);
    });

    it('returns false for unsupported types', () => {
      const file = createMockFile('test.exe', 'application/x-msdownload');
      expect(isSupportedDocument(file)).toBe(false);
    });

    it('uses extension fallback for octet-stream', () => {
      const file = createMockFile('test.pdf', 'application/octet-stream');
      expect(isSupportedDocument(file)).toBe(true);
    });
  });

  describe('getSupportedExtensions', () => {
    it('returns array of supported extensions', () => {
      const extensions = getSupportedExtensions();

      expect(extensions).toContain('.pdf');
      expect(extensions).toContain('.jpg');
      expect(extensions).toContain('.jpeg');
      expect(extensions).toContain('.png');
      expect(extensions).toContain('.webp');
    });

    it('all extensions start with a dot', () => {
      const extensions = getSupportedExtensions();

      extensions.forEach((ext) => {
        expect(ext.startsWith('.')).toBe(true);
      });
    });
  });

  describe('getAcceptString', () => {
    it('returns valid accept attribute string', () => {
      const accept = getAcceptString();

      expect(accept).toContain('application/pdf');
      expect(accept).toContain('image/jpeg');
      expect(accept).toContain('image/png');
    });

    it('uses comma separation', () => {
      const accept = getAcceptString();

      // Should contain commas but no spaces after commas
      expect(accept.split(',').length).toBeGreaterThan(1);
    });
  });

  describe('SUPPORTED_MIME_TYPES', () => {
    it('exports correct MIME types', () => {
      expect(SUPPORTED_MIME_TYPES.pdf).toBe('application/pdf');
      expect(SUPPORTED_MIME_TYPES.jpeg).toBe('image/jpeg');
      expect(SUPPORTED_MIME_TYPES.png).toBe('image/png');
      expect(SUPPORTED_MIME_TYPES.webp).toBe('image/webp');
    });
  });

  describe('DocumentDetectionError', () => {
    it('has correct name property', () => {
      const error = new DocumentDetectionError('Test error');

      expect(error.name).toBe('DocumentDetectionError');
      expect(error.message).toBe('Test error');
    });
  });
});
