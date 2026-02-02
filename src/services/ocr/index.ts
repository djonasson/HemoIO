/**
 * OCR Services Module
 *
 * Provides document processing capabilities including:
 * - PDF text extraction
 * - OCR for images and scanned documents
 * - Document type detection
 */

// Re-export everything from submodules
// Using * exports to avoid type-only export issues with Vite dev server

export * from './pdfExtractor';
export * from './tesseractService';
export * from './documentDetector';
