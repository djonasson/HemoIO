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
  recognizeImages,
  renderPdfPages,
} from '../ocr';
import type { DocumentDetectionResult, OCRResult, PDFExtractionResult } from '../ocr';
import { getAIProvider, AIAnalysisError } from '../ai';
import type {
  AIProviderConfig,
  AIProviderType,
  LabReportAnalysisResult,
  ExtractedBiomarker,
} from '../ai';
import { findBiomarker, matchBiomarkerName } from '../../data/biomarkers/dictionary';
import type { BiomarkerDefinition } from '../../data/biomarkers/dictionary';
import { normalizeUnit, canConvert, convertValue } from '../units';

/**
 * Information about a duplicate biomarker conflict
 */
export interface DuplicateConflict {
  /** The biomarker name */
  biomarkerName: string;
  /** Original values before deduplication (for user review) */
  originalValues: Array<{
    value: number;
    unit: string;
    convertedValue?: number;
    convertedUnit?: string;
  }>;
  /** Whether the values match after conversion */
  valuesMatch: boolean;
  /** Message describing the conflict */
  message: string;
}

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
  /** Flag indicating this biomarker has a duplicate conflict that needs user review */
  hasDuplicateConflict?: boolean;
  /** Details about the duplicate conflict if present */
  duplicateConflict?: DuplicateConflict;
  /** Set when the user renamed it in review: its unit must then fit the new name */
  renamedInReview?: boolean;
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
  /** Duplicate biomarker conflicts that need user review */
  duplicateConflicts: DuplicateConflict[];
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

