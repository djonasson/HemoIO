/**
 * JSON Import Service
 *
 * Imports backup data from JSON format.
 */

import { isUnknownKey } from '@data/loinc/keys';
import {
  BACKUP_SCHEMA_VERSION,
  isValidBackupData,
} from '../export/jsonExport';
import type {
  CensoredComparator,
  LabFlag,
  LabResult,
  NumericValueType,
  TestValue,
  UserNote,
  Settings,
  UserPreferences,
} from '@/types';

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
 * Parse a date string or return as-is if already a Date. A missing, null or
 * unreadable value gives an invalid Date, never 1970 (new Date(null)).
 */
export function parseDate(value: unknown): Date {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    return new Date(NaN);
  }
  return new Date(value);
}

function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

/**
 * The two stamps of a record. An invalid createdAt is repaired from
 * updatedAt, else the backup's exportedAt, else the restore time; an invalid
 * updatedAt from createdAt. A record is never refused for them.
 */
function parseStamps(
  data: { createdAt: unknown; updatedAt: unknown },
  exportedAt: Date
): { createdAt: Date; updatedAt: Date } {
  const updated = parseDate(data.updatedAt);
  let createdAt = parseDate(data.createdAt);
  if (!isValidDate(createdAt)) {
    createdAt = isValidDate(updated) ? updated : isValidDate(exportedAt) ? exportedAt : new Date();
  }
  return { createdAt, updatedAt: isValidDate(updated) ? updated : createdAt };
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
function deserializeLabResult(data: SerializedLabResult, exportedAt: Date): LabResult {
  return {
    ...data,
    // Keep original id for mapping during restore (will be stripped on insert)
    id: data.id,
    // Kept as it is, valid or not: an undated result is listed under "No date"
    date: parseDate(data.date),
    ...parseStamps(data, exportedAt),
  };
}

const LAB_FLAGS: readonly LabFlag[] = ['high', 'low', 'abnormal'];
const CENSORED_COMPARATORS: readonly CensoredComparator[] = ['<', '<=', '>', '>='];
const NUMERIC_VALUE_TYPES: readonly NumericValueType[] = ['single', 'interval'];

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

/**
 * Deserialize test value from backup
 * Note: We preserve original ids for mapping purposes during restore.
 */
function deserializeTestValue(data: SerializedTestValue, exportedAt: Date): TestValue {
  const { labFlag, censored, numericValueType, ...rest } = data;
  return {
    ...rest,
    // A mark, comparator or kind the app does not know is dropped: shown, it
    // could break the page, and compared, it would mislead
    ...(isOneOf(labFlag, LAB_FLAGS) ? { labFlag } : {}),
    ...(isOneOf(censored, CENSORED_COMPARATORS) ? { censored } : {}),
    ...(isOneOf(numericValueType, NUMERIC_VALUE_TYPES) ? { numericValueType } : {}),
    // Keep original id for reference (will be stripped on insert)
    id: data.id,
    // Keep labResultId for mapping (will be updated during restore)
    labResultId: data.labResultId,
    ...parseStamps(data, exportedAt),
  };
}

/**
 * Deserialize user note from backup
 * Note: We preserve original ids for reference during restore.
 */
function deserializeUserNote(data: SerializedUserNote, exportedAt: Date): UserNote {
  return {
    ...data,
    // Keep original id for reference (will be stripped on insert)
    id: data.id,
    // Keep labResultId for mapping (may need to be updated during restore)
    labResultId: data.labResultId,
    ...parseStamps(data, exportedAt),
  };
}

/** Why a backup or folder copy of a version before LOINC codes cannot be restored */
export const PRE_LOINC_BACKUP_MESSAGE =
  'This backup was made before tests were identified by LOINC and cannot be restored. Re-import your reports instead.';

/** The first backup version whose values are identified by LOINC code */
const FIRST_LOINC_BACKUP_VERSION = 4;

/** Whether a backup or folder copy of this version was made before LOINC codes */
export function isPreLoincBackupVersion(schemaVersion: number): boolean {
  return schemaVersion < FIRST_LOINC_BACKUP_VERSION;
}

/** A LOINC code: up to seven digits, a dash and a check digit ("2345-7") */
const LOINC_CODE = /^\d{1,7}-\d$/;

/** Why a backup holding a key that is no test's cannot be restored */
export const UNKNOWN_KEY_BACKUP_MESSAGE =
  'This backup holds values of tests HemoIO does not know, so it was not restored. It may be damaged.';

/** Whether a stored key is one HemoIO writes: a LOINC code, or the unknown key of a name */
function isStoredTestKey(key: unknown): boolean {
  return typeof key === 'string' && (LOINC_CODE.test(key) || (isUnknownKey(key) && key.length > 'unknown:'.length));
}

/**
 * Refuse a backup whose values (or notes on a test) name a test by anything
 * but a LOINC code or an unknown key: such a key would reach every screen
 * that looks a test up, and no HemoIO wrote it
 */
export function assertKnownTestKeys(data: { testValues: unknown[]; userNotes: unknown[] }): void {
  const valueKeys = data.testValues.map((tv) => (tv as { biomarkerKey?: unknown }).biomarkerKey);
  const noteKeys = data.userNotes
    .map((note) => (note as { biomarkerKey?: unknown }).biomarkerKey)
    .filter((key) => key !== undefined && key !== null);
  if (![...valueKeys, ...noteKeys].every(isStoredTestKey)) {
    throw new Error(UNKNOWN_KEY_BACKUP_MESSAGE);
  }
}

/**
 * Refuse a backup this version cannot restore: one made before tests were
 * identified by LOINC, or by a newer version
 */
export function assertSupportedBackupVersion(schemaVersion: number): void {
  if (isPreLoincBackupVersion(schemaVersion)) {
    throw new Error(PRE_LOINC_BACKUP_MESSAGE);
  }
  if (schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new Error(
      `Backup was created with a newer version (v${schemaVersion}). ` +
        `Current version supports up to v${BACKUP_SCHEMA_VERSION}.`
    );
  }
}

export function parseBackupJson(jsonString: string): ParsedBackupData {
  let data: unknown;

  try {
    data = JSON.parse(jsonString);
  } catch {
    throw new Error('Invalid JSON format');
  }

  return parseBackupData(data);
}

/**
 * Validate and deserialize backup data already parsed from JSON, refusing a
 * version this one cannot restore (dates still strings)
 */
export function parseBackupData(data: unknown): ParsedBackupData {
  if (!isValidBackupData(data)) {
    throw new Error('Invalid backup file structure');
  }

  assertSupportedBackupVersion(data.schemaVersion);
  assertKnownTestKeys(data);

  const exportedAt = parseDate(data.exportedAt);

  // Deserialize data (cast since JSON parsing gives strings for dates)
  return {
    labResults: data.labResults.map((lr) =>
      deserializeLabResult(lr as unknown as SerializedLabResult, exportedAt)
    ),
    testValues: data.testValues.map((tv) =>
      deserializeTestValue(tv as unknown as SerializedTestValue, exportedAt)
    ),
    userNotes: data.userNotes.map((note) =>
      deserializeUserNote(note as unknown as SerializedUserNote, exportedAt)
    ),
    settings: data.settings,
    userPreferences: data.userPreferences,
    schemaVersion: data.schemaVersion,
    exportedAt,
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
