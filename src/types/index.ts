/**
 * Core type definitions for HemoIO
 */

// Re-export backup types
export type {
  BackupType,
  EncryptionMetadata,
  EncryptedBackupFile,
  FullBackupData,
  FullSettingsData,
  EncryptedExportOptions,
  EncryptedImportOptions,
  BackupTypeDetectionResult,
} from './backup';

export {
  ENCRYPTED_BACKUP_EXTENSION,
  STANDARD_BACKUP_EXTENSION,
  ENCRYPTED_BACKUP_SCHEMA_VERSION,
  ENCRYPTED_BACKUP_TYPE_ID,
  isEncryptedBackupFile,
} from './backup';

// Value types for qualitative results
export type QualitativeType = 'boolean' | 'ordinal' | 'descriptive';

// Value types for numeric results
export type NumericValueType = 'single' | 'interval';

// A single lab report/visit
export interface LabResult {
  id?: number;
  date: Date;
  labName: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Individual test measurement within a lab result
export interface TestValue {
  id?: number;
  labResultId: number;
  /** The test's LOINC code, or an "unknown:" key for a value saved as not a LOINC test */
  biomarkerKey: string;
  value: number | string | boolean;
  unit: string;
  referenceRangeLow?: number;
  referenceRangeHigh?: number;
  /** Analytical method used for measurement (e.g., "Enzymatic", "HPLC", "Immunoassay") */
  method?: string;
  qualitativeType?: QualitativeType;
  ordinalValue?: number;
  /**
   * Type of numeric value: 'single' for exact values, 'interval' for ranges like "5-10"
   * When 'interval', the value field contains the midpoint and intervalLow/High contain bounds
   */
  numericValueType?: NumericValueType;
  /** Lower bound for interval values (e.g., 5 for "5-10 eritrociti per campo") */
  intervalLow?: number;
  /** Upper bound for interval values (e.g., 10 for "5-10 eritrociti per campo") */
  intervalHigh?: number;
  rawText?: string;
  confidence?: number;
  createdAt: Date;
  updatedAt: Date;
}

// User's display preferences
export interface UserPreferences {
  id?: number;
  unitPreferences: Record<string, string>; // test key (see testKey) -> preferred unit
  personalTargets: Record<string, { low?: number; high?: number }>; // test key -> target range
  /** Per test key: alerts dated on or before this ISO date are acknowledged */
  acknowledgedAlerts?: Record<string, string>;
  /** The tests the user taught: a lab's wording and unit (learned key) -> LOINC code or unknown key */
  learnedTests?: Record<string, string>;
  theme: 'light' | 'dark' | 'system';
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
}

// Application settings
export interface Settings {
  id?: number;
  storageProvider: StorageProviderType;
  aiProvider: AIProviderType;
  aiApiKey?: string; // Stored encrypted
  ollamaModel?: string;
  openaiModel?: string;
  anthropicModel?: string;
  language: string;
}

export type StorageProviderType = 'local' | 'filesystem' | 'dropbox' | 'googledrive';
export type AIProviderType = 'openai' | 'anthropic' | 'ollama';

// AI analysis types
export interface ValueWithConfidence<T> {
  value: T;
  confidence: number;
}

export interface ExtractedValue {
  biomarkerName: string;
  value: string | number;
  unit: string;
  referenceRange?: { low?: number; high?: number };
  confidence: number;
  rawText: string;
  /** For interval values like "5-10", contains the bounds */
  interval?: { low: number; high: number };
}

export interface AnalysisResult {
  labDate: ValueWithConfidence<Date>;
  labName: ValueWithConfidence<string>;
  values: ExtractedValue[];
}

// Storage provider interface
export interface StorageProvider {
  save(data: ArrayBuffer): Promise<void>;
  load(): Promise<ArrayBuffer>;
  exists(): Promise<boolean>;
}

// AI provider interface
export interface AIProvider {
  analyzeLabReport(extractedText: string): Promise<AnalysisResult>;
}

// User notes attached to lab results or biomarker values
export interface UserNote {
  id?: number;
  /** The lab result this note is attached to (optional) */
  labResultId?: number;
  /** The biomarker this note relates to (optional) */
  biomarkerKey?: string;
  /** The specific test value this note is attached to (optional) */
  testValueId?: number;
  /** The note content (may include markdown) */
  content: string;
  /** Tags for categorization */
  tags: string[];
  /** When the note was created */
  createdAt: Date;
  /** When the note was last updated */
  updatedAt: Date;
}

/** How many stored records the session key cannot open, kept aside */
export interface SetAsideSummary {
  total: number;
  /** Those not yet in a downloaded file */
  unsaved: number;
}