/** Progress stage shown while waiting out an AI provider's rate limit */
export const RATE_LIMIT_STAGE = 'Waiting for the AI provider (rate limited)';

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
  /** Cancels the AI request, e.g. when the user leaves the analysis */
  signal?: AbortSignal;
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
        // Use any embedded text layer if there is a meaningful amount of it:
        // letters and digits, not page breaks and stray marks
        const pdfResult = await extractTextFromPDF(file);
        if (pdfResult.fullText.replace(/[^\p{L}\p{N}]/gu, '').length > 100) {
          // Some text was found, use it
          extractedText = pdfResult.fullText;
          extractionMethod = 'pdf-text';
          warnings.push(
            'This appears to be a scanned PDF. Some text may be missing or inaccurate.'
          );
        } else {
          // Render each page to an image and OCR it
          const pageImages = await renderPdfPages(file, {
            onProgress: (current, total) => {
              options.onProgress?.(`Rendering page ${current}/${total}`, 0.3 + (current / total) * 0.05);
            },
          });
          let pagesDone = 0;
          const ocrResults = await recognizeImages(pageImages, {
            language: options.language,
            onProgress: (progress) => {
              const total = pageImages.length;
              options.onProgress?.(
                `OCR: ${progress.status} (page ${pagesDone + 1}/${total})`,
                0.35 + ((pagesDone + progress.progress) / total) * 0.15
              );
            },
            onImageProgress: (done) => {
              pagesDone = done;
            },
          });
          extractedText = ocrResults.map((r) => r.text.trim()).filter(Boolean).join('\n\n');
          extractionMethod = 'ocr';

          const averageConfidence =
            ocrResults.reduce((sum, r) => sum + r.confidence, 0) / Math.max(ocrResults.length, 1);
          if (averageConfidence < 70) {
            warnings.push(
              `Low OCR confidence (${Math.round(averageConfidence)}%). Results may be inaccurate.`
            );
          }
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
      signal: options.signal,
      rateLimit: {
        onWait: () => options.onProgress?.(RATE_LIMIT_STAGE, 0.6),
        onResume: () => options.onProgress?.('Analyzing with AI', 0.6),
      },
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
  let duplicateConflicts: DuplicateConflict[] = [];

  try {
    startStage(matchingStage);

    const initialMatches = aiAnalysis.biomarkers.map((biomarker) =>
      matchBiomarkerToDictionary(biomarker)
    );

    // Deduplicate biomarkers with different units
    const deduplicationResult = deduplicateBiomarkers(initialMatches);
    matchedBiomarkers = deduplicationResult.deduplicated;
    duplicateConflicts = deduplicationResult.conflicts;

    // Count unmatched biomarkers
    const unmatchedCount = matchedBiomarkers.filter(
      (b) => !b.isExactMatch && !b.suggestedMatch
    ).length;
    if (unmatchedCount > 0) {
      warnings.push(
        `${unmatchedCount} biomarker(s) could not be matched to the dictionary`
      );
    }

    // Add warnings for duplicate conflicts
    if (duplicateConflicts.length > 0) {
      const conflictCount = duplicateConflicts.filter((c) => !c.valuesMatch).length;
      if (conflictCount > 0) {
        warnings.push(
          `${conflictCount} biomarker(s) have conflicting duplicate values that need review`
        );
      }
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
    duplicateConflicts,
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

  // Exact name or alias first, then variations (punctuation, spacing)
  const exactMatch = findBiomarker(biomarker.name);
  const candidate = exactMatch ?? matchBiomarkerName(biomarker.name);

  if (candidate) {
    const allUnits = [candidate.canonicalUnit, ...candidate.alternativeUnits];
    const unitCompatible =
      allUnits.some((u: string) => u.toLowerCase() === normalizedUnit.toLowerCase()) ||
      canConvert(candidate.name, biomarker.unit, candidate.canonicalUnit);

    // An incompatible unit means the name may be misread: suggest, don't assume
    return unitCompatible
      ? { ...biomarker, dictionaryMatch: candidate, isExactMatch: exactMatch !== undefined, normalizedUnit }
      : { ...biomarker, suggestedMatch: candidate, isExactMatch: false, normalizedUnit };
  }

  return {
    ...biomarker,
    isExactMatch: false,
    normalizedUnit,
  };
}

/**
 * Relative tolerance for comparing converted values (2% difference allowed)
 * This accounts for rounding errors that occur when:
 * 1. Labs round values before reporting
 * 2. Labs convert between units and round again
 * 3. Our conversion math introduces small floating point differences
 *
 * Example: Triglycerides 0.9 mmol/L = 79.65 mg/dL ≈ 80 mg/dL
 * vs the lab's direct measurement of 79 mg/dL - a 1.26% difference
 */
const RELATIVE_TOLERANCE = 0.02;

/** Decimal places used when converting values only to compare them */
const COMPARISON_PRECISION = 10;

/**
 * Check if two values (already in the same unit) are equal within tolerance.
 *
 * The tolerance is relative only: an absolute allowance would treat small
 * values that differ substantially (e.g. creatinine 0.76 vs 1.5 mg/dL) as
 * the same. Anything outside the tolerance is flagged for user review rather
 * than merged, so a borderline rounding difference costs a review, not data.
 */
function valuesAreEqual(val1: number, val2: number): boolean {
  if (val1 === val2) return true;
  if (val1 === 0 || val2 === 0) return false;

  const diff = Math.abs(val1 - val2);
  const avg = (Math.abs(val1) + Math.abs(val2)) / 2;
  return diff / avg <= RELATIVE_TOLERANCE;
}

/**
 * Deduplicate biomarkers that appear multiple times with different units.
 * - If values are the same after conversion: keep only one (prefer canonical unit)
 * - If values differ: flag as conflict for user review
 */
function deduplicateBiomarkers(
  biomarkers: MatchedBiomarker[]
): { deduplicated: MatchedBiomarker[]; conflicts: DuplicateConflict[] } {
  const conflicts: DuplicateConflict[] = [];

  // Group biomarkers by their canonical name (from dictionary match or original name)
  const groups = new Map<string, MatchedBiomarker[]>();

  for (const biomarker of biomarkers) {
    const canonicalName =
      biomarker.dictionaryMatch?.name ||
      biomarker.suggestedMatch?.name ||
      biomarker.name.toLowerCase().trim();

    if (!groups.has(canonicalName)) {
      groups.set(canonicalName, []);
    }
    groups.get(canonicalName)!.push(biomarker);
  }

  const deduplicated: MatchedBiomarker[] = [];

  for (const [canonicalName, group] of groups) {
    if (group.length === 1) {
      // No duplicates, keep as is
      deduplicated.push(group[0]);
      continue;
    }

    // Multiple entries for the same biomarker - check if they can be merged
    const definition = group[0].dictionaryMatch || group[0].suggestedMatch;
    const canonicalUnit = definition?.canonicalUnit;

    if (!canonicalUnit) {
      // No canonical unit available, keep all and warn
      const conflict: DuplicateConflict = {
        biomarkerName: canonicalName,
        originalValues: group.map((b) => ({ value: b.value, unit: b.unit })),
        valuesMatch: false,
        message: `Multiple values found for "${canonicalName}" but no canonical unit available to compare them.`,
      };
      conflicts.push(conflict);

      // Mark all as having conflict and keep them
      for (const biomarker of group) {
        deduplicated.push({
          ...biomarker,
          hasDuplicateConflict: true,
          duplicateConflict: conflict,
        });
      }
      continue;
    }

    // Convert all values to canonical unit
    const convertedValues: Array<{
      biomarker: MatchedBiomarker;
      originalValue: number;
      originalUnit: string;
      convertedValue: number;
      /** Unrounded converted value: rounding before comparing adds error */
      comparisonValue: number;
      conversionSucceeded: boolean;
    }> = [];

    for (const biomarker of group) {
      const entry = (converted: number, comparison: number, conversionSucceeded: boolean) => ({
        biomarker,
        originalValue: biomarker.value,
        originalUnit: biomarker.unit,
        convertedValue: converted,
        comparisonValue: comparison,
        conversionSucceeded,
      });
      const unchanged = (conversionSucceeded: boolean) =>
        entry(biomarker.value, biomarker.value, conversionSucceeded);

      if (biomarker.unit.toLowerCase() === canonicalUnit.toLowerCase()) {
        convertedValues.push(unchanged(true));
      } else if (canConvert(canonicalName, biomarker.unit, canonicalUnit)) {
        try {
          const convert = (precision?: number) =>
            convertValue(canonicalName, biomarker.value, biomarker.unit, canonicalUnit, precision)
              .convertedValue;
          convertedValues.push(entry(convert(), convert(COMPARISON_PRECISION), true));
        } catch {
          convertedValues.push(unchanged(false));
        }
      } else {
        convertedValues.push(unchanged(false));
      }
    }

    // Check if all converted values match
    const successfulConversions = convertedValues.filter((cv) => cv.conversionSucceeded);

    if (successfulConversions.length < 2) {
      // Can't compare, keep all with warning
      const conflict: DuplicateConflict = {
        biomarkerName: canonicalName,
        originalValues: convertedValues.map((cv) => ({
          value: cv.originalValue,
          unit: cv.originalUnit,
          convertedValue: cv.conversionSucceeded ? cv.convertedValue : undefined,
          convertedUnit: cv.conversionSucceeded ? canonicalUnit : undefined,
        })),
        valuesMatch: false,
        message: `Multiple values found for "${canonicalName}" but unit conversion failed for some entries.`,
      };
      conflicts.push(conflict);

      for (const cv of convertedValues) {
        deduplicated.push({
          ...cv.biomarker,
          hasDuplicateConflict: true,
          duplicateConflict: conflict,
        });
      }
      continue;
    }

    // Check if all values match after conversion
    const firstValue = successfulConversions[0].comparisonValue;
    const allMatch = successfulConversions.every((cv) =>
      valuesAreEqual(cv.comparisonValue, firstValue)
    );

    if (allMatch) {
      // Values match - keep only the one in canonical unit, or first one
      const preferredEntry =
        convertedValues.find(
          (cv) => cv.originalUnit.toLowerCase() === canonicalUnit.toLowerCase()
        ) || convertedValues[0];

      deduplicated.push(preferredEntry.biomarker);
    } else {
      // Values don't match - flag as conflict for user review
      const conflict: DuplicateConflict = {
        biomarkerName: canonicalName,
        originalValues: convertedValues.map((cv) => ({
          value: cv.originalValue,
          unit: cv.originalUnit,
          convertedValue: cv.conversionSucceeded ? cv.convertedValue : undefined,
          convertedUnit: cv.conversionSucceeded ? canonicalUnit : undefined,
        })),
        valuesMatch: false,
        message:
          `Conflicting values found for "${canonicalName}": ` +
          convertedValues
            .map(
              (cv) =>
                `${cv.originalValue} ${cv.originalUnit}` +
                (cv.conversionSucceeded ? ` (=${cv.convertedValue} ${canonicalUnit})` : '')
            )
            .join(' vs ') +
          '. Please review and keep the correct value.',
      };
      conflicts.push(conflict);

      // Mark all as having conflict
      for (const cv of convertedValues) {
        deduplicated.push({
          ...cv.biomarker,
          hasDuplicateConflict: true,
          duplicateConflict: conflict,
        });
      }
    }
  }

  return { deduplicated, conflicts };
}

/**
 * Calculate overall confidence from matched biomarkers
 */
function calculateOverallConfidence(
  biomarkers: MatchedBiomarker[],
  aiAnalysis: LabReportAnalysisResult
): number {
  if (biomarkers.length === 0) return 0;

  // Calculate average biomarker confidence from AI extraction
  const avgBiomarkerConfidence =
    biomarkers.reduce((sum, b) => sum + b.confidence, 0) / biomarkers.length;

  const exactMatchRatio =
    biomarkers.filter((b) => b.isExactMatch).length / biomarkers.length;

  // If we have dictionary matches, weight them in the calculation
  // If no dictionary matches, rely more heavily on AI and biomarker confidence
  if (exactMatchRatio > 0) {
    // With dictionary matches: weight all three factors
    const aiConfidenceWeight = 0.3;
    const matchConfidenceWeight = 0.4;
    const exactMatchWeight = 0.3;

    return (
      aiAnalysis.overallConfidence * aiConfidenceWeight +
      avgBiomarkerConfidence * matchConfidenceWeight +
      exactMatchRatio * exactMatchWeight
    );
  } else {
    // Without dictionary matches: rely on AI and biomarker confidence
    // Don't penalize for unmatched biomarkers (could be foreign language or specialized tests)
    const aiConfidenceWeight = 0.4;
    const matchConfidenceWeight = 0.6;

    return (
      aiAnalysis.overallConfidence * aiConfidenceWeight +
      avgBiomarkerConfidence * matchConfidenceWeight
    );
  }
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
