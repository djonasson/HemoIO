/**
 * Backup-specific Encryption Utilities
 *
 * Provides encryption/decryption for backup files using a separate
 * password from the main application password. This enables portable
 * backups that can be restored on any device.
 */

import {
  generateSalt,
  generateIV,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  uint8ArrayToBase64,
  base64ToUint8Array,
} from './index';
import type { EncryptionMetadata } from '@/types/backup';

/** IV length for AES-GCM */
const IV_LENGTH = 12;

/** Number of PBKDF2 iterations for backup encryption */
const BACKUP_PBKDF2_ITERATIONS = 100000;

/** Key length for AES-GCM */
const KEY_LENGTH = 256;

/**
 * Derives an encryption key from a backup password
 * Uses same parameters as main app encryption for consistency
 */
export async function deriveBackupKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: BACKUP_PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: KEY_LENGTH,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Result of backup encryption
 */
export interface BackupEncryptionResult {
  /** Base64-encoded encrypted payload (IV prepended) */
  payload: string;
  /** Encryption metadata for the backup file */
  metadata: EncryptionMetadata;
}

/**
 * Encrypts data for backup using a user-provided password
 *
 * @param data - JSON string to encrypt
 * @param password - User-provided backup password
 * @returns Encrypted payload and metadata
 */
export async function encryptForBackup(
  data: string,
  password: string
): Promise<BackupEncryptionResult> {
  // Generate new random salt for this backup
  const salt = generateSalt();
  const iv = generateIV();

  // Derive key from password
  const key = await deriveBackupKey(password, salt);

  // Encrypt data
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);

  const encryptedData = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv.buffer as ArrayBuffer,
    },
    key,
    dataBuffer
  );

  // Prepend IV to encrypted data
  const combined = new Uint8Array(iv.length + encryptedData.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encryptedData), iv.length);

  return {
    payload: arrayBufferToBase64(combined.buffer as ArrayBuffer),
    metadata: {
      algorithm: 'AES-GCM',
      keyDerivation: 'PBKDF2',
      iterations: BACKUP_PBKDF2_ITERATIONS,
      salt: uint8ArrayToBase64(salt),
    },
  };
}

/**
 * Decrypts a backup payload using the provided password
 *
 * @param encryptedPayload - Base64-encoded encrypted payload (IV prepended)
 * @param password - User-provided backup password
 * @param salt - Base64-encoded salt from backup metadata
 * @returns Decrypted JSON string
 * @throws Error if decryption fails (wrong password or corrupt data)
 */
export async function decryptFromBackup(
  encryptedPayload: string,
  password: string,
  salt: string
): Promise<string> {
  // Decode salt and payload
  const saltBytes = base64ToUint8Array(salt);
  const encryptedBytes = new Uint8Array(base64ToArrayBuffer(encryptedPayload));

  // Extract IV from the beginning of payload
  const iv = encryptedBytes.slice(0, IV_LENGTH);
  const data = encryptedBytes.slice(IV_LENGTH);

  // Derive key from password
  const key = await deriveBackupKey(password, saltBytes);

  try {
    // Decrypt data
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv.buffer as ArrayBuffer,
      },
      key,
      data
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch {
    // Don't reveal specifics about the failure
    throw new Error('Unable to decrypt backup. Please check your password.');
  }
}

/**
 * Validates that a backup password meets minimum requirements
 */
export function validateBackupPassword(password: string): {
  valid: boolean;
  error?: string;
} {
  if (!password || password.length < 8) {
    return {
      valid: false,
      error: 'Password must be at least 8 characters long',
    };
  }

  return { valid: true };
}

/**
 * Generates a new random salt for backup encryption
 * Exported for testing purposes
 */
export function generateBackupSalt(): Uint8Array {
  return generateSalt();
}
