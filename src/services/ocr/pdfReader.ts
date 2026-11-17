/**
 * Reading a PDF page by page, each page its own way: its own text when it
 * has some, OCR of its image when it is a scan.
 */
import { drawsImages, pageText, PDFExtractionError, withPdf, type PdfPage } from './pdfExtractor';
import type * as PdfjsLib from 'pdfjs-dist';
import { OCRError } from './tesseractService';
import { letterCount, MIN_PAGE_LETTERS } from './letters';
import { canvasToPng, MAX_OCR_SIDE, readTurned } from './turnedReading';

/** Render scale for OCR: about 300 DPI, which Tesseract reads best (a PDF measures in 1/72 inch) */
const OCR_SCALE = 300 / 72;

/** How one page of a PDF was read */
export interface PdfPageReading {
  pageNumber: number;
  text: string;
  /** Its own text, or OCR of its image */
  method: 'pdf-text' | 'ocr';
  /** OCR confidence (0-100) */
  confidence?: number;
  /** Degrees clockwise the page image was turned to be read */
  turned?: number;
}

/** A PDF read page by page */
export interface PdfReading {
  /** Every page's text, pages apart by a blank line */
  text: string;
  pages: PdfPageReading[];
  /** Pages that could not be read */
  errors: string[];
}

export interface ReadPdfOptions {
  /** OCR language(s) */
  language?: string | string[];
  /** What is being done, and the share of the document done (0-1) */
  onProgress?: (message: string, done: number) => void;
}

/**
 * A page as an image for OCR, turned `turn` degrees clockwise on top of the
 * page's own rotation, at `share` of the size OCR reads best
 */
async function renderForOcr(page: PdfPage, turn: number, share: number): Promise<Blob> {
  const rotation = ((page.rotate ?? 0) + turn) % 360;
  const natural = page.getViewport({ scale: 1, rotation });
  const scale = Math.min(OCR_SCALE, MAX_OCR_SIDE / Math.max(natural.width, natural.height)) * share;
  const viewport = page.getViewport({ scale, rotation });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  try {
    await page.render({ canvas, viewport }).promise;
    return await canvasToPng(canvas);
  } finally {
    // A page at 300 DPI is tens of megabytes of pixels: let them go before the next
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** OCR a page's image, read turned when it reads poorly, as a page scanned sideways does */
async function ocrPage(
  page: PdfPage,
  pageNumber: number,
  total: number,
  { language, onProgress }: ReadPdfOptions
): Promise<PdfPageReading> {
  const done = (share: number) => (pageNumber - 1 + share) / total;
  const { result, turned } = await readTurned((turn, share) => renderForOcr(page, turn, share), {
    language,
    onRendering: (share) => onProgress?.(`Rendering page ${pageNumber}/${total}`, done(share)),
    onOcr: (status, share) => onProgress?.(`OCR: ${status} (page ${pageNumber}/${total})`, done(share)),
  });
  return { pageNumber, text: result.text.trim(), method: 'ocr', confidence: result.confidence, ...(turned && { turned }) };
}

/**
 * A page's own text when it has some. A page with little or none that draws
 * an image is a scan, read by OCR, unless OCR finds no more than its own few
 * words; one that draws no image (a blank or signature page) is not OCR'd.
 */
async function readOnePage(
  page: PdfPage,
  pdfjsLib: typeof PdfjsLib,
  pageNumber: number,
  total: number,
  options: ReadPdfOptions
): Promise<PdfPageReading> {
  const own: PdfPageReading = { pageNumber, text: await pageText(page), method: 'pdf-text' };
  const ownLetters = letterCount(own.text);
  if (ownLetters >= MIN_PAGE_LETTERS || !(await drawsImages(page, pdfjsLib))) return own;
  try {
    const read = await ocrPage(page, pageNumber, total, options);
    return letterCount(read.text) > ownLetters ? read : own;
  } catch (error) {
    // A page image that cannot be drawn keeps the page's own words
    if (error instanceof OCRError || ownLetters === 0) throw error;
    return own;
  }
}

/**
 * Read a PDF page by page: a page with text of its own is read as it is,
 * laid out in its printed lines; a page that is a scan is rendered at about
 * 300 DPI and OCR'd, so a report of typed and scanned pages is read whole.
 * A page that cannot be read is noted and left out; OCR that cannot start
 * fails the whole reading.
 */
export async function readPdf(file: File | ArrayBuffer, options: ReadPdfOptions = {}): Promise<PdfReading> {
  const { onProgress } = options;
  try {
    return await withPdf(file, async (pdf, pdfjsLib) => {
      const total = pdf.numPages;
      const pages: PdfPageReading[] = [];
      const errors: string[] = [];
      for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
        try {
          const page = await pdf.getPage(pageNumber);
          try {
            pages.push(await readOnePage(page, pdfjsLib, pageNumber, total, options));
          } finally {
            // Frees the page's decoded images: a long scan would otherwise hold every page at 300 DPI
            page.cleanup();
          }
          onProgress?.(`Extracting page ${pageNumber}/${total}`, pageNumber / total);
        } catch (pageError) {
          if (pageError instanceof OCRError) throw pageError;
          errors.push(`Error extracting page ${pageNumber}: ${String(pageError)}`);
        }
      }
      const text = pages
        .map((page) => page.text)
        .filter(Boolean)
        .join('\n\n');
      return { text, pages, errors };
    });
  } catch (error) {
    if (error instanceof OCRError) throw error;
    throw new PDFExtractionError(
      `Failed to extract text from PDF: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
