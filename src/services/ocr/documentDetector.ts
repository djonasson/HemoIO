/**
 * Document Type Detection Service
 *
 * Detects the type of uploaded documents and determines the best
 * extraction strategy (direct text extraction vs OCR).
 */

import { extractTextFromPDF } from './pdfExtractor';
import type { PDFExtractionResult } from './pdfExtractor';

/**
 * Supported document types
 */
export type DocumentType = 'text-pdf' | 'scanned-pdf' | 'image';

/**
 * Supported file MIME types
 */
export const SUPPORTED_MIME_TYPES = {
  pdf: 'application/pdf',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
} as const;

/**
 * File extensions mapped to MIME types
 */
export const EXTENSION_TO_MIME: Record<string, string> = {
  '.pdf': SUPPORTED_MIME_TYPES.pdf,
  '.jpg': SUPPORTED_MIME_TYPES.jpeg,
  '.jpeg': SUPPORTED_MIME_TYPES.jpeg,
  '.png': SUPPORTED_MIME_TYPES.png,
  '.webp': SUPPORTED_MIME_TYPES.webp,
  '.gif': SUPPORTED_MIME_TYPES.gif,
  '.bmp': SUPPORTED_MIME_TYPES.bmp,
  '.tiff': SUPPORTED_MIME_TYPES.tiff,
  '.tif': SUPPORTED_MIME_TYPES.tiff,
};

/**
 * Result of document type detection
 */
export interface DocumentDetectionResult {
  /** Detected document type */
  type: DocumentType;
  /** MIME type of the file */
  mimeType: string;
  /** File name */
  fileName: string;
  /** File size in bytes */
  fileSize: number;
  /** Whether OCR is needed for text extraction */
  needsOCR: boolean;
  /** Confidence in the detection (0-1) */
  confidence: number;
  /** For PDFs, the number of pages */
  pageCount?: number;
  /** For PDFs, preview text if available */
  previewText?: string;
  /** Additional metadata */
  metadata: DocumentMetadata;
}

/**
 * Document metadata
 */
export interface DocumentMetadata {
  /** Whether the file appears to be a valid document */
  isValid: boolean;
  /** Error message if validation failed */
  validationError?: string;
  /** Detected orientation for images */
  orientation?: 'portrait' | 'landscape';
  /** For PDFs, text confidence score */
  textConfidence?: number;
}

/**
 * Options for document detection
 */
export interface DetectionOptions {
  /** Whether to do a quick scan (faster but less accurate) */
  quickScan?: boolean;
  /** Maximum pages to scan for PDFs */
  maxPagesToScan?: number;
}

/**
 * Image MIME types that support OCR
 */
const IMAGE_MIME_TYPES: Set<string> = new Set([
  SUPPORTED_MIME_TYPES.jpeg,
  SUPPORTED_MIME_TYPES.png,
  SUPPORTED_MIME_TYPES.webp,
  SUPPORTED_MIME_TYPES.gif,
  SUPPORTED_MIME_TYPES.bmp,
  SUPPORTED_MIME_TYPES.tiff,
]);

/**
 * Maximum file size (50MB)
 */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Detect the type of an uploaded document
 *
 * @param file - File to analyze
 * @param options - Detection options
 * @returns Detection result with document type and metadata
 */
export async function detectDocumentType(
  file: File,
  options: DetectionOptions = {}
): Promise<DocumentDetectionResult> {
  const { quickScan = true, maxPagesToScan = 5 } = options;

  // Basic validation
  const validation = validateFile(file);
  if (!validation.isValid) {
    return {
      type: 'image', // Default fallback
      mimeType: file.type || 'unknown',
      fileName: file.name,
      fileSize: file.size,
      needsOCR: false,
      confidence: 0,
      metadata: validation,
    };
  }

  const mimeType = getMimeType(file);

  // Handle images
  if (isImageType(mimeType)) {
    return detectImageDocument(file, mimeType);
  }

  // Handle PDFs
  if (mimeType === SUPPORTED_MIME_TYPES.pdf) {
    return detectPDFDocument(file, { quickScan, maxPagesToScan });
  }

  // Unknown file type
  return {
    type: 'image',
    mimeType,
    fileName: file.name,
    fileSize: file.size,
    needsOCR: true,
    confidence: 0,
    metadata: {
      isValid: false,
      validationError: `Unsupported file type: ${mimeType}`,
    },
  };
}

/**
 * Validate a file for processing
 *
 * @param file - File to validate
 * @returns Validation metadata
 */
