/**
 * Encrypted Import Service
 *
 * Imports data from encrypted backup files, including sensitive
 * information like API keys.
 */

import type { Settings } from '@/types';
import type {
  BackupType,
  BackupTypeDetectionResult,
  EncryptedBackupFile,
  FullBackupData,
} from '@/types/backup';
import {
  isEncryptedBackupFile,
  ENCRYPTED_BACKUP_EXTENSION,
  STANDARD_BACKUP_EXTENSION,
} from '@/types/backup';
import { decryptFromBackup } from '@data/encryption/backupEncryption';
import { isValidBackupData, BACKUP_SCHEMA_VERSION } from '../export/jsonExport';
import type { ParsedBackupData } from './jsonImport';

/**
 * Extended parsed backup data that includes full settings
 */
export interface ParsedEncryptedBackupData extends ParsedBackupData {
  /** Full settings including API key */
  fullSettings: Partial<Settings> | null;
  /** Whether this was an encrypted backup */
  wasEncrypted: boolean;
}

/**
 * Detects the type of backup file from its content
 *
 * @param content - Raw file content as string
 * @returns Detection result with backup type
 */
export function detectBackupType(content: string): BackupTypeDetectionResult {
  try {
    const data = JSON.parse(content);

    // Check if it's an encrypted backup
    if (isEncryptedBackupFile(data)) {
      return {
        type: 'encrypted',
        success: true,
        encryptedBackup: data,
      };
    }

    // Check if it's a standard backup
    if (isValidBackupData(data)) {
      return {
        type: 'standard',
        success: true,
      };
    }

    return {
      type: 'standard',
      success: false,
      error: 'Unrecognized backup file format',
    };
  } catch {
    return {
      type: 'standard',
      success: false,
      error: 'Invalid JSON format',
    };
  }
}

/**
 * Detects backup type from file extension
 */
export function detectBackupTypeFromFile(file: File): BackupType {
  if (file.name.endsWith(ENCRYPTED_BACKUP_EXTENSION)) {
    return 'encrypted';
  }
  return 'standard';
}

/**
 * Validates an encrypted backup file structure
 */
export function validateEncryptedBackupFile(
  file: File
): { valid: boolean; error?: string } {
  // Check file extension
  const validExtensions = [ENCRYPTED_BACKUP_EXTENSION, STANDARD_BACKUP_EXTENSION];
  const hasValidExtension = validExtensions.some((ext) => file.name.endsWith(ext));

  if (!hasValidExtension) {
    return {
      valid: false,
      error: `File must have ${ENCRYPTED_BACKUP_EXTENSION} or ${STANDARD_BACKUP_EXTENSION} extension`,
    };
  }

  // Check file size (max 50MB)
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    return { valid: false, error: 'File is too large (max 50MB)' };
  }

  return { valid: true };
}

/**
 * Parses and decrypts an encrypted backup file
 *
 * @param content - Raw file content
 * @param password - User-provided password
 * @returns Parsed backup data
 * @throws Error if decryption or parsing fails
 */
export async function parseEncryptedBackup(
  content: string,
  password: string
): Promise<ParsedEncryptedBackupData> {
  // Parse outer structure
  let encryptedBackup: EncryptedBackupFile;
  try {
    encryptedBackup = JSON.parse(content);
  } catch {
    throw new Error('Invalid backup file format');
  }

  // Validate structure
  if (!isEncryptedBackupFile(encryptedBackup)) {
    throw new Error('Invalid encrypted backup structure');
  }

  // Decrypt payload
  const decryptedJson = await decryptFromBackup(
    encryptedBackup.payload,
    password,
    encryptedBackup.encryption.salt
  );

  // Parse decrypted data
  let backupData: FullBackupData;
  try {
    backupData = JSON.parse(decryptedJson);
  } catch {
    throw new Error('Decrypted data is not valid JSON');
  }

  // Validate backup structure
  if (!isValidBackupData(backupData)) {
    throw new Error('Invalid backup data structure');
  }

  // Check schema version
  if (backupData.schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new Error(
      `Backup was created with a newer version (v${backupData.schemaVersion}). ` +
        `Current version supports up to v${BACKUP_SCHEMA_VERSION}.`
    );
  }

  // Deserialize dates
  return {
    labResults: backupData.labResults.map((lr) => ({
      ...lr,
      date: new Date(lr.date as unknown as string),
      createdAt: new Date(lr.createdAt as unknown as string),
      updatedAt: new Date(lr.updatedAt as unknown as string),
    })),
    testValues: backupData.testValues.map((tv) => ({
      ...tv,
      createdAt: new Date(tv.createdAt as unknown as string),
      updatedAt: new Date(tv.updatedAt as unknown as string),
    })),
    userNotes: backupData.userNotes.map((note) => ({
      ...note,
      createdAt: new Date(note.createdAt as unknown as string),
      updatedAt: new Date(note.updatedAt as unknown as string),
    })),
    settings: backupData.settings,
    userPreferences: backupData.userPreferences,
    schemaVersion: backupData.schemaVersion,
    exportedAt: new Date(backupData.exportedAt),
    // Include full settings with API key
    fullSettings: backupData.fullSettings
      ? {
          storageProvider: backupData.fullSettings.storageProvider as Settings['storageProvider'],
          aiProvider: backupData.fullSettings.aiProvider as Settings['aiProvider'],
          aiApiKey: backupData.fullSettings.aiApiKey,
          language: backupData.fullSettings.language,
        }
      : null,
    wasEncrypted: true,
  };
}

/**
 * Attempts to validate a password against an encrypted backup
 * by trying to decrypt a small portion
 *
 * Note: This actually performs full decryption since AES-GCM
 * requires complete decryption for authentication. The result
 * is discarded but we know if the password is correct.
 *
 * @param backup - Encrypted backup file structure
 * @param password - Password to test
 * @returns True if password is valid
 */
export async function validateBackupPassword(
  backup: EncryptedBackupFile,
  password: string
): Promise<boolean> {
  try {
    await decryptFromBackup(
      backup.payload,
      password,
      backup.encryption.salt
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets a preview of encrypted backup contents after decryption
 */
export function getEncryptedImportPreview(data: ParsedEncryptedBackupData): {
  labResultCount: number;
  testValueCount: number;
  noteCount: number;
  hasSettings: boolean;
  hasApiKey: boolean;
  hasPreferences: boolean;
  exportedAt: Date;
  schemaVersion: number;
  wasEncrypted: boolean;
} {
  return {
    labResultCount: data.labResults.length,
    testValueCount: data.testValues.length,
    noteCount: data.userNotes.length,
    hasSettings: data.settings !== null || data.fullSettings !== null,
    hasApiKey: data.fullSettings?.aiApiKey !== undefined,
    hasPreferences: data.userPreferences !== null,
    exportedAt: data.exportedAt,
    schemaVersion: data.schemaVersion,
    wasEncrypted: data.wasEncrypted,
  };
}
