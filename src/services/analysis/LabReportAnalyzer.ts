/**
 * Lab Report Analyzer Service
 *
 * Orchestrates the complete pipeline for analyzing lab report documents:
 * 1. Document type detection
 * 2. Text extraction (PDF text or OCR)
 * 3. AI-powered biomarker extraction
 * 4. Biomarker dictionary matching
 */

import {
  detectDocumentType,
  extractTextFromPDF,
  recognizeImage,
} from '../ocr';
import type { DocumentDetectionResult, OCRResult, PDFExtractionResult } from '../ocr';
import { getAIProvider, AIAnalysisError } from '../ai';
import type {
  AIProviderConfig,
  AIProviderType,
  LabReportAnalysisResult,
  ExtractedBiomarker,
} from '../ai';
import { findBiomarker } from '../../data/biomarkers/dictionary';
import type { BiomarkerDefinition } from '../../data/biomarkers/dictionary';
import { normalizeUnit, canConvert } from '../units';

/**
 * Matched biomarker with dictionary information
 */
export interface MatchedBiomarker extends ExtractedBiomarker {
  /** Matched biomarker from dictionary, if found */
  dictionaryMatch?: BiomarkerDefinition;
  /** Suggested biomarker if fuzzy match found */
  suggestedMatch?: BiomarkerDefinition;
  /** Whether an exact match was found */
  isExactMatch: boolean;
  /** Normalized unit */
  normalizedUnit: string;
}

/**
 * Complete analysis result
 */
export interface AnalysisResult {
  /** Unique ID for this analysis */
  id: string;
  /** Original file name */
  fileName: string;
  /** Document type detected */
  documentType: DocumentDetectionResult['type'];
  /** Text extraction result */
  extractionMethod: 'pdf-text' | 'ocr';
  /** Extracted text */
  extractedText: string;
  /** AI analysis result */
  aiAnalysis: LabReportAnalysisResult;
  /** Biomarkers with dictionary matching */
  matchedBiomarkers: MatchedBiomarker[];
  /** Detected lab date */
  labDate?: string;
  /** Detected lab name */
  labName?: string;
  /** Overall confidence score */
  overallConfidence: number;
  /** Warnings and issues */
  warnings: string[];
  /** Processing stages completed */
  stages: AnalysisStage[];
  /** Total processing time in milliseconds */
  totalProcessingTime: number;
}

/**
 * Analysis stage information
 */
export interface AnalysisStage {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime?: number;
  endTime?: number;
  error?: string;
}

/**
 * Options for lab report analysis
 */
export interface AnalyzerOptions {
  /** AI provider type */
  aiProvider: AIProviderType;
  /** AI provider configuration */
  aiConfig: AIProviderConfig;
  /** Language of the document */
  language?: string;
  /** Whether to extract patient information */
  extractPatientInfo?: boolean;
  /** Progress callback */
  onProgress?: (stage: string, progress: number) => void;
}

/**
 * Error thrown during analysis
 */
export class AnalysisError extends Error {
  readonly stage: string;
  readonly cause?: Error;

  constructor(message: string, stage: string, cause?: Error) {
    super(message);
    this.name = 'AnalysisError';
    this.stage = stage;
    this.cause = cause;
  }
}

/**
 * Analyze a lab report document
 *
 * @param file - Document file to analyze
 * @param options - Analysis options
 * @returns Complete analysis result
 */