function validateFile(file: File): DocumentMetadata {
  if (!file || !file.name) {
    return {
      isValid: false,
      validationError: 'Invalid file: missing file or filename',
    };
  }

  if (file.size === 0) {
    return {
      isValid: false,
      validationError: 'File is empty',
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      isValid: false,
      validationError: `File too large: ${Math.round(file.size / 1024 / 1024)}MB exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
    };
  }

  const mimeType = getMimeType(file);
  if (!isSupportedType(mimeType)) {
    return {
      isValid: false,
      validationError: `Unsupported file type: ${mimeType}`,
    };
  }

  return { isValid: true };
}

/**
 * Get MIME type from file, with fallback to extension detection
 *
 * @param file - File to analyze
 * @returns MIME type string
 */
function getMimeType(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') {
    return file.type;
  }

  // Fallback to extension
  const extension = getFileExtension(file.name);
  return EXTENSION_TO_MIME[extension] || file.type || 'unknown';
}

/**
 * Get file extension from filename
 *
 * @param filename - File name
 * @returns Extension including dot, lowercase
 */
function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot).toLowerCase();
}

/**
 * Check if MIME type is supported
 *
 * @param mimeType - MIME type to check
 * @returns true if supported
 */
function isSupportedType(mimeType: string): boolean {
  return mimeType === SUPPORTED_MIME_TYPES.pdf || IMAGE_MIME_TYPES.has(mimeType);
}

/**
 * Check if MIME type is an image
 *
 * @param mimeType - MIME type to check
 * @returns true if image type
 */
function isImageType(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.has(mimeType);
}

/**
 * Detect properties of an image document
 *
 * @param file - Image file
 * @param mimeType - MIME type
 * @returns Detection result
 */
async function detectImageDocument(
  file: File,
  mimeType: string
): Promise<DocumentDetectionResult> {
  // For images, we can try to detect orientation
  let orientation: 'portrait' | 'landscape' | undefined;

  try {
    const imageBitmap = await createImageBitmap(file);
    orientation = imageBitmap.width > imageBitmap.height ? 'landscape' : 'portrait';
    imageBitmap.close();
  } catch {
    // Image dimension detection failed, continue without it
  }

  return {
    type: 'image',
    mimeType,
    fileName: file.name,
    fileSize: file.size,
    needsOCR: true,
    confidence: 1.0, // High confidence - it's definitely an image
    metadata: {
      isValid: true,
      orientation,
    },
  };
}

/**
 * Detect properties of a PDF document
 *
 * @param file - PDF file
 * @param options - Detection options
 * @returns Detection result
 */
async function detectPDFDocument(
  file: File,
  options: { quickScan: boolean; maxPagesToScan: number }
): Promise<DocumentDetectionResult> {
  try {
    const extractionResult: PDFExtractionResult = await extractTextFromPDF(file, {
      quickScan: options.quickScan,
      maxPages: options.maxPagesToScan,
    });

    const isScanned = extractionResult.isScanned;
    const type: DocumentType = isScanned ? 'scanned-pdf' : 'text-pdf';

    // Get preview text (first 500 chars)
    const previewText = extractionResult.fullText.slice(0, 500);

    return {
      type,
      mimeType: SUPPORTED_MIME_TYPES.pdf,
      fileName: file.name,
      fileSize: file.size,
      needsOCR: isScanned,
      confidence: extractionResult.textConfidence,
      pageCount: extractionResult.totalPages,
      previewText: previewText || undefined,
      metadata: {
        isValid: true,
        textConfidence: extractionResult.textConfidence,
      },
    };
  } catch (error) {
    // PDF parsing failed - might be corrupt
    return {
      type: 'scanned-pdf',
      mimeType: SUPPORTED_MIME_TYPES.pdf,
      fileName: file.name,
      fileSize: file.size,
      needsOCR: true,
      confidence: 0,
      metadata: {
        isValid: false,
        validationError: `Failed to parse PDF: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

/**
 * Check if a file is a supported document type
 *
 * @param file - File to check
 * @returns true if supported
 */
export function isSupportedDocument(file: File): boolean {
  const mimeType = getMimeType(file);
  return isSupportedType(mimeType);
}

/**
 * Get list of supported file extensions
 *
 * @returns Array of supported extensions (with dots)
 */
export function getSupportedExtensions(): string[] {
  return Object.keys(EXTENSION_TO_MIME);
}

/**
 * Get accept string for file input elements
 *
 * @returns Accept attribute value
 */
export function getAcceptString(): string {
  const mimeTypes = Object.values(SUPPORTED_MIME_TYPES);
  return mimeTypes.join(',');
}

/**
 * Error thrown when document detection fails
 */
export class DocumentDetectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentDetectionError';
  }
}
