/**
 * JSON Import Service
 *
 * Imports backup data from JSON format.
 */

import {
  legacyUnknownKeyMapping,
  migrateNoteRecord,
  migratePreferenceMaps,
  migrateTestValueRecord,
  reconcileTestValueKey,
  refileMisfiledPreferences,
  refileMisfiledValue,
  remapBiomarkerKey,
  remapPreferenceMaps,
} from '@data/migrations/biomarkerKeyMigration';
import type { LabResult, TestValue, UserNote, Settings, UserPreferences } from '@/types';
import {
  type BackupData,
  BACKUP_SCHEMA_VERSION,
  isValidBackupData,
} from '../export/jsonExport';

/**
 * Import mode options
 */
export type ImportMode = 'replace' | 'merge';

/**
 * Options for JSON import
 */
export interface JsonImportOptions {
  /** How to handle existing data */
  mode: ImportMode;
  /** Whether to import settings */
  importSettings?: boolean;
  /** Whether to import preferences */
  importPreferences?: boolean;
}

/**
 * Result of import operation
 */
export interface ImportResult {
  success: boolean;
  error?: string;
  stats: {
    labResultsImported: number;
    testValuesImported: number;
    notesImported: number;
    settingsImported: boolean;
    preferencesImported: boolean;
  };
}

/**
 * Parsed and validated backup data ready for import
 */
export interface ParsedBackupData {
  labResults: LabResult[];
  testValues: TestValue[];
  userNotes: UserNote[];
  settings: Partial<Settings> | null;
  userPreferences: UserPreferences | null;
  schemaVersion: number;
  exportedAt: Date;
}

/**
 * Parse a date string or return as-is if already a Date
 */
function parseDate(value: Date | string): Date {
  if (value instanceof Date) {
    return value;
  }
  return new Date(value);
}

/** Serialized data structure (dates as strings) */
interface SerializedLabResult extends Omit<LabResult, 'date' | 'createdAt' | 'updatedAt'> {
  date: string;
  createdAt: string;
  updatedAt: string;
}

interface SerializedTestValue extends Omit<TestValue, 'createdAt' | 'updatedAt'> {
  createdAt: string;
  updatedAt: string;
}

interface SerializedUserNote extends Omit<UserNote, 'createdAt' | 'updatedAt'> {
  createdAt: string;
  updatedAt: string;
}

/**
 * Deserialize lab result from backup
 * Note: We preserve the original id for mapping purposes during restore.
 * The id will be stripped when actually inserting into the database.
 */
function deserializeLabResult(data: SerializedLabResult): LabResult {
  return {
    ...data,
    // Keep original id for mapping during restore (will be stripped on insert)
    id: data.id,
    date: parseDate(data.date),
    createdAt: parseDate(data.createdAt),
    updatedAt: parseDate(data.updatedAt),
  };
}

/**
 * Deserialize test value from backup
 * Note: We preserve original ids for mapping purposes during restore.
 */
function deserializeTestValue(data: SerializedTestValue): TestValue {
  return {
    ...data,
    // Keep original id for reference (will be stripped on insert)
    id: data.id,
    // Keep labResultId for mapping (will be updated during restore)
    labResultId: data.labResultId,
    createdAt: parseDate(data.createdAt),
    updatedAt: parseDate(data.updatedAt),
  };
}

/**
 * Deserialize user note from backup
 * Note: We preserve original ids for reference during restore.
 */
function deserializeUserNote(data: SerializedUserNote): UserNote {
  return {
    ...data,
    // Keep original id for reference (will be stripped on insert)
    id: data.id,
    // Keep labResultId for mapping (may need to be updated during restore)
    labResultId: data.labResultId,
    createdAt: parseDate(data.createdAt),
    updatedAt: parseDate(data.updatedAt),
  };
}

/**
 * Migrate backup data from older schema versions to the current one
 */
