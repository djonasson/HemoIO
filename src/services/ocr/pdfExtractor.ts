/**
 * PDF Text Extraction Service
 *
 * Uses PDF.js to extract text content from PDF documents.
 * Handles both text-based PDFs and detects scanned PDFs that need OCR.
 */

import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

/**
 * Result of extracting text from a single page
 */
export interface PageExtractionResult {
  pageNumber: number;
  text: string;
  hasText: boolean;
  hasImages: boolean;
}

/**
 * Result of extracting text from an entire PDF
 */
export interface PDFExtractionResult {
  /** Total number of pages in the PDF */
  totalPages: number;
  /** Extracted text from all pages combined */
  fullText: string;
  /** Per-page extraction results */
  pages: PageExtractionResult[];
  /** Whether the PDF appears to be scanned (mostly images, little text) */
  isScanned: boolean;
  /** Confidence that this is a text-based PDF (0-1) */
  textConfidence: number;
  /** Any errors encountered during extraction */
  errors: string[];
}

/**
 * Options for PDF extraction
 */
export interface PDFExtractionOptions {
  /** Callback for progress updates */
  onProgress?: (current: number, total: number) => void;
  /** Whether to stop after determining if PDF is scanned */
  quickScan?: boolean;
  /** Maximum pages to process (for quick scan) */
  maxPages?: number;
}

/**
 * Minimum text characters per page to consider it a text PDF
 */
const MIN_TEXT_CHARS_PER_PAGE = 50;

/**
 * Threshold for determining if PDF is scanned
 * If less than this ratio of pages have sufficient text, it's likely scanned
 */
const TEXT_PAGE_RATIO_THRESHOLD = 0.5;

/**
 * Extract text content from a PDF file
 *
 * @param file - PDF file or ArrayBuffer to extract text from
 * @param options - Extraction options
 * @returns Extraction result with text and metadata
 */
