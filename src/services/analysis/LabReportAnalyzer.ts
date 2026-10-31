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
import { MODEL_LOAD_NOTE } from '../matching/notes';
import {
  identifyByKey,
  identifyByPrintedName,
  identifyByModel,
  notIdentified,
  proposedTest,
} from './nameMatching';
import type {
  AIProviderConfig,
  AIProviderType,
  LabReportAnalysisResult,
  ExtractedBiomarker,
} from '../ai';
import type { BiomarkerDefinition } from '../../data/biomarkers/dictionary';
import { normalizeUnit, canConvert, convertValue, unitsMatch } from '../units';

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
  /** Set while its unit is the standard unit of the test the name typed in review is */
  unitFromName?: boolean;
  /**
   * The value as the analyzer read it. Review identifies an edited value
   * from this and its current name and unit, so nothing typed on the way
   * counts: the printed name and unit, and the test the matching model
   * chose for that name.
   */
  analyzed?: AnalyzedValue;
  /** How its test was chosen: by the AI, the printed name, the matching model or the user */
  identifiedBy?: IdentifiedBy;
  /** Checks the identification needs; absent means none (manual rows, fixtures) */
  identificationFlags?: IdentificationFlag[];
  /** With 'name-disagrees': the test the printed name is an exact alias of */
  nameSuggests?: BiomarkerDefinition;
  /** The user chose "Not in dictionary": saved under the unknown key of its name */
  savedAsUnknown?: boolean;
}

export type IdentifiedBy = 'ai' | 'name' | 'model' | 'user';

/** What the analyzer read a value as */
export interface AnalyzedValue {
  /** The name as printed */
  name: string;
  /** The unit as the report gave it ('' for a screening value) */
  unit: string;
  /** The test the matching model chose for the printed name */
  modelMatch?: BiomarkerDefinition;
}

/** What review asks the user to check about a value's test */
export type IdentificationFlag =
  | 'unit-mismatch'
  | 'name-disagrees'
  | 'name-only'
  | 'similar-name'
  | 'not-identified'
  | 'no-unit';

/** Names matched after the dictionary's own aliases: learned aliases, then the model */
export interface NameFallback {
  /** A learned alias of the printed name */
  learned?: (name: string) => BiomarkerDefinition | undefined;
  /** Tests whose names mean the same as the printed name, closest first */
  similar?: (name: string) => Promise<BiomarkerDefinition[]>;
}

