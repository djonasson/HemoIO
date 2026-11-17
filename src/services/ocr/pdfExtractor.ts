/**
 * Opening a PDF with PDF.js, and what a page holds: its own text, laid out
 * in its printed lines, and whether it draws an image, as a scan does
 */

import { layoutPageText } from './pdfLayout';
import type * as PdfjsLib from 'pdfjs-dist';

let pdfjsPromise: Promise<typeof PdfjsLib> | null = null;

/**
 * PDF.js is large and only needed to read a PDF, so it loads on first use
 * rather than with the app
 */
function loadPdfjs(): Promise<typeof PdfjsLib> {
  pdfjsPromise ??= import('pdfjs-dist').then(
    (pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
      return pdfjs;
    },
    (error: unknown) => {
      // Let the next PDF try again rather than fail for the rest of the session
      pdfjsPromise = null;
      throw error;
    }
  );
  return pdfjsPromise;
}

type PdfDocument = Awaited<ReturnType<typeof PdfjsLib.getDocument>['promise']>;
/** A page of an open PDF */
export type PdfPage = Awaited<ReturnType<PdfDocument['getPage']>>;

/**
 * Open a PDF for `read`, then destroy it: an open document keeps a PDF.js
 * worker running, one per document
 */
export async function withPdf<T>(
  file: File | ArrayBuffer,
  read: (pdf: PdfDocument, pdfjsLib: typeof PdfjsLib) => Promise<T>
): Promise<T> {
  const pdfjsLib = await loadPdfjs();
  const data = file instanceof File ? await file.arrayBuffer() : file;
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  try {
    return await read(pdf, pdfjsLib);
  } finally {
    await pdf.destroy();
  }
}

/** A page's own text, laid out in its printed lines */
export async function pageText(page: PdfPage): Promise<string> {
  const textContent = await page.getTextContent();
  // Marked-content markers carry no text
  return layoutPageText(textContent.items.filter((item) => 'str' in item));
}

/** Whether a page draws an image, as a scan does */
export async function drawsImages(page: PdfPage, pdfjsLib: typeof PdfjsLib): Promise<boolean> {
  const operators = await page.getOperatorList();
  return operators.fnArray.some(
    (fn) => fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintImageMaskXObject
  );
}

/**
 * Error thrown when PDF extraction fails
 */
export class PDFExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PDFExtractionError';
  }
}
