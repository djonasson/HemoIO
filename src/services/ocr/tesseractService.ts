/**
 * Tesseract.js OCR Service
 *
 * Provides OCR (Optical Character Recognition) capabilities for images
 * and scanned PDFs using Tesseract.js.
 */

import Tesseract, { createWorker } from 'tesseract.js';
import type { Worker, RecognizeResult } from 'tesseract.js';
import { OCR_LANGUAGES, ocrAssetUrls, staleOcrCaches } from './ocrAssets';

/** The bundled languages, recognized together */
const DEFAULT_LANGUAGE = OCR_LANGUAGES.join('+');

/**
 * Result of OCR processing for a single image
 */
export interface OCRResult {
  /** Extracted text content */
  text: string;
  /** Confidence score (0-100) */
  confidence: number;
  /** Whether the image was straightened before it was read */
  wasRotated: boolean;
  /** How far the image was straightened, in degrees */
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
  /** Whether to straighten a page scanned askew before reading it */
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
 * One worker, shared: a Tesseract worker holds a core and the language data
 * (several MB), so concurrent recognitions must not each start one. The
 * promise is kept, not the worker, so calls arriving together share it.
 */
let workerPromise: Promise<Worker> | null = null;
let workerLanguage: string = '';
/** Progress handler of the recognition the worker is running now */
let currentLogger: ((message: Tesseract.LoggerMessage) => void) | null = null;
/** Recognitions run one after another, so progress reaches the right caller */
let queue: Promise<unknown> = Promise.resolve();

/** Whether an error is a file that could not be fetched, as offline */
function isNetworkFailure(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /NetworkError|Failed to fetch|Load failed|network error/i.test(message);
}

/** The error to show for a worker that could not start */
function startFailure(error: unknown): OCRError {
  if (isNetworkFailure(error)) return new OCRError(OCR_UNAVAILABLE_MESSAGE, { cause: error });
  const reason = error instanceof Error ? error.message : String(error);
  return new OCRError(ocrStartFailedMessage(reason), { cause: error });
}

/**
 * Fetch the language data before a worker starts: when it cannot load, a
 * started worker is never handed back to terminate. Through the service
 * worker this also caches it for offline use.
 */
async function checkLanguageData(language: string, langPath: string): Promise<void> {
  for (const lang of language.split('+')) {
    let response: Response;
    try {
      response = await fetch(`${langPath}/${lang}.traineddata.gz`);
    } catch (error) {
      throw startFailure(error);
    }
    if (!response.ok) {
      throw new OCRError(
        ocrStartFailedMessage(`its language data could not be loaded: HTTP ${response.status}`)
      );
    }
  }
}

/** Delete the OCR files earlier releases cached; they are never used again */
async function deleteStaleOcrCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const stale = staleOcrCaches(await caches.keys(), __OCR_CACHE_NAME__);
    await Promise.all(stale.map((name) => caches.delete(name)));
  } catch {
    // Only storage is wasted
  }
}

/**
 * Create a Tesseract worker whose script, core and language data all come
 * from the app itself, never a CDN
 */
async function createOcrWorker(
  language: string,
  logger: (message: Tesseract.LoggerMessage) => void
): Promise<Worker> {
  const urls = ocrAssetUrls(window.location.origin, import.meta.env.BASE_URL);
  await deleteStaleOcrCaches();
  await checkLanguageData(language, urls.langPath);
  return new Promise<Worker>((resolve, reject) => {
    createWorker(
      language,
      1 /* OEM.LSTM_ONLY */,
      {
        ...urls,
        // Loaded from its own address rather than a blob, so the service
        // worker controls it and caches the files it loads
        workerBlobURL: false,
        logger,
        // When the language data cannot load, tesseract.js reports it only
        // here: its createWorker promise never settles. Once the worker is
        // ready this has no effect, as a recognition's own promise rejects.
        errorHandler: (error: unknown) => reject(startFailure(error)),
      },
      // The Italian data names a word list ("special-words") that is not part
      // of it; without this Tesseract logs an error looking for it. The option
      // is a Tesseract init parameter that tesseract.js's types do not list.
      { user_words_suffix: '' } as unknown as Partial<Tesseract.InitOptions>
    ).then(resolve, (error: unknown) => reject(startFailure(error)));
  });
}

/**
 * Get or create the shared Tesseract worker
 *
 * @param language - Language(s) to use
 * @returns Tesseract worker instance
 */
function getWorker(language: string = DEFAULT_LANGUAGE): Promise<Worker> {
  if (workerPromise && workerLanguage === language) {
    return workerPromise;
  }

  // A worker for another language is replaced
  const previous = workerPromise;
  workerLanguage = language;
  const next = (async () => {
    if (previous) await (await previous.catch(() => null))?.terminate();
    return createOcrWorker(language, (message) => currentLogger?.(message));
  })();
  workerPromise = next;
  // A worker that failed to start is not kept, so the next call tries again
  next.catch(() => {
    if (workerPromise === next) {
      workerPromise = null;
      workerLanguage = '';
    }
  });
  return next;
}

/** Run recognitions one at a time on the shared worker */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
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
    language = DEFAULT_LANGUAGE,
    onProgress,
    autoRotate = true,
    pageSegmentationMode = PageSegmentationMode.AUTO,
  } = options;

  // Convert language array to string if needed
  const langString = Array.isArray(language) ? language.join('+') : language;

  // Progress of this recognition, forwarded from the shared worker's logger
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

  const result: RecognizeResult = await enqueue(async () => {
    const worker = await getWorker(langString);
    await worker.setParameters({
      tessedit_pageseg_mode: pageSegmentationMode as unknown as Tesseract.PSM,
    });
    currentLogger = progressHandler ?? null;
    try {
      // Straightens a page scanned a little askew before reading it
      return await worker.recognize(image, { rotateAuto: autoRotate });
    } finally {
      currentLogger = null;
    }
  });

  const processingTime = performance.now() - startTime;

  // Extract word-level data (access via any since tesseract.js types are incomplete)
  const resultData = result.data as {
    text: string;
    confidence: number;
    words?: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
    rotateRadians?: number | null;
  };

  const words: OCRWord[] = (resultData.words || []).map((word) => ({
    text: word.text,
    confidence: word.confidence,
    bbox: word.bbox,
  }));

  // How far the page was straightened, in degrees
  const rotationAngle = ((resultData.rotateRadians ?? 0) * 180) / Math.PI;
  const wasRotated = autoRotate && Math.abs(rotationAngle) > 0.1;

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
  return workerPromise !== null;
}

/**
 * Terminate the OCR worker and release resources
 */
export async function terminateWorker(): Promise<void> {
  const current = workerPromise;
  workerPromise = null;
  workerLanguage = '';
  if (current) await (await current.catch(() => null))?.terminate();
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
 * Why OCR could not start. Its files are cached the first time OCR loads
 * them, so offline this means OCR has not been used online yet.
 */
export const OCR_UNAVAILABLE_MESSAGE =
  'OCR could not load. Connect to the internet and try again: after its first use, OCR works offline.';

/** Why OCR could not start, when going online cannot help */
export function ocrStartFailedMessage(reason: string): string {
  return `OCR could not start (${reason}). Enter the values manually instead.`;
}

/**
 * Error thrown when OCR processing fails, with a message to show the user
 */
export class OCRError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'OCRError';
  }
}