export function migrateBackupData<T extends BackupData>(data: T): T {
  let migrated = { ...data };

  if (migrated.schemaVersion < 2) {
    // v1 referenced biomarkers by their position in the dictionary
    const testValues = migrated.testValues.map(migrateTestValueRecord);
    // Unknown biomarkers had hash IDs; rawText is plaintext in a backup, so
    // give them the key their name gets today
    const unknownKeys = legacyUnknownKeyMapping(testValues);
    const userPreferences = migrated.userPreferences
      ? remapPreferenceMaps(migratePreferenceMaps(migrated.userPreferences), unknownKeys)
      : migrated.userPreferences;
    migrated = {
      ...migrated,
      testValues: testValues.map(reconcileTestValueKey),
      userNotes: migrated.userNotes.map((note) =>
        remapBiomarkerKey(migrateNoteRecord(note), unknownKeys)
      ),
      userPreferences,
      schemaVersion: 2,
    };
  }

  if (migrated.schemaVersion < 3) {
    // Urea was filed as blood urea nitrogen, and urine red cell counts as
    // urine blood, before each had its own entry
    migrated = {
      ...migrated,
      testValues: migrated.testValues.map(refileMisfiledValue),
      userPreferences: migrated.userPreferences
        ? refileMisfiledPreferences(migrated.userPreferences)
        : migrated.userPreferences,
      schemaVersion: 3,
    };
  }

  return migrated;
}

export function parseBackupJson(jsonString: string): ParsedBackupData {
  let data: unknown;

  try {
    data = JSON.parse(jsonString);
  } catch {
    throw new Error('Invalid JSON format');
  }

  if (!isValidBackupData(data)) {
    throw new Error('Invalid backup file structure');
  }

  // Check schema version compatibility
  if (data.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new Error(
      `Backup was created with a newer version (v${data.schemaVersion}). ` +
        `Current version supports up to v${BACKUP_SCHEMA_VERSION}.`
    );
  }

  // Migrate if needed
  const migrated = migrateBackupData(data);

  // Deserialize data (cast since JSON parsing gives strings for dates)
  return {
    labResults: migrated.labResults.map((lr) =>
      deserializeLabResult(lr as unknown as SerializedLabResult)
    ),
    testValues: migrated.testValues.map((tv) =>
      deserializeTestValue(tv as unknown as SerializedTestValue)
    ),
    userNotes: migrated.userNotes.map((note) =>
      deserializeUserNote(note as unknown as SerializedUserNote)
    ),
    settings: migrated.settings,
    userPreferences: migrated.userPreferences,
    schemaVersion: migrated.schemaVersion,
    exportedAt: new Date(migrated.exportedAt),
  };
}

/**
 * Read a file and return its contents as string
 */
export async function readBackupFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file as text'));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsText(file);
  });
}

/**
 * Validate file before import
 */
export function validateBackupFile(file: File): { valid: boolean; error?: string } {
  // Check file type
  if (!file.name.endsWith('.json')) {
    return { valid: false, error: 'File must be a JSON file' };
  }

  // Check file size (max 50MB)
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    return { valid: false, error: 'File is too large (max 50MB)' };
  }

  return { valid: true };
}

/**
 * Create ID mapping for imported lab results
 * Maps old IDs to new IDs
 */
export function createIdMapping(
  originalData: { id?: number }[],
  newIds: number[]
): Map<number, number> {
  const mapping = new Map<number, number>();

  for (let i = 0; i < originalData.length; i++) {
    const oldId = originalData[i].id;
    if (oldId !== undefined && newIds[i] !== undefined) {
      mapping.set(oldId, newIds[i]);
    }
  }

  return mapping;
}

/**
 * Update references in test values after lab results import
 */
export function updateTestValueReferences(
  testValues: TestValue[],
  labResultIdMapping: Map<number, number>
): TestValue[] {
  return testValues.map((tv) => ({
    ...tv,
    labResultId: labResultIdMapping.get(tv.labResultId) ?? tv.labResultId,
  }));
}

/**
 * Update references in notes after lab results import
 */
export function updateNoteReferences(
  notes: UserNote[],
  labResultIdMapping: Map<number, number>
): UserNote[] {
  return notes.map((note) => ({
    ...note,
    labResultId: note.labResultId !== undefined
      ? labResultIdMapping.get(note.labResultId) ?? note.labResultId
      : undefined,
  }));
}

/**
 * Get import preview information
 */
export function getImportPreview(data: ParsedBackupData): {
  labResultCount: number;
  testValueCount: number;
  noteCount: number;
  hasSettings: boolean;
  hasPreferences: boolean;
  exportedAt: Date;
  schemaVersion: number;
} {
  return {
    labResultCount: data.labResults.length,
    testValueCount: data.testValues.length,
    noteCount: data.userNotes.length,
    hasSettings: data.settings !== null,
    hasPreferences: data.userPreferences !== null,
    exportedAt: data.exportedAt,
    schemaVersion: data.schemaVersion,
  };
}
