/**
 * Lab Report Analyzer Service
 *
 * Orchestrates the complete pipeline for analyzing lab report documents:
 * 1. Document type detection
 * 2. Text extraction (PDF text or OCR)
 * 3. AI-powered biomarker extraction
 * 4. Identifying each value's LOINC test: learned, local match, then the AI
 */

import {
  OCRError,
  detectDocumentType,
  extractTextFromPDF,
  recognizeImage,
  recognizeImages,
  renderPdfPages,
} from '../ocr';
import type { DocumentDetectionResult, OCRResult, PDFExtractionResult } from '../ocr';
import { getAIProvider, AIAnalysisError } from '../ai';
import { AI_PROVIDER_NAMES } from '../ai/types';
import {
  asAnalyzed,
  identifyValues,
  isFoundWithoutAsking,
  needsTest,
  type Identification,
  type LearnedTests,
} from './identification';
import type {
  AIProviderConfig,
  AIProviderType,
  LabReportAnalysisResult,
  ExtractedBiomarker,
} from '../ai';
import type { Catalog } from '@data/loinc/catalog';
import type { Candidate } from './loincMatch';
import { groupBySameTest, settleGroup } from './sameMeasurement';

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
  /** Message describing the conflict */
  message: string;
}

/**
 * An extracted value with its LOINC test, or the tests it may be
 */
export interface MatchedBiomarker extends ExtractedBiomarker {
  /** The LOINC code it is saved under; none while undecided or "Not a LOINC test" */
  loincCode?: string;
  /** The tests it may be, best first: the local match's, the AI's pick first */
  candidates: Candidate[];
  /** The candidate the AI picked but was not sure of */
  aiPick?: string;
  /** Flag indicating this biomarker has a duplicate conflict that needs user review */
  hasDuplicateConflict?: boolean;
  /**
   * The value as the analyzer read it. An edited value is identified from
   * this and its current name and unit, so nothing typed on the way counts:
   * back at the printed name and unit, it has the analyzer's test again.
   */
  analyzed?: AnalyzedValue;
  /** How its test was found: learned, matched locally, chosen by the AI or the user */
  identifiedBy?: IdentifiedBy;
  /** Checks the identification needs; absent means none (manual rows, fixtures) */
  identificationFlags?: IdentificationFlag[];
  /** Saved under the unknown key of its printed name: "Not a LOINC test" */
  savedAsUnknown?: boolean;
  /** The unknown key learned for its wording, which it is saved under instead */
  unknownKey?: string;
}

export type IdentifiedBy = 'learned' | 'local' | 'ai' | 'user';

/** What the analyzer read a value as */
export interface AnalyzedValue {
  /** The name as printed */
  name: string;
  /** The unit as the report gave it ('' for a screening value) */
  unit: string;
  /** The test the analyzer found for it */
  identification: Identification;
}

/** What review asks the user to check about a value's test */
export type IdentificationFlag = 'ambiguous' | 'no-unit' | 'not-identified';

/** Notes the values whose test the user must choose */
export function unidentifiedNote(count: number): string {
  return `${count} value(s) could not be identified: choose their tests in the Saved as column`;
}

