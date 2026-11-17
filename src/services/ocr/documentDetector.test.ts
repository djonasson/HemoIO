import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectDocumentType,
  isSupportedDocument,
  SUPPORTED_MIME_TYPES,
} from './documentDetector';

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
    vi.clearAllMocks();
  });

  describe('detectDocumentType', () => {
    describe('Image Detection', () => {
      it('detects JPEG images', async () => {
        const file = createMockFile('test.jpg', 'image/jpeg');

        const result = await detectDocumentType(file);

        expect(result.type).toBe('image');
        expect(result.mimeType).toBe('image/jpeg');
      });

      it('detects PNG images', async () => {
        const file = createMockFile('test.png', 'image/png');

        const result = await detectDocumentType(file);

        expect(result.type).toBe('image');
        expect(result.mimeType).toBe('image/png');
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

    describe('PDF Detection', () => {
      it('tells a PDF without opening it: reading it decides how each page is read', async () => {
        const file = createMockFile('report.pdf', 'application/pdf');
        const arrayBuffer = vi.spyOn(file, 'arrayBuffer');

        const result = await detectDocumentType(file);

        expect(result).toEqual({
          type: 'pdf',
          mimeType: 'application/pdf',
          fileName: 'report.pdf',
          fileSize: 1024,
          metadata: { isValid: true },
        });
        expect(arrayBuffer).not.toHaveBeenCalled();
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

  describe('SUPPORTED_MIME_TYPES', () => {
    it('exports correct MIME types', () => {
      expect(SUPPORTED_MIME_TYPES.pdf).toBe('application/pdf');
      expect(SUPPORTED_MIME_TYPES.jpeg).toBe('image/jpeg');
      expect(SUPPORTED_MIME_TYPES.png).toBe('image/png');
      expect(SUPPORTED_MIME_TYPES.webp).toBe('image/webp');
    });
  });
});