export const NO_KEYS_NOTE =
  'This model did not identify the tests; they were matched by name. Check the Saved as column.';

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
  /** How names no dictionary alias knows are matched */
  nameFallback?: NameFallback;
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

  try {
    startStage(aiStage);

    const provider = getAIProvider(options.aiProvider, options.aiConfig);
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

  // Stage 4: Biomarker Matching
  const matchingStage = createStage('Biomarker Matching');
  stages.push(matchingStage);
  options.onProgress?.('Matching biomarkers', 0.9);

  let matchedBiomarkers: MatchedBiomarker[];
  let duplicateConflicts: DuplicateConflict[] = [];

  try {
    startStage(matchingStage);

    const model = { failed: false };
    const initialMatches = await Promise.all(
      aiAnalysis.biomarkers.map((biomarker) =>
        matchBiomarkerToDictionary(biomarker, options.nameFallback, model)
      )
    );
    if (model.failed) warnings.push(MODEL_LOAD_NOTE);

    // Deduplicate biomarkers with different units
    const deduplicationResult = deduplicateBiomarkers(initialMatches);
    matchedBiomarkers = deduplicationResult.deduplicated;
    duplicateConflicts = deduplicationResult.conflicts;

    // The values review shows as not in the dictionary (a test the AI
    // proposed is labelled instead)
    const unmatchedCount = matchedBiomarkers.filter(
      (b) => !b.dictionaryMatch && !proposedTest(b)
    ).length;
    if (unmatchedCount > 0) {
      warnings.push(
        `${unmatchedCount} biomarker(s) could not be matched to the dictionary`
      );
    }
    if (aiAnalysis.biomarkers.length > 0 && aiAnalysis.biomarkers.every((b) => !b.biomarkerKey)) {
      warnings.push(NO_KEYS_NOTE);
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

/** "Analyzing with OpenAI gpt-4o-mini": the provider, and the model when one was chosen */
function analyzingLabel(provider: AIProviderType, model: string | undefined): string {
  return `Analyzing with ${AI_PROVIDER_NAMES[provider]}${model ? ` ${model}` : ''}`;
}

/**
 * Choose an extracted value's test, first that applies: the AI's key when
 * the dictionary has it and the unit fits (only proposed when the unit does
 * not fit); else the printed name, a learned alias, then the matching model,
 * each only with a fitting unit. Flags say what review should check.
 */
async function matchBiomarkerToDictionary(
  biomarker: ExtractedBiomarker,
  fallback: NameFallback = {},
  model: { failed: boolean } = { failed: false }
): Promise<MatchedBiomarker> {
  const value = { ...biomarker, analyzed: { name: biomarker.name, unit: biomarker.unit } };
  const identified =
    identifyByKey(value, fallback.learned) ?? identifyByPrintedName(value, fallback.learned);
  if (identified) return identified;

  let closest: BiomarkerDefinition | undefined;
  try {
    [closest] = (await fallback.similar?.(biomarker.name)) ?? [];
  } catch {
    // The matching model could not load: the value is not identified, the notes say why
    model.failed = true;
  }
  // Only the closest test, read with the unit (a count's name in % is its
  // percentage): one rejected by its unit is a reason to doubt the match
  const byModel =
    closest && identifyByModel({ ...value, analyzed: { ...value.analyzed, modelMatch: closest } }, closest);
  return byModel?.dictionaryMatch ? byModel : notIdentified(value);
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
 * Half the last reported digit: how far rounding can have moved a value. A
 * small whole value counts as printed with one decimal (an HbA1c "6.0 %"
 * reaches the analyzer as 6): labs print small values with decimals.
 */
function roundingAllowance(value: number): number {
  const decimals = (String(value).split('.')[1] ?? '').length;
  const printed = decimals === 0 && Math.abs(value) < 10 ? 1 : decimals;
  return 0.5 * 10 ** -printed;
}

/** A value of a group, in the canonical unit when it could be converted */
interface ComparableValue {
  biomarker: MatchedBiomarker;
  /** Unrounded value in the canonical unit (rounding before comparing adds error) */
  comparison?: number;
  /** Rounded value in the canonical unit, shown in conflict messages */
  converted?: number;
  /** How far the lab's rounding can have moved the value, in the canonical unit */
  allowance: number;
}

/**
 * Whether two values are the same measurement, reported in the same or
 * different units.
 *
 * The tolerance is relative: an absolute allowance would treat small values
 * that differ substantially (e.g. creatinine 0.76 vs 1.5 mg/dL) as the same.
 * Values reported in different units may also differ by the rounding of each
 * (urea 3.06 mmol/L is 18.4 mg/dL, reported as 18). Anything outside is
 * flagged for review rather than merged: a borderline difference costs a
 * review, not data.
 */
function sameMeasurement(a: ComparableValue, b: ComparableValue): boolean {
  if (a.comparison === undefined || b.comparison === undefined) return false;
  if (a.comparison === b.comparison) return true;
  const diff = Math.abs(a.comparison - b.comparison);
  const avg = (Math.abs(a.comparison) + Math.abs(b.comparison)) / 2;
  if (avg > 0 && diff / avg <= RELATIVE_TOLERANCE) return true;
  const differentUnits = !unitsMatch(a.biomarker.unit, b.biomarker.unit);
  return differentUnits && diff <= a.allowance + b.allowance;
}

/**
 * A group's value in the unit its values are compared in: the canonical
 * unit when the biomarker has one, else the unit the group's first value is
 * in (values in another unit then cannot be compared)
 */
function comparable(
  biomarker: MatchedBiomarker,
  name: string,
  canonicalUnit: string | undefined,
  firstUnit: string
): ComparableValue {
  const unchanged = {
    biomarker,
    comparison: biomarker.value,
    converted: biomarker.value,
    allowance: roundingAllowance(biomarker.value),
  };
  const targetUnit = canonicalUnit ?? firstUnit;
  if (unitsMatch(biomarker.unit, targetUnit)) return unchanged;
  if (!canonicalUnit || !canConvert(name, biomarker.unit, canonicalUnit)) {
    return { biomarker, allowance: 0 };
  }
  try {
    const convert = (value: number, precision?: number) =>
      convertValue(name, value, biomarker.unit, canonicalUnit, precision).convertedValue;
    const comparison = convert(biomarker.value, COMPARISON_PRECISION);
    const step = roundingAllowance(biomarker.value);
    return {
      biomarker,
      comparison,
      converted: convert(biomarker.value),
      allowance: Math.abs(convert(biomarker.value + step, COMPARISON_PRECISION) - comparison),
    };
  } catch {
    return { biomarker, allowance: 0 };
  }
}

/**
 * Deduplicate biomarkers reported more than once, as labs do when they give
 * a value in two units (SI and conventional).
 *
 * Values of one biomarker that are the same measurement after conversion
 * are kept once, in the canonical unit when one of them is in it. Distinct
 * measurements reported under distinct names (a 24-hour and a spot sample)
 * are each kept. Anything else is flagged for the user to review.
 */
function deduplicateBiomarkers(
  biomarkers: MatchedBiomarker[]
): { deduplicated: MatchedBiomarker[]; conflicts: DuplicateConflict[] } {
  const conflicts: DuplicateConflict[] = [];

  // Group biomarkers by their dictionary entry, else by the name as reported
  const groups = new Map<string, MatchedBiomarker[]>();
  for (const biomarker of biomarkers) {
    // A proposal whose unit does not fit is not the same measurement as a
    // confirmed value of that test: it is reviewed on its own
    const proposal = biomarker.identificationFlags?.includes('unit-mismatch');
    const groupKey =
      biomarker.dictionaryMatch?.name ||
      (biomarker.suggestedMatch && `${biomarker.suggestedMatch.name}${proposal ? ' (proposed)' : ''}`) ||
      biomarker.name.toLowerCase().trim();
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey)!.push(biomarker);
  }

  const deduplicated: MatchedBiomarker[] = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      deduplicated.push(group[0]);
      continue;
    }

    const definition = group[0].dictionaryMatch || group[0].suggestedMatch;
    const name = definition?.name ?? group[0].name;
    const canonicalUnit = definition?.canonicalUnit;
    const values = group.map((b) => comparable(b, name, canonicalUnit, group[0].unit));

    // Values that are the same measurement form one cluster
    const clusters: ComparableValue[][] = [];
    for (const value of values) {
      const cluster = clusters.find((c) => sameMeasurement(c[0], value));
      if (cluster) cluster.push(value);
      else clusters.push([value]);
    }

    const reportedName = (value: ComparableValue) => value.biomarker.name.toLowerCase().trim();
    const namesPerCluster = clusters.map((c) => new Set(c.map(reportedName)));
    const distinctNames = namesPerCluster.every(
      (names, i) =>
        names.size === 1 &&
        namesPerCluster.every((other, j) => i === j || !other.has([...names][0]))
    );
    const uncomparable = values.some((v) => v.comparison === undefined);

    if (clusters.length === 1 || (distinctNames && !uncomparable)) {
      for (const cluster of clusters) {
        const preferred =
          cluster.find((v) => canonicalUnit !== undefined && unitsMatch(v.biomarker.unit, canonicalUnit)) ??
          cluster[0];
        deduplicated.push(preferred.biomarker);
      }
      continue;
    }

    const units = [...new Set(group.map((b) => b.unit))];
    const conflict: DuplicateConflict = {
      biomarkerName: name,
      originalValues: values.map((v) => ({
        value: v.biomarker.value,
        unit: v.biomarker.unit,
        convertedValue: canonicalUnit ? v.converted : undefined,
        convertedUnit: canonicalUnit && v.converted !== undefined ? canonicalUnit : undefined,
      })),
      valuesMatch: false,
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
      deduplicated.push({ ...value.biomarker, hasDuplicateConflict: true, duplicateConflict: conflict });
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