/** Notes that the AI could not be asked to choose among the tests that fit */
export const CHOICE_FAILED_NOTE =
  'The AI could not choose the tests of values several tests fit: choose them in the Saved as column.';

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
  /** The extracted values with their LOINC tests */
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
  /** The LOINC catalog values are matched in */
  catalog: Catalog;
  /** The user's learned tests, as they are when the report is matched */
  learnedTests?: LearnedTests;
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
    if (error instanceof OCRError) {
      throw new AnalysisError(error.message, 'Text Extraction', error);
    }
    throw new AnalysisError(
      `Text extraction failed: ${error instanceof Error ? error.message : String(error)}`,
      'Text Extraction',
      error instanceof Error ? error : undefined
    );
  }

  // Stage 3: AI Analysis
  const aiStage = createStage('AI Analysis');
  stages.push(aiStage);
  const analyzing = analyzingLabel(options.aiProvider, options.aiConfig.model);
  options.onProgress?.(analyzing, 0.6);

  let aiAnalysis: LabReportAnalysisResult;
  let provider: ReturnType<typeof getAIProvider>;

  try {
    startStage(aiStage);

    provider = getAIProvider(options.aiProvider, options.aiConfig);
    aiAnalysis = await provider.analyzeLabReport(extractedText, {
      language: options.language,
      extractPatientInfo: options.extractPatientInfo,
      signal: options.signal,
      rateLimit: {
        onWait: () => options.onProgress?.(RATE_LIMIT_STAGE, 0.6),
        onResume: () => options.onProgress?.(analyzing, 0.6),
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

  // Stage 4: Test identification
  const matchingStage = createStage('Test Identification');
  stages.push(matchingStage);
  options.onProgress?.('Identifying tests', 0.9);

  let matchedBiomarkers: MatchedBiomarker[];
  let duplicateConflicts: DuplicateConflict[] = [];

  try {
    startStage(matchingStage);

    const choosing = `Choosing tests with ${AI_PROVIDER_NAMES[options.aiProvider]}`;
    const { values, choiceFailed } = await identifyValues(options.catalog, aiAnalysis.biomarkers, {
      learned: options.learnedTests,
      choose: (requests) => {
        options.onProgress?.(choosing, 0.9);
        return provider.chooseTests(requests, {
          signal: options.signal,
          rateLimit: {
            onWait: () => options.onProgress?.(RATE_LIMIT_STAGE, 0.9),
            onResume: () => options.onProgress?.(choosing, 0.9),
          },
        });
      },
    });
    if (choiceFailed) warnings.push(CHOICE_FAILED_NOTE);

    // Deduplicate values reported in two units
    const deduplicationResult = deduplicateBiomarkers(values, options.catalog);
    matchedBiomarkers = deduplicationResult.deduplicated;
    duplicateConflicts = deduplicationResult.conflicts;

    const unidentified = matchedBiomarkers.filter(needsTest).length;
    if (unidentified > 0) warnings.push(unidentifiedNote(unidentified));

    if (duplicateConflicts.length > 0) {
      warnings.push(
        `${duplicateConflicts.length} biomarker(s) have conflicting duplicate values that need review`
      );
    }

    completeStage(matchingStage);
  } catch (error) {
    failStage(matchingStage, error);
    // Non-fatal - continue with values whose tests the user chooses
    matchedBiomarkers = aiAnalysis.biomarkers.map((b) =>
      asAnalyzed(b, { candidates: [], identificationFlags: ['not-identified'] })
    );
    warnings.push('Test identification encountered errors');
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

/** "Analyzing with OpenAI gpt-4o-mini": the provider, and the model when one was chosen */
function analyzingLabel(provider: AIProviderType, model: string | undefined): string {
  return `Analyzing with ${AI_PROVIDER_NAMES[provider]}${model ? ` ${model}` : ''}`;
}

/**
 * Deduplicate biomarkers reported more than once, as labs do when they give
 * a value in two units (SI and conventional).
 *
 * Values of one test (see sameTestKey: a code's mass and molar forms are
 * one test, its 24-hour urine and serum codes are not; a value with no code
 * is one test only with values of its name in its unit) that are the same
 * measurement after conversion are kept once, in the standard unit when one
 * of them is in it. Distinct measurements reported under distinct names (a
 * 24-hour and a spot sample) are each kept, and so are values of one name
 * whose codes differ and cannot be compared: nothing says they are one.
 * Anything else is flagged for the user to review.
 */
function deduplicateBiomarkers(
  biomarkers: MatchedBiomarker[],
  catalog: Catalog
): { deduplicated: MatchedBiomarker[]; conflicts: DuplicateConflict[] } {
  const conflicts: DuplicateConflict[] = [];
  const deduplicated: MatchedBiomarker[] = [];

  for (const group of groupBySameTest(biomarkers, catalog)) {
    if (group.length === 1) {
      deduplicated.push(group[0]);
      continue;
    }

    const settled = settleGroup(group, catalog);
    if (settled.settled) {
      deduplicated.push(...settled.kept);
      continue;
    }

    const { values } = settled;
    const { canonicalUnit } = settled.unit;
    const code = group[0].loincCode;
    const name = (code && catalog.test(code)?.name) || group[0].name;
    const units = [...new Set(group.map((b) => b.unit))];
    const uncomparable = values.some((v) => v.comparison === undefined);
    const conflict: DuplicateConflict = {
      biomarkerName: name,
      originalValues: values.map((v) => ({
        value: v.biomarker.value,
        unit: v.biomarker.unit,
        convertedValue: canonicalUnit ? v.converted : undefined,
        convertedUnit: canonicalUnit && v.converted !== undefined ? canonicalUnit : undefined,
      })),
      message:
        uncomparable
          ? `"${name}" is reported in ${units.slice(0, -1).join(', ')} and in ${units.at(-1)}, ` +
            'which cannot be converted to each other. Keep the value you want and delete the other.'
          : `Conflicting values found for "${name}": ` +
            values
              .map(
                (v) =>
                  `${v.biomarker.value} ${v.biomarker.unit}` +
                  (canonicalUnit && v.converted !== undefined
                    ? ` (=${v.converted} ${canonicalUnit})`
                    : '')
              )
              .join(' vs ') +
            '. Please review and keep the correct value.',
    };
    conflicts.push(conflict);
    for (const value of values) {
      deduplicated.push({ ...value.biomarker, hasDuplicateConflict: true });
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

  // Tests found without asking (learned, or the one test that fits) add to the confidence
  const exactMatchRatio =
    biomarkers.filter(isFoundWithoutAsking).length / biomarkers.length;

  if (exactMatchRatio > 0) {
    const aiConfidenceWeight = 0.3;
    const matchConfidenceWeight = 0.4;
    const exactMatchWeight = 0.3;

    return (
      aiAnalysis.overallConfidence * aiConfidenceWeight +
      avgBiomarkerConfidence * matchConfidenceWeight +
      exactMatchRatio * exactMatchWeight
    );
  } else {
    // None found without asking: rely on AI and biomarker confidence
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
