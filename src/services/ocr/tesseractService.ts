/**
 * Tesseract.js OCR Service
 *
 * Provides OCR (Optical Character Recognition) capabilities for images
 * and scanned PDFs using Tesseract.js.
 */

import Tesseract, { createWorker } from 'tesseract.js';
import type { Worker, RecognizeResult } from 'tesseract.js';

/**
 * Result of OCR processing for a single image
 */
export interface OCRResult {
  /** Extracted text content */
  text: string;
  /** Confidence score (0-100) */
  confidence: number;
  /** Whether the image was rotated for better recognition */
  wasRotated: boolean;
  /** Detected rotation angle in degrees */
  rotationAngle: number;
  /** Processing time in milliseconds */
  processingTime: number;
  /** Word-level results with positions and confidence */
  words: OCRWord[];
}

/**
 * Individual word recognized by OCR
 */
export interface OCRWord {
  /** The recognized text */
  text: string;
  /** Confidence score for this word (0-100) */
  confidence: number;
  /** Bounding box coordinates */
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

/**
 * Options for OCR processing
 */
export interface OCROptions {
  /** Language(s) to use for recognition */
  language?: string | string[];
  /** Callback for progress updates */
  onProgress?: (progress: OCRProgress) => void;
  /** Whether to attempt rotation correction */
  autoRotate?: boolean;
  /** PSM (Page Segmentation Mode) - affects how Tesseract analyzes the image */
  pageSegmentationMode?: PageSegmentationMode;
}

/**
 * Progress update during OCR processing
 */
export interface OCRProgress {
  /** Current processing stage */
  status: string;
  /** Progress percentage (0-1) */
  progress: number;
}

/**
 * Page Segmentation Modes
 * @see https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html#page-segmentation-method
 */
export const PageSegmentationMode = {
  /** Automatic page segmentation with OSD */
  AUTO_OSD: 0,
  /** Automatic page segmentation with OSD (no OCR) */
  AUTO_OSD_ONLY: 1,
  /** Automatic page segmentation (no OSD or OCR) */
  AUTO_ONLY: 2,
  /** Fully automatic page segmentation (default) */
  AUTO: 3,
  /** Single column of text */
  SINGLE_COLUMN: 4,
  /** Single uniform block of vertically aligned text */
  SINGLE_BLOCK_VERT: 5,
  /** Single uniform block of text */
  SINGLE_BLOCK: 6,
  /** Single text line */
  SINGLE_LINE: 7,
  /** Single word */
  SINGLE_WORD: 8,
  /** Single word in a circle */
  CIRCLE_WORD: 9,
  /** Single character */
  SINGLE_CHAR: 10,
  /** Sparse text (find as much text as possible) */
  SPARSE_TEXT: 11,
  /** Sparse text with OSD */
  SPARSE_TEXT_OSD: 12,
  /** Raw line (treat image as single text line) */
  RAW_LINE: 13,
} as const;

export type PageSegmentationMode = (typeof PageSegmentationMode)[keyof typeof PageSegmentationMode];

/**
 * Singleton worker instance for reuse
 */
let workerInstance: Worker | null = null;
let workerLanguage: string = '';

/**
 * Get or create a Tesseract worker
 *
 * @param language - Language(s) to use
 * @returns Tesseract worker instance
 */
async function getWorker(language: string = 'eng'): Promise<Worker> {
  if (workerInstance && workerLanguage === language) {
    return workerInstance;
  }

  // Terminate existing worker if language changed
  if (workerInstance) {
    await workerInstance.terminate();
  }

  workerInstance = await createWorker(language, undefined, {
    logger: () => {},
  });
  workerLanguage = language;

  return workerInstance;
}

/**
 * Perform OCR on an image
 *
 * @param image - Image to process (File, Blob, URL, or data URL)
 * @param options - OCR options
 * @returns OCR result with extracted text
 */
export async function recognizeImage(
  image: File | Blob | string,
  options: OCROptions = {}
): Promise<OCRResult> {
  const startTime = performance.now();
  const {
    language = 'eng',
    onProgress,
    autoRotate = true,
    pageSegmentationMode = PageSegmentationMode.AUTO,
  } = options;

  // Convert language array to string if needed
  const langString = Array.isArray(language) ? language.join('+') : language;

  const worker = await getWorker(langString);

  // Set parameters
  await worker.setParameters({
    tessedit_pageseg_mode: pageSegmentationMode as unknown as Tesseract.PSM,
  });

  // Create a custom progress handler
  const progressHandler = onProgress
    ? (progress: Tesseract.LoggerMessage) => {
        if (progress.status) {
          onProgress({
            status: progress.status,
            progress: progress.progress || 0,
          });
        }
      }
    : undefined;

  // If progress handler provided, we need to use a fresh worker with logger
  let result: RecognizeResult;
  if (progressHandler) {
    const tempWorker = await createWorker(langString, undefined, {
      logger: progressHandler,
    });
    await tempWorker.setParameters({
      tessedit_pageseg_mode: pageSegmentationMode as unknown as Tesseract.PSM,
    });
    result = await tempWorker.recognize(image);
    await tempWorker.terminate();
  } else {
    result = await worker.recognize(image);
  }

  const processingTime = performance.now() - startTime;

  // Extract word-level data (access via any since tesseract.js types are incomplete)
  const resultData = result.data as {
    text: string;
    confidence: number;
    words?: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
    osd?: { rotate?: number };
  };

  const words: OCRWord[] = (resultData.words || []).map((word) => ({
    text: word.text,
    confidence: word.confidence,
    bbox: word.bbox,
  }));

  // Detect rotation (Tesseract provides this in data)
  const rotationAngle = resultData.osd?.rotate || 0;
  const wasRotated = autoRotate && Math.abs(rotationAngle) > 5;

  return {
    text: resultData.text,
    confidence: resultData.confidence,
    wasRotated,
    rotationAngle,
    processingTime,
    words,
  };
}

/**
 * Perform OCR on multiple images in batch
 *
 * @param images - Array of images to process
 * @param options - OCR options
 * @returns Array of OCR results
 */
export async function recognizeImages(
  images: Array<File | Blob | string>,
  options: OCROptions & {
    onImageProgress?: (index: number, total: number, result?: OCRResult) => void;
  } = {}
): Promise<OCRResult[]> {
  const { onImageProgress, ...ocrOptions } = options;
  const results: OCRResult[] = [];

  for (let i = 0; i < images.length; i++) {
    const result = await recognizeImage(images[i], ocrOptions);
    results.push(result);

    if (onImageProgress) {
      onImageProgress(i + 1, images.length, result);
    }
  }

  return results;
}

/**
 * Extract text from a data URL image
 *
 * @param dataUrl - Data URL of the image
 * @param options - OCR options
 * @returns OCR result
 */
export async function recognizeDataUrl(
  dataUrl: string,
  options: OCROptions = {}
): Promise<OCRResult> {
  return recognizeImage(dataUrl, options);
}

/**
 * Check if Tesseract worker is ready
 *
 * @returns true if worker is initialized
 */
export function isWorkerReady(): boolean {
  return workerInstance !== null;
}

/**
 * Terminate the OCR worker and release resources
 */
export async function terminateWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.terminate();
    workerInstance = null;
    workerLanguage = '';
  }
}

/**
 * Get the currently loaded language
 *
 * @returns Current language or empty string if no worker
 */
export function getCurrentLanguage(): string {
  return workerLanguage;
}

/**
 * Error thrown when OCR processing fails
 */
export class OCRError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OCRError';
  }
}
