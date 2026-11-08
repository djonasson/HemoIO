/**
 * AI Service Types
 *
 * Type definitions for AI provider integrations used in lab report analysis.
 */

import type { RateLimitOptions } from './rateLimitedFetch';
import type { CensoredComparator, LabFlag } from '@/types';

/**
 * Supported AI providers
 */
export type AIProviderType = 'openai' | 'anthropic' | 'ollama';

/** Each provider's name as shown to the user */
export const AI_PROVIDER_NAMES: Record<AIProviderType, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  ollama: 'Ollama',
};

/**
 * Configuration for AI providers
 */
export interface AIProviderConfig {
  /** API key for the provider (not required for Ollama) */
  apiKey?: string;
  /** Model to use (optional, uses default if not specified) */
  model?: string;
  /** Maximum tokens for response */
  maxTokens?: number;
  /** Temperature for response generation (0-1) */
  temperature?: number;
  /** Base URL override for API (useful for proxies) */
  baseUrl?: string;
}

/**
 * Configuration specific to Ollama provider
 */
export interface OllamaConfig extends Omit<AIProviderConfig, 'apiKey'> {
  /** Base URL for Ollama API (default: http://localhost:11434) */
  baseUrl?: string;
  /** Model for text analysis (e.g., 'llama3.2:8b') */
  model?: string;
  /** Model for vision/image analysis (e.g., 'llava:13b') */
  visionModel?: string;
  /** Enable vision capabilities when available */
  enableVision?: boolean;
  /** Request timeout in milliseconds (default: 120000 for local processing) */
  timeout?: number;
}

/**
 * A single extracted biomarker value from a lab report
 */
export interface ExtractedBiomarker {
  /** Biomarker name as found in the report */
  name: string;
  /**
   * The sample the report names for the value ("urine", "24h urine",
   * "serum", "plasma", "blood"), as the model read it from headings and
   * names; absent when it names none
   */
  specimenHint?: string;
  /**
   * Numeric value. For interval values (e.g., "5-10"), this is the midpoint.
   * The original interval bounds are in intervalLow/intervalHigh.
   */
  value: number;
  /** Unit of measurement */
  unit: string;
  /** Reference range if detected */
  referenceRange?: {
    low?: number;
    high?: number;
    /** The unit it was printed in, only when that is not the value's; else the value's, which it follows */
    unit?: string;
  };
  /** Analytical method used for measurement (e.g., "Enzymatic", "HPLC", "Immunoassay") */
  method?: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Additional notes or flags from the lab */
  notes?: string;
  /** The lab's own high/low mark on the value ("H", "L", "*") */
  labFlag?: LabFlag;
  /** For a censored value ("< 10"), how `value` bounds it */
  censored?: CensoredComparator;
  /** Whether this is an interval value (e.g., "5-10 eritrociti per campo") */
  isInterval?: boolean;
  /** Lower bound for interval values */
  intervalLow?: number;
  /** Upper bound for interval values */
  intervalHigh?: number;
  /** Raw value string before parsing (e.g., "5 - 10") */
  rawValue?: string;
  /**
   * A qualitative result ("Assenti", "Positivo", "++") as printed, with its
   * kind and the number it reads as (see parseQualitativeValue). It holds
   * while `value` is still that number: a value edited to another number is
   * no longer the printed word.
   */
  qualitative?: QualitativeReading;
}

/**
 * A qualitative result as printed, and the number it reads as: absent 0
 * and present 1 (boolean); traces 0.5 and one to four crosses 1-4 (ordinal)
 */
export interface QualitativeReading {
  /** The result as printed ("Assenti", "Tracce", "++") */
  text: string;
  kind: 'boolean' | 'ordinal';
  /** The number it reads as */
  value: number;
}

/**
 * Result of AI analysis of a lab report
 */
