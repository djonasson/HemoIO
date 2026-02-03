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
  biomarkerId: number;
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

// Reference data about a type of test
export interface Biomarker {
  id?: number;
  name: string;
  category: BiomarkerCategory;
  canonicalUnit: string;
  alternativeUnits: string[];
  description?: string;
}

export type BiomarkerCategory =
  | 'cbc'
  | 'metabolic'
  | 'lipid'
  | 'thyroid'
  | 'iron'
  | 'vitamin'
  | 'urinalysis'
  | 'fertility'
  | 'other';

/**
 * Specimen/matrix type for biomarker measurements
 * Indicates the biological sample type used for the test
 */
export type SpecimenType =
  | 'serum'       // S- prefix (blood serum after clotting)
  | 'plasma'      // P- prefix (blood plasma with anticoagulant)
  | 'urine'       // U- prefix (spot urine sample)
  | 'urine-24h'   // 24-hour urine collection
  | 'whole-blood' // Sg- prefix (whole blood, e.g., HbA1c)
  | 'capillary'   // Finger-prick blood
  | 'saliva'
  | 'csf'         // Cerebrospinal fluid
  | 'stool'
  | 'semen'       // Semen analysis
  | 'other';

// User's display preferences
export interface UserPreferences {
  id?: number;
  unitPreferences: Record<number, string>; // biomarkerId -> preferred unit
  personalTargets: Record<number, { low?: number; high?: number }>; // biomarkerId -> target range
  theme: 'light' | 'dark' | 'system';
}

// Application settings
export interface Settings {
  id?: number;
  storageProvider: StorageProviderType;
  aiProvider: AIProviderType;
  aiApiKey?: string; // Stored encrypted
  language: string;
}

export type StorageProviderType = 'local' | 'dropbox' | 'googledrive';
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
  biomarkerId?: number;
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
