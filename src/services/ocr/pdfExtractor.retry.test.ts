import { describe, it, expect, vi } from 'vitest';

const attempts = vi.hoisted(() => ({ count: 0 }));

// The first load fails, as when the PDF.js file cannot be fetched
vi.mock('pdfjs-dist', () => {
  attempts.count += 1;
  if (attempts.count === 1) {
    throw new Error('Failed to fetch dynamically imported module');
  }
  return {
    GlobalWorkerOptions: { workerSrc: '' },
    OPS: { paintImageXObject: 85, paintImageMaskXObject: 87 },
    getDocument: () => ({
      promise: Promise.resolve({ numPages: 2, destroy: () => Promise.resolve() }),
    }),
  };
});

describe('PDF.js loading after a failure', () => {
  it('tries again on the next PDF', async () => {
    const { extractTextFromPDF } = await import('./pdfExtractor');

    await expect(extractTextFromPDF(new ArrayBuffer(8))).rejects.toThrow();
    await expect(extractTextFromPDF(new ArrayBuffer(8))).resolves.toMatchObject({ totalPages: 2 });
  });
});