export interface LabReportAnalysisResult {
  /** Extracted biomarker values */
  biomarkers: ExtractedBiomarker[];
  /** Detected lab date */
  labDate?: string;
  /** Detected lab/facility name */
  labName?: string;
  /** Patient name if detected */
  patientName?: string;
  /** Overall confidence in the extraction (0-1) */
  overallConfidence: number;
  /** Raw text that was analyzed */
  analyzedText: string;
  /** Any warnings or notes about the analysis */
  warnings: string[];
  /** Model used for analysis */
  modelUsed: string;
  /** Processing time in milliseconds */
  processingTime: number;
}

/**
 * Options for lab report analysis
 */
export interface AnalysisOptions {
  /** Additional context or instructions */
  additionalInstructions?: string;
  /** Language of the report */
  language?: string;
  /** Whether to extract patient info */
  extractPatientInfo?: boolean;
  /** Retry hooks for rate-limited requests (HTTP 429) */
  rateLimit?: RateLimitOptions;
  /** Cancels the request, including any rate-limit wait */
  signal?: AbortSignal;
}

/**
 * A test the AI may choose for a printed value. Structurally the analysis
 * layer's `Candidate` without its score, so the AI layer does not depend on it.
 */
export interface TestCandidate {
  code: string;
  /** LOINC long common name */
  name: string;
}

/** One printed value whose test the AI is asked to choose */
export interface TestChoiceRequest {
  /** Identifies the value in the answer */
  id: string;
  name: string;
  unit: string;
  /** The sample the report section names: "urine", "24h urine" */
  specimenHint?: string;
  candidates: TestCandidate[];
}

/** The AI's choice for one value */
export interface TestChoice {
  id: string;
  /** One of the request's candidate codes, or null when none fits */
  code: string | null;
  /** False when two candidates fit or the model is unsure */
  confident: boolean;
}

/**
 * Interface for AI providers
 */
export interface AIProvider {
  /** Provider type identifier */
  readonly type: AIProviderType;

  /** Provider display name */
  readonly name: string;

  /**
   * Analyze lab report text and extract biomarker values
   *
   * @param text - Lab report text to analyze
   * @param options - Analysis options
   * @returns Analysis result with extracted values
   */
  analyzeLabReport(
    text: string,
    options?: AnalysisOptions
  ): Promise<LabReportAnalysisResult>;

  /**
   * Analyze lab report image directly (optional, for vision-capable providers)
   *
   * @param imageBase64 - Base64-encoded image data
   * @param mimeType - Image MIME type (e.g., 'image/png', 'image/jpeg')
   * @param options - Analysis options
   * @returns Analysis result with extracted values
   */
  analyzeImage?(
    imageBase64: string,
    mimeType: string,
    options?: AnalysisOptions
  ): Promise<LabReportAnalysisResult>;

  /**
   * Check if this provider supports image analysis
   *
   * @returns true if vision/image analysis is available
   */
  supportsVision?(): boolean;

  /**
   * Choose the test each printed value is among its candidates, in one call.
   * An answer that cannot be read is no choice for any value, not an error.
   *
   * @param requests - The values and their candidate tests
   * @param options - Rate-limit hooks and cancellation
   */
  chooseTests(
    requests: TestChoiceRequest[],
    options?: Pick<AnalysisOptions, 'rateLimit' | 'signal'>
  ): Promise<TestChoice[]>;

  /**
   * Validate that the provider is configured correctly
   *
   * @returns true if API key and configuration are valid
   */
  validateConfiguration(): Promise<boolean>;

  /**
   * Test the connection to the AI service
   *
   * @returns true if connection successful
   */
  testConnection(): Promise<boolean>;
}

/**
 * Error thrown when AI analysis fails
 */
export class AIAnalysisError extends Error {
  readonly provider: AIProviderType;
  readonly code?: string;

  constructor(message: string, provider: AIProviderType, code?: string) {
    super(message);
    this.name = 'AIAnalysisError';
    this.provider = provider;
    this.code = code;
  }
}

/**
 * Error thrown when AI configuration is invalid
 */
export class AIConfigurationError extends Error {
  readonly provider: AIProviderType;

  constructor(message: string, provider: AIProviderType) {
    super(message);
    this.name = 'AIConfigurationError';
    this.provider = provider;
  }
}
