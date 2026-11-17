/**
 * Document Type Detection Service
 *
 * Tells a PDF from an image, and whether a file can be read at all, from
 * the file alone: how each page or image is read is decided while reading
 * it (readPdf, readImage), so the file is opened once.
 */

/**
 * Supported document types
 */
export type DocumentType = 'pdf' | 'image';

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
 * @returns Detection result with document type and metadata
 */
export async function detectDocumentType(file: File): Promise<DocumentDetectionResult> {
  const found = { fileName: file.name, fileSize: file.size };

  // Basic validation
  const validation = validateFile(file);
  if (!validation.isValid) {
    return { ...found, type: 'image', mimeType: file.type || 'unknown', metadata: validation };
  }

  const mimeType = getMimeType(file);
  if (isImageType(mimeType)) return { ...found, type: 'image', mimeType, metadata: { isValid: true } };
  if (mimeType === SUPPORTED_MIME_TYPES.pdf) return { ...found, type: 'pdf', mimeType, metadata: { isValid: true } };

  return {
    ...found,
    type: 'image',
    mimeType,
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
