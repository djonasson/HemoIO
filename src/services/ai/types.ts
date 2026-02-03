/**
 * AI Service Types
 *
 * Type definitions for AI provider integrations used in lab report analysis.
 */

/**
 * Supported AI providers
 */
export type AIProviderType = 'openai' | 'anthropic' | 'ollama';

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
    unit: string;
  };
  /** Analytical method used for measurement (e.g., "Enzymatic", "HPLC", "Immunoassay") */
  method?: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Additional notes or flags from the lab */
  notes?: string;
  /** Whether this value was flagged as abnormal in the report */
  flaggedAbnormal?: boolean;
  /** Whether this is an interval value (e.g., "5-10 eritrociti per campo") */
  isInterval?: boolean;
  /** Lower bound for interval values */
  intervalLow?: number;
  /** Upper bound for interval values */
  intervalHigh?: number;
  /** Raw value string before parsing (e.g., "5 - 10") */
  rawValue?: string;
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
