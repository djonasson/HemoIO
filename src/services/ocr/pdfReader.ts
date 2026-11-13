/**
 * Reading a PDF page by page, each page its own way: its own text when it
 * has some, OCR of its image when it is a scan.
 */
import { canvasToPng, drawsImages, pageText, PDFExtractionError, withPdf, type PdfPage } from './pdfExtractor';
import type * as PdfjsLib from 'pdfjs-dist';
import { OCRError, recognizeImage, type OCRResult } from './tesseractService';

/** Render scale for OCR: about 300 DPI, which Tesseract reads best (a PDF measures in 1/72 inch) */
const OCR_SCALE = 300 / 72;
/** The longest side of a page image for OCR, an A4 page at 300 DPI: an oversized page is not rendered huge */
const MAX_OCR_SIDE = 3508;
/** Letters and digits a page's own text needs to be used as is: fewer, and it is a scan with a stray mark or stamp */
const MIN_PAGE_LETTERS = 50;
/**
 * How well a page read, under which it is read again turned, in case it was scanned sideways or upside down. A page
 * read sideways comes out as letters and marks Tesseract can be fairly sure of (61% on a test scan), but they seldom
 * make words: the score is the confidence times the share of the text in words (see `readingScore`)
 */
const TURN_RETRY_SCORE = 45;
/** The turns tried, sideways first: a page is more often scanned sideways than upside down */
const TURNS = [0, 90, 270, 180] as const;

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

function letterCount(text: string): number {
  return text.replace(/[^\p{L}\p{N}]/gu, '').length;
}

/**
 * How well an OCR reading reads: its confidence times the share of its marks
 * in words, that is runs of two or more letters or digits, or decimals. A
 * report, even one of short names, units and values ("Hb 14 g/dl", "5.4"),
 * is mostly words; a page read the wrong way round is mostly single marks
 * ("Tr oO O = © = 9 Q").
 */
export function readingScore({ text, confidence }: Pick<OCRResult, 'text' | 'confidence'>): number {
  const marks = text.replace(/\s/gu, '').length;
  if (marks === 0) return 0;
  const inWords = (text.match(/\p{N}+[.,]\p{N}+|[\p{L}\p{N}]{2,}/gu) ?? []).join('').length;
  return (confidence * inWords) / marks;
}

/** A page as an image for OCR, turned `turn` degrees clockwise on top of the page's own rotation */
async function renderForOcr(page: PdfPage, turn: number): Promise<Blob> {
  const rotation = ((page.rotate ?? 0) + turn) % 360;
  const natural = page.getViewport({ scale: 1, rotation });
  const scale = Math.min(OCR_SCALE, MAX_OCR_SIDE / Math.max(natural.width, natural.height));
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

/**
 * OCR a page's image. One that reads poorly is read again turned, keeping
 * the best reading: a page scanned sideways reads as noise.
 */
async function ocrPage(
  page: PdfPage,
  pageNumber: number,
  total: number,
  { language, onProgress }: ReadPdfOptions
): Promise<PdfPageReading> {
  let best: { result: OCRResult; turned: number; score: number } | undefined;
  for (const [index, turn] of TURNS.entries()) {
    // Each turn has its share of the page, so progress never goes back for a page read again
    const done = (share: number) => (pageNumber - 1 + (index + share) / TURNS.length) / total;
    onProgress?.(`Rendering page ${pageNumber}/${total}`, done(0));
    const image = await renderForOcr(page, turn);
    const result = await recognizeImage(image, {
      language,
      onProgress: (progress) => onProgress?.(`OCR: ${progress.status} (page ${pageNumber}/${total})`, done(progress.progress)),
    });
    const score = readingScore(result);
    if (!best || score > best.score) best = { result, turned: turn, score };
    // A blank page reads as nothing whichever way it is turned
    if (best.score >= TURN_RETRY_SCORE || letterCount(result.text) === 0) break;
  }
  const { result, turned } = best!;
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