export async function analyzeLabReport(
  file: File,
  options: AnalyzerOptions
): Promise<AnalysisResult> {
  const startTime = performance.now();
  const id = generateId();
  const stages: AnalysisStage[] = [];
  const warnings: string[] = [];

  let documentType: DocumentDetectionResult['type'] = 'image';
  let extractedText = '';
  let extractionMethod: 'pdf-text' | 'ocr' = 'ocr';

  // Stage 1: Document Detection
  const detectionStage = createStage('Document Detection');
  stages.push(detectionStage);
  options.onProgress?.('Detecting document type', 0.1);

  try {
    startStage(detectionStage);
    const detection = await detectDocumentType(file);
    documentType = detection.type;

    if (!detection.metadata.isValid) {
      throw new AnalysisError(
        detection.metadata.validationError || 'Invalid document',
        'Document Detection'
      );
    }

    completeStage(detectionStage);
  } catch (error) {
    failStage(detectionStage, error);
    throw new AnalysisError(
      `Document detection failed: ${error instanceof Error ? error.message : String(error)}`,
      'Document Detection',
      error instanceof Error ? error : undefined
    );
  }

  // Stage 2: Text Extraction
  const extractionStage = createStage('Text Extraction');
  stages.push(extractionStage);
  options.onProgress?.('Extracting text', 0.3);

  try {
    startStage(extractionStage);

    if (documentType === 'text-pdf') {
      // Extract text directly from PDF
      const pdfResult: PDFExtractionResult = await extractTextFromPDF(file, {
        onProgress: (current, total) => {
          options.onProgress?.(
            `Extracting page ${current}/${total}`,
            0.3 + (current / total) * 0.2
          );
        },
      });
      extractedText = pdfResult.fullText;
      extractionMethod = 'pdf-text';

      if (pdfResult.errors.length > 0) {
        warnings.push(...pdfResult.errors);
      }
    } else {
      // Use OCR for scanned PDFs and images
      if (documentType === 'scanned-pdf') {
        // For scanned PDFs, we need to convert pages to images first
        // For now, we'll extract what we can and note it may be incomplete
        const pdfResult = await extractTextFromPDF(file);
        if (pdfResult.fullText.length > 100) {
          // Some text was found, use it
          extractedText = pdfResult.fullText;
          extractionMethod = 'pdf-text';
          warnings.push(
            'This appears to be a scanned PDF. Some text may be missing or inaccurate.'
          );
        } else {
          // Need OCR - this would require rendering PDF pages to images
          warnings.push(
            'Scanned PDF detected. Full OCR support requires PDF page rendering.'
          );
          extractedText = pdfResult.fullText || 'Unable to extract text from scanned PDF';
        }
      } else {
        // Image file - use OCR
        const ocrResult: OCRResult = await recognizeImage(file, {
          language: options.language,
          onProgress: (progress) => {
            options.onProgress?.(
              `OCR: ${progress.status}`,
              0.3 + progress.progress * 0.2
            );
          },
        });
        extractedText = ocrResult.text;
        extractionMethod = 'ocr';

        if (ocrResult.confidence < 70) {
          warnings.push(
            `Low OCR confidence (${Math.round(ocrResult.confidence)}%). Results may be inaccurate.`
          );
        }
      }
    }

    if (!extractedText || extractedText.trim().length < 20) {
      throw new AnalysisError(
        'No readable text found in document',
        'Text Extraction'
      );
    }

    completeStage(extractionStage);
  } catch (error) {
    failStage(extractionStage, error);
    if (error instanceof AnalysisError) throw error;
    throw new AnalysisError(
      `Text extraction failed: ${error instanceof Error ? error.message : String(error)}`,
      'Text Extraction',
      error instanceof Error ? error : undefined
    );
  }

  // Stage 3: AI Analysis
  const aiStage = createStage('AI Analysis');
  stages.push(aiStage);
  options.onProgress?.('Analyzing with AI', 0.6);

  let aiAnalysis: LabReportAnalysisResult;

  try {
    startStage(aiStage);

    const provider = getAIProvider(options.aiProvider, options.aiConfig);
    aiAnalysis = await provider.analyzeLabReport(extractedText, {
      language: options.language,
      extractPatientInfo: options.extractPatientInfo,
    });

    if (aiAnalysis.warnings.length > 0) {
      warnings.push(...aiAnalysis.warnings);
    }

    completeStage(aiStage);
  } catch (error) {
    failStage(aiStage, error);
    if (error instanceof AIAnalysisError) {
      throw new AnalysisError(
        `AI analysis failed: ${error.message}`,
        'AI Analysis',
        error
      );
    }
    throw new AnalysisError(
      `AI analysis failed: ${error instanceof Error ? error.message : String(error)}`,
      'AI Analysis',
      error instanceof Error ? error : undefined
    );
  }

  // Stage 4: Biomarker Matching
  const matchingStage = createStage('Biomarker Matching');
  stages.push(matchingStage);
  options.onProgress?.('Matching biomarkers', 0.9);

  let matchedBiomarkers: MatchedBiomarker[];

  try {
    startStage(matchingStage);

    matchedBiomarkers = aiAnalysis.biomarkers.map((biomarker) =>
      matchBiomarkerToDictionary(biomarker)
    );

    // Count unmatched biomarkers
    const unmatchedCount = matchedBiomarkers.filter(
      (b) => !b.isExactMatch && !b.suggestedMatch
    ).length;
    if (unmatchedCount > 0) {
      warnings.push(
        `${unmatchedCount} biomarker(s) could not be matched to the dictionary`
      );
    }

    completeStage(matchingStage);
  } catch (error) {
    failStage(matchingStage, error);
    // Non-fatal - continue with unmatched biomarkers
    matchedBiomarkers = aiAnalysis.biomarkers.map((b) => ({
      ...b,
      isExactMatch: false,
      normalizedUnit: normalizeUnit(b.unit),
    }));
    warnings.push('Biomarker matching encountered errors');
  }

  const totalProcessingTime = performance.now() - startTime;
  options.onProgress?.('Complete', 1.0);

  return {
    id,
    fileName: file.name,
    documentType,
    extractionMethod,
    extractedText,
    aiAnalysis,
    matchedBiomarkers,
    labDate: aiAnalysis.labDate,
    labName: aiAnalysis.labName,
    overallConfidence: calculateOverallConfidence(matchedBiomarkers, aiAnalysis),
    warnings,
    stages,
    totalProcessingTime,
  };
}