export async function extractTextFromPDF(
  file: File | ArrayBuffer,
  options: PDFExtractionOptions = {}
): Promise<PDFExtractionResult> {
  const { onProgress, quickScan = false, maxPages } = options;
  const errors: string[] = [];

  try {
    // Load the PDF document
    const arrayBuffer = file instanceof File ? await file.arrayBuffer() : file;
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    const totalPages = pdf.numPages;
    const pagesToProcess = maxPages ? Math.min(maxPages, totalPages) : totalPages;
    const pages: PageExtractionResult[] = [];

    // Extract text from each page
    for (let pageNum = 1; pageNum <= pagesToProcess; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();

        // Combine text items, preserving some structure
        const textItems = textContent.items
          .filter((item) => 'str' in item && typeof item.str === 'string')
          .map((item) => (item as { str: string }).str);

        const pageText = textItems.join(' ').trim();

        // Check for images (operators that draw images)
        const operators = await page.getOperatorList();
        const hasImages = operators.fnArray.some(
          (fn) =>
            fn === pdfjsLib.OPS.paintImageXObject ||
            fn === pdfjsLib.OPS.paintImageMaskXObject
        );

        pages.push({
          pageNumber: pageNum,
          text: pageText,
          hasText: pageText.length >= MIN_TEXT_CHARS_PER_PAGE,
          hasImages,
        });

        if (onProgress) {
          onProgress(pageNum, totalPages);
        }

        // For quick scan, stop early if we have enough info
        if (quickScan && pageNum >= 3) {
          const pagesWithText = pages.filter((p) => p.hasText).length;
          const ratio = pagesWithText / pages.length;
          // If clearly text or clearly scanned, stop early
          if (ratio > 0.8 || ratio < 0.2) {
            break;
          }
        }
      } catch (pageError) {
        errors.push(`Error extracting page ${pageNum}: ${String(pageError)}`);
        pages.push({
          pageNumber: pageNum,
          text: '',
          hasText: false,
          hasImages: false,
        });
      }
    }

    // Combine all page text
    const fullText = pages.map((p) => p.text).join('\n\n');

    // Determine if PDF is scanned
    const pagesWithText = pages.filter((p) => p.hasText).length;
    const pagesWithImages = pages.filter((p) => p.hasImages).length;
    const textPageRatio = pages.length > 0 ? pagesWithText / pages.length : 0;

    // PDF is likely scanned if:
    // - Most pages have images but little text
    // - Or if total extracted text is very short relative to page count
    const isScanned =
      textPageRatio < TEXT_PAGE_RATIO_THRESHOLD &&
      pagesWithImages > 0 &&
      fullText.length < totalPages * MIN_TEXT_CHARS_PER_PAGE;

    // Calculate text confidence
    const textConfidence = Math.min(1, textPageRatio + (fullText.length > 500 ? 0.2 : 0));

    return {
      totalPages,
      fullText,
      pages,
      isScanned,
      textConfidence,
      errors,
    };
  } catch (error) {
    throw new PDFExtractionError(
      `Failed to extract text from PDF: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Quick check to determine if a PDF needs OCR
 *
 * @param file - PDF file to check
 * @returns true if the PDF likely needs OCR processing
 */
export async function needsOCR(file: File | ArrayBuffer): Promise<boolean> {
  const result = await extractTextFromPDF(file, {
    quickScan: true,
    maxPages: 5,
  });
  return result.isScanned;
}

/**
 * Get page count from a PDF without full extraction
 *
 * @param file - PDF file to check
 * @returns Number of pages in the PDF
 */
export async function getPageCount(file: File | ArrayBuffer): Promise<number> {
  const arrayBuffer = file instanceof File ? await file.arrayBuffer() : file;
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  return pdf.numPages;
}

/**
 * Extract text from a specific page range
 *
 * @param file - PDF file to extract from
 * @param startPage - First page (1-indexed)
 * @param endPage - Last page (1-indexed)
 * @param onProgress - Optional progress callback
 * @returns Extraction result for the specified pages
 */
export async function extractPageRange(
  file: File | ArrayBuffer,
  startPage: number,
  endPage: number,
  onProgress?: (current: number, total: number) => void
): Promise<PDFExtractionResult> {
  const arrayBuffer = file instanceof File ? await file.arrayBuffer() : file;
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const totalPages = pdf.numPages;
  const actualStart = Math.max(1, startPage);
  const actualEnd = Math.min(totalPages, endPage);
  const pages: PageExtractionResult[] = [];
  const errors: string[] = [];

  for (let pageNum = actualStart; pageNum <= actualEnd; pageNum++) {
    try {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      const textItems = textContent.items
        .filter((item) => 'str' in item && typeof item.str === 'string')
        .map((item) => (item as { str: string }).str);

      const pageText = textItems.join(' ').trim();

      const operators = await page.getOperatorList();
      const hasImages = operators.fnArray.some(
        (fn) =>
          fn === pdfjsLib.OPS.paintImageXObject ||
          fn === pdfjsLib.OPS.paintImageMaskXObject
      );

      pages.push({
        pageNumber: pageNum,
        text: pageText,
        hasText: pageText.length >= MIN_TEXT_CHARS_PER_PAGE,
        hasImages,
      });

      if (onProgress) {
        onProgress(pageNum - actualStart + 1, actualEnd - actualStart + 1);
      }
    } catch (pageError) {
      errors.push(`Error extracting page ${pageNum}: ${String(pageError)}`);
      pages.push({
        pageNumber: pageNum,
        text: '',
        hasText: false,
        hasImages: false,
      });
    }
  }

  const fullText = pages.map((p) => p.text).join('\n\n');
  const pagesWithText = pages.filter((p) => p.hasText).length;
  const pagesWithImages = pages.filter((p) => p.hasImages).length;
  const textPageRatio = pages.length > 0 ? pagesWithText / pages.length : 0;

  const isScanned =
    textPageRatio < TEXT_PAGE_RATIO_THRESHOLD &&
    pagesWithImages > 0 &&
    fullText.length < pages.length * MIN_TEXT_CHARS_PER_PAGE;

  const textConfidence = Math.min(1, textPageRatio + (fullText.length > 500 ? 0.2 : 0));

  return {
    totalPages,
    fullText,
    pages,
    isScanned,
    textConfidence,
    errors,
  };
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
