/**
 * Encrypted Export Service
 *
 * Exports all application data including sensitive information (API keys)
 * to an encrypted backup file format.
 */

import type { Settings } from '@/types';
import type {
  EncryptedBackupFile,
  FullBackupData,
  FullSettingsData,
  EncryptedExportOptions,
} from '@/types/backup';
import {
  ENCRYPTED_BACKUP_SCHEMA_VERSION,
  ENCRYPTED_BACKUP_TYPE_ID,
  ENCRYPTED_BACKUP_EXTENSION,
} from '@/types/backup';
import { encryptForBackup } from '@data/encryption/backupEncryption';
import { BACKUP_SCHEMA_VERSION, type ExportDataSources } from './jsonExport';

/**
 * Serialize date to ISO string
 */
function serializeDate(date: Date): string {
  return date.toISOString();
}

/**
 * Get current application version
 */
function getAppVersion(): string {
  return '1.0.0';
}

/**
 * Extract full settings data including API key
 */
function extractFullSettings(settings: Settings | null): FullSettingsData | null {
  if (!settings) {
    return null;
  }

  return {
    storageProvider: settings.storageProvider,
    aiProvider: settings.aiProvider,
    aiApiKey: settings.aiApiKey,
    language: settings.language,
  };
}

/**
 * Creates the full backup data object including sensitive data
 */
function createFullBackupData(sources: ExportDataSources): FullBackupData {
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: getAppVersion(),
    labResults: sources.labResults.map((result) => ({
      ...result,
      date: serializeDate(result.date) as unknown as Date,
      createdAt: serializeDate(result.createdAt) as unknown as Date,
      updatedAt: serializeDate(result.updatedAt) as unknown as Date,
    })),
    testValues: sources.testValues.map((value) => ({
      ...value,
      createdAt: serializeDate(value.createdAt) as unknown as Date,
      updatedAt: serializeDate(value.updatedAt) as unknown as Date,
    })),
    userNotes: sources.userNotes.map((note) => ({
      ...note,
      createdAt: serializeDate(note.createdAt) as unknown as Date,
      updatedAt: serializeDate(note.updatedAt) as unknown as Date,
    })),
    userPreferences: sources.userPreferences,
    // Settings without API key (for standard fields)
    settings: sources.settings
      ? {
          storageProvider: sources.settings.storageProvider,
          aiProvider: sources.settings.aiProvider,
          language: sources.settings.language,
        }
      : null,
    // Full settings including API key (only in encrypted backups)
    fullSettings: extractFullSettings(sources.settings),
  };
}

/**
 * Exports all data to encrypted backup format
 *
 * @param sources - Data sources to export
 * @param options - Export options including password
 * @returns JSON string of the encrypted backup file
 */
export async function exportToEncryptedJson(
  sources: ExportDataSources,
  options: EncryptedExportOptions
): Promise<string> {
  const { password, prettyPrint = false } = options;

  // Create full backup data
  const backupData = createFullBackupData(sources);

  // Serialize to JSON
  const jsonPayload = prettyPrint
    ? JSON.stringify(backupData, null, 2)
    : JSON.stringify(backupData);

  // Encrypt the payload
  const { payload, metadata } = await encryptForBackup(jsonPayload, password);

  // Create encrypted backup file structure
  const encryptedBackup: EncryptedBackupFile = {
    type: ENCRYPTED_BACKUP_TYPE_ID,
    version: ENCRYPTED_BACKUP_SCHEMA_VERSION,
    encryption: metadata,
    payload,
  };

  return JSON.stringify(encryptedBackup, null, 2);
}

/**
 * Generates a filename for encrypted backup
 */
export function generateEncryptedBackupFilename(): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toISOString().split('T')[1].replace(/:/g, '-').split('.')[0];

  return `hemoio-backup-${dateStr}-${timeStr}${ENCRYPTED_BACKUP_EXTENSION}`;
}

/**
 * Triggers download of encrypted backup file
 */
export function downloadEncryptedBackup(content: string, filename: string): void {
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
