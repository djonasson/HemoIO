import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PDFExtractionError, withPdf } from './pdfExtractor';

vi.mock('pdfjs-dist', async () => (await import('@/test/mocks/pdfjs')).createPdfjsMock());

// Get mock control functions
import * as pdfjsLib from 'pdfjs-dist';
import type { PdfjsMockControls } from '@/test/mocks/pdfjs';
const { __resetMockConfig, __openedDocuments } = pdfjsLib as unknown as PdfjsMockControls;

describe('PDF opening', () => {
  beforeEach(() => {
    __resetMockConfig();
    vi.clearAllMocks();
  });

  describe('releasing documents', () => {
    it('destroys every document it opens, so no PDF worker is left running', async () => {
      __openedDocuments.length = 0;
      const pdf = new ArrayBuffer(8);

      await withPdf(pdf, async (doc) => doc.numPages);

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
