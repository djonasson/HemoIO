/**
 * Encryption utilities using Web Crypto API
 *
 * This module provides:
 * - PBKDF2 key derivation from password
 * - AES-GCM encryption/decryption
 * - Salt generation and storage
 * - Password verification hash generation
 */

const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 256;

/**
 * Generates cryptographically secure random bytes
 */
export function generateRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Generates a new salt for key derivation
 */
export function generateSalt(): Uint8Array {
  return generateRandomBytes(SALT_LENGTH);
}

/**
 * Generates a new initialization vector for AES-GCM
 */
export function generateIV(): Uint8Array {
  return generateRandomBytes(IV_LENGTH);
}

/**
 * Derives a cryptographic key from a password using PBKDF2
 */
export async function deriveKey(
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
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: KEY_LENGTH,
    },
    false, // not extractable for security
    ['encrypt', 'decrypt']
  );
}

/**
 * Derives a key specifically for password verification
 * Uses a different salt purpose to prevent key reuse
 */
export async function deriveVerificationHash(
  password: string,
  salt: Uint8Array
): Promise<string> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const hashBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    256
  );

  return arrayBufferToBase64(hashBits);
}

/**
 * Encrypts data using AES-GCM
 * Returns the encrypted data with IV prepended
 */
export async function encrypt(
  data: ArrayBuffer,
  key: CryptoKey
): Promise<ArrayBuffer> {
  const iv = generateIV();

  const encryptedData = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv.buffer as ArrayBuffer,
    },
    key,
    data
  );

  // Prepend IV to encrypted data
  const result = new Uint8Array(iv.length + encryptedData.byteLength);
  result.set(iv);
  result.set(new Uint8Array(encryptedData), iv.length);

  return result.buffer;
}

/**
 * Encrypts a string using AES-GCM
 */
export async function encryptString(
  text: string,
  key: CryptoKey
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const encrypted = await encrypt(data.buffer, key);
  return arrayBufferToBase64(encrypted);
}

/**
 * Decrypts data encrypted with AES-GCM
 * Expects IV to be prepended to the encrypted data
 */
export async function decrypt(
  encryptedData: ArrayBuffer,
  key: CryptoKey
): Promise<ArrayBuffer> {
  const encryptedArray = new Uint8Array(encryptedData);

  // Extract IV from the beginning
  const iv = encryptedArray.slice(0, IV_LENGTH);
  const data = encryptedArray.slice(IV_LENGTH);

  return crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv.buffer as ArrayBuffer,
    },
    key,
    data
  );
}

/**
 * Decrypts a base64 encoded encrypted string
 */
export async function decryptString(
  encryptedBase64: string,
  key: CryptoKey
): Promise<string> {
  const encryptedData = base64ToArrayBuffer(encryptedBase64);
  const decrypted = await decrypt(encryptedData, key);
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Converts ArrayBuffer to base64 string
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts base64 string to ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Converts Uint8Array to base64 string
 */
export function uint8ArrayToBase64(array: Uint8Array): string {
  return arrayBufferToBase64(array.buffer as ArrayBuffer);
}

/**
 * Converts base64 string to Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  return new Uint8Array(base64ToArrayBuffer(base64));
}

/**
 * Password strength validation result
 */
export interface PasswordStrengthResult {
  isStrong: boolean;
  score: number; // 0-4
  checks: {
    minLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumber: boolean;
    hasSpecial: boolean;
  };
}

/**
 * Checks password strength
 */
export function checkPasswordStrength(password: string): PasswordStrengthResult {
  const checks = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };

  const score = Object.values(checks).filter(Boolean).length;

  return {
    isStrong: score >= 4 && checks.minLength,
    score,
    checks,
  };
}

/**
 * Stored credentials structure
 */
export interface StoredCredentials {
  salt: string; // base64 encoded
  verificationSalt: string; // base64 encoded, separate salt for verification
  verificationHash: string; // base64 encoded
}

/**
 * Creates stored credentials from a password
 * This should only be called during initial setup
 */
export async function createStoredCredentials(
  password: string
): Promise<StoredCredentials> {
  const salt = generateSalt();
  const verificationSalt = generateSalt();
  const verificationHash = await deriveVerificationHash(password, verificationSalt);

  return {
    salt: uint8ArrayToBase64(salt),
    verificationSalt: uint8ArrayToBase64(verificationSalt),
    verificationHash,
  };
}

/**
 * Verifies a password against stored credentials
 */
export async function verifyPassword(
  password: string,
  credentials: StoredCredentials
): Promise<boolean> {
  const verificationSalt = base64ToUint8Array(credentials.verificationSalt);
  const computedHash = await deriveVerificationHash(password, verificationSalt);
  return computedHash === credentials.verificationHash;
}

/**
 * Gets the encryption key from password and stored credentials
 * Only call this after password has been verified
 */
export async function getEncryptionKey(
  password: string,
  credentials: StoredCredentials
): Promise<CryptoKey> {
  const salt = base64ToUint8Array(credentials.salt);
  return deriveKey(password, salt);
}
