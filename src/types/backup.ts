/**
 * Backup Types
 *
 * Type definitions for encrypted and unencrypted backup formats.
 */

import type { BackupData } from '@services/export/jsonExport';

/**
 * Type of backup file
 */
export type BackupType = 'standard' | 'encrypted';

/**
 * File extension for encrypted backups
 */
export const ENCRYPTED_BACKUP_EXTENSION = '.hemoio';

/**
 * File extension for standard backups
 */
export const STANDARD_BACKUP_EXTENSION = '.json';

/**
 * Schema version for encrypted backup format
 */
export const ENCRYPTED_BACKUP_SCHEMA_VERSION = 2;

/**
 * Type identifier for encrypted backup files
 */
export const ENCRYPTED_BACKUP_TYPE_ID = 'hemoio-encrypted-backup';

/**
 * Encryption metadata stored in encrypted backup file
 */
export interface EncryptionMetadata {
  /** Encryption algorithm used */
  algorithm: 'AES-GCM';
  /** Key derivation function */
  keyDerivation: 'PBKDF2';
  /** Number of PBKDF2 iterations */
  iterations: number;
  /** Base64-encoded salt for key derivation */
  salt: string;
}

/**
 * Encrypted backup file structure
 */
export interface EncryptedBackupFile {
  /** Type identifier for validation */
  type: typeof ENCRYPTED_BACKUP_TYPE_ID;
  /** Schema version */
  version: number;
  /** Encryption parameters */
  encryption: EncryptionMetadata;
  /** Base64-encoded encrypted JSON payload */
  payload: string;
}

/**
 * Full backup data including sensitive information
 * Used for encrypted backups only
 */
export interface FullBackupData extends BackupData {
  /** Full settings including API keys (only in encrypted backups) */
  fullSettings: FullSettingsData | null;
}

/**
 * Complete settings data including sensitive information
 */
export interface FullSettingsData {
  /** Storage provider type */
  storageProvider?: string;
  /** AI provider type */
  aiProvider?: string;
  /** AI API key (encrypted in app, plaintext in backup payload) */
  aiApiKey?: string;
  /** Language preference */
  language?: string;
}

/**
 * Options for encrypted backup export
 */
export interface EncryptedExportOptions {
  /** Password to encrypt the backup with */
  password: string;
  /** Include pretty-printed JSON in payload (larger file) */
  prettyPrint?: boolean;
}

/**
 * Options for encrypted backup import
 */
export interface EncryptedImportOptions {
  /** Password to decrypt the backup */
  password: string;
}

/**
 * Result of detecting backup file type
 */
export interface BackupTypeDetectionResult {
  /** Detected backup type */
  type: BackupType;
  /** Whether detection was successful */
  success: boolean;
  /** Error message if detection failed */
  error?: string;
  /** Parsed encrypted backup header (if encrypted) */
  encryptedBackup?: EncryptedBackupFile;
}

/**
 * Type guard for encrypted backup file structure
 */
export function isEncryptedBackupFile(data: unknown): data is EncryptedBackupFile {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const backup = data as Partial<EncryptedBackupFile>;

  return (
    backup.type === ENCRYPTED_BACKUP_TYPE_ID &&
    typeof backup.version === 'number' &&
    backup.version >= 2 &&
    backup.encryption !== null &&
    typeof backup.encryption === 'object' &&
    backup.encryption.algorithm === 'AES-GCM' &&
    backup.encryption.keyDerivation === 'PBKDF2' &&
    typeof backup.encryption.iterations === 'number' &&
    typeof backup.encryption.salt === 'string' &&
    typeof backup.payload === 'string'
  );
}
