/**
 * JSON Export Service
 *
 * Exports all application data to JSON format for backup purposes.
 */

import type { LabResult, TestValue, UserNote, Settings, UserPreferences } from '@/types';

/**
 * Schema version for backup compatibility
 */
export const BACKUP_SCHEMA_VERSION = 1;

/**
 * Complete backup data structure
 */
export interface BackupData {
  /** Schema version for migration support */
  schemaVersion: number;
  /** When the backup was created */
  exportedAt: string;
  /** Application version that created the backup */
  appVersion: string;
  /** Lab results */
  labResults: LabResult[];
  /** Test values */
  testValues: TestValue[];
  /** User notes */
  userNotes: UserNote[];
  /** User preferences */
  userPreferences: UserPreferences | null;
  /** Application settings (excluding sensitive data) */
  settings: Partial<Settings> | null;
}

/**
 * Options for JSON export
 */
export interface JsonExportOptions {
  /** Include settings in backup */
  includeSettings?: boolean;
  /** Include preferences in backup */
  includePreferences?: boolean;
  /** Pretty print JSON output */
  prettyPrint?: boolean;
}

/**
 * Data sources for export
 */
export interface ExportDataSources {
  labResults: LabResult[];
  testValues: TestValue[];
  userNotes: UserNote[];
  userPreferences: UserPreferences | null;
  settings: Settings | null;
}

/**
 * Get current application version
 */
function getAppVersion(): string {
  // In production, this would come from package.json or build config
  return '1.0.0';
}

/**
 * Sanitize settings to remove sensitive data
 */
function sanitizeSettings(settings: Settings | null): Partial<Settings> | null {
  if (!settings) {
    return null;
  }

  // Remove API key from backup (intentionally excluded)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { aiApiKey: _, ...safeSettings } = settings;
  return safeSettings;
}

/**
 * Convert Date objects to ISO strings for JSON serialization
 */
function serializeDate(date: Date): string {
  return date.toISOString();
}

/**
 * Serialize lab results for export
 */
function serializeLabResults(labResults: LabResult[]): LabResult[] {
  return labResults.map((result) => ({
    ...result,
    date: serializeDate(result.date) as unknown as Date,
    createdAt: serializeDate(result.createdAt) as unknown as Date,
    updatedAt: serializeDate(result.updatedAt) as unknown as Date,
  }));
}

/**
 * Serialize test values for export
 */
function serializeTestValues(testValues: TestValue[]): TestValue[] {
  return testValues.map((value) => ({
    ...value,
    createdAt: serializeDate(value.createdAt) as unknown as Date,
    updatedAt: serializeDate(value.updatedAt) as unknown as Date,
  }));
}

/**
 * Serialize user notes for export
 */
function serializeUserNotes(notes: UserNote[]): UserNote[] {
  return notes.map((note) => ({
    ...note,
    createdAt: serializeDate(note.createdAt) as unknown as Date,
    updatedAt: serializeDate(note.updatedAt) as unknown as Date,
  }));
}

/**
 * Export all data to JSON format
 */
export function exportToJson(
  sources: ExportDataSources,
  options: JsonExportOptions = {}
): string {
  const {
    includeSettings = true,
    includePreferences = true,
    prettyPrint = false,
  } = options;

  const backup: BackupData = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: getAppVersion(),
    labResults: serializeLabResults(sources.labResults),
    testValues: serializeTestValues(sources.testValues),
    userNotes: serializeUserNotes(sources.userNotes),
    userPreferences: includePreferences ? sources.userPreferences : null,
    settings: includeSettings ? sanitizeSettings(sources.settings) : null,
  };

  if (prettyPrint) {
    return JSON.stringify(backup, null, 2);
  }

  return JSON.stringify(backup);
}

/**
 * Generate a filename for the JSON backup
 */
export function generateBackupFilename(): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toISOString().split('T')[1].replace(/:/g, '-').split('.')[0];

  return `hemoio-backup-${dateStr}-${timeStr}.json`;
}

/**
 * Trigger download of JSON backup
 */
export function downloadJson(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Get backup data statistics
 */
export function getBackupStats(sources: ExportDataSources): {
  labResultCount: number;
  testValueCount: number;
  noteCount: number;
  hasSettings: boolean;
  hasPreferences: boolean;
} {
  return {
    labResultCount: sources.labResults.length,
    testValueCount: sources.testValues.length,
    noteCount: sources.userNotes.length,
    hasSettings: sources.settings !== null,
    hasPreferences: sources.userPreferences !== null,
  };
}

/**
 * Validate that backup data has required structure
 */
export function isValidBackupData(data: unknown): data is BackupData {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const backup = data as Partial<BackupData>;

  return (
    typeof backup.schemaVersion === 'number' &&
    typeof backup.exportedAt === 'string' &&
    typeof backup.appVersion === 'string' &&
    Array.isArray(backup.labResults) &&
    Array.isArray(backup.testValues) &&
    Array.isArray(backup.userNotes)
  );
}
