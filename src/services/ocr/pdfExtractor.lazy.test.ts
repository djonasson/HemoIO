import { describe, it, expect, vi } from 'vitest';

// Vitest runs a mock factory when the mocked module is first imported, so
// this flag records whether PDF.js has been loaded
const loaded = vi.hoisted(() => ({ pdfjs: false }));

vi.mock('pdfjs-dist', () => {
  loaded.pdfjs = true;
  return {
    GlobalWorkerOptions: { workerSrc: '' },
    OPS: { paintImageXObject: 85, paintImageMaskXObject: 87 },
    getDocument: () => ({
      promise: Promise.resolve({ numPages: 3, destroy: () => Promise.resolve() }),
    }),
  };
});

describe('PDF.js loading', () => {
  it('loads PDF.js only when a PDF is first read', async () => {
    const { extractTextFromPDF } = await import('./pdfExtractor');
    expect(loaded.pdfjs).toBe(false);

    await expect(extractTextFromPDF(new ArrayBuffer(8))).resolves.toMatchObject({ totalPages: 3 });
    expect(loaded.pdfjs).toBe(true);
  });
});