/**
 * Match an extracted biomarker to the dictionary
 */
function matchBiomarkerToDictionary(
  biomarker: ExtractedBiomarker
): MatchedBiomarker {
  const normalizedUnit = normalizeUnit(biomarker.unit);

  // Try exact match first
  const exactMatch = findBiomarker(biomarker.name);
  if (exactMatch) {
    // Verify unit is compatible
    const allUnits = [exactMatch.canonicalUnit, ...exactMatch.alternativeUnits];
    const unitCompatible =
      allUnits.some(
        (u: string) => u.toLowerCase() === normalizedUnit.toLowerCase()
      ) || canConvert(exactMatch.name, biomarker.unit, exactMatch.canonicalUnit);

    if (unitCompatible) {
      return {
        ...biomarker,
        dictionaryMatch: exactMatch,
        isExactMatch: true,
        normalizedUnit,
      };
    }
  }

  // Try fuzzy matching with common aliases
  const fuzzyMatch = findFuzzyMatch(biomarker.name);
  if (fuzzyMatch) {
    return {
      ...biomarker,
      suggestedMatch: fuzzyMatch,
      isExactMatch: false,
      normalizedUnit,
    };
  }

  return {
    ...biomarker,
    isExactMatch: false,
    normalizedUnit,
  };
}

/**
 * Try to find a fuzzy match for a biomarker name
 */
function findFuzzyMatch(name: string): BiomarkerDefinition | undefined {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Common variations to try
  const variations = [
    name,
    name.replace(/\s+/g, ''),
    name.replace(/[^a-zA-Z0-9\s]/g, ''),
    normalized,
  ];

  for (const variation of variations) {
    const match = findBiomarker(variation);
    if (match) return match;
  }

  return undefined;
}

/**
 * Calculate overall confidence from matched biomarkers
 */
function calculateOverallConfidence(
  biomarkers: MatchedBiomarker[],
  aiAnalysis: LabReportAnalysisResult
): number {
  if (biomarkers.length === 0) return 0;

  // Weight factors
  const aiConfidenceWeight = 0.4;
  const matchConfidenceWeight = 0.3;
  const exactMatchWeight = 0.3;

  const avgBiomarkerConfidence =
    biomarkers.reduce((sum, b) => sum + b.confidence, 0) / biomarkers.length;

  const exactMatchRatio =
    biomarkers.filter((b) => b.isExactMatch).length / biomarkers.length;

  return (
    aiAnalysis.overallConfidence * aiConfidenceWeight +
    avgBiomarkerConfidence * matchConfidenceWeight +
    exactMatchRatio * exactMatchWeight
  );
}

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new analysis stage
 */
function createStage(name: string): AnalysisStage {
  return { name, status: 'pending' };
}

/**
 * Mark a stage as running
 */
function startStage(stage: AnalysisStage): void {
  stage.status = 'running';
  stage.startTime = performance.now();
}

/**
 * Mark a stage as completed
 */
function completeStage(stage: AnalysisStage): void {
  stage.status = 'completed';
  stage.endTime = performance.now();
}

/**
 * Mark a stage as failed
 */
function failStage(stage: AnalysisStage, error: unknown): void {
  stage.status = 'failed';
  stage.endTime = performance.now();
  stage.error = error instanceof Error ? error.message : String(error);
}

/**
 * Analyze multiple documents in batch
 *
 * @param files - Array of files to analyze
 * @param options - Analysis options
 * @param onFileProgress - Callback for file-level progress
 * @returns Array of analysis results
 */
export async function analyzeMultipleReports(
  files: File[],
  options: AnalyzerOptions,
  onFileProgress?: (
    fileIndex: number,
    totalFiles: number,
    result?: AnalysisResult,
    error?: Error
  ) => void
): Promise<Array<AnalysisResult | { error: Error; fileName: string }>> {
  const results: Array<AnalysisResult | { error: Error; fileName: string }> = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    try {
      const result = await analyzeLabReport(file, {
        ...options,
        onProgress: (stage, progress) => {
          const overallProgress = (i + progress) / files.length;
          options.onProgress?.(stage, overallProgress);
        },
      });

      results.push(result);
      onFileProgress?.(i + 1, files.length, result);
    } catch (error) {
      const analysisError =
        error instanceof Error ? error : new Error(String(error));
      results.push({ error: analysisError, fileName: file.name });
      onFileProgress?.(i + 1, files.length, undefined, analysisError);
    }
  }

  return results;
}
