import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateRandomBytes,
  generateSalt,
  generateIV,
  deriveKey,
  deriveVerificationHash,
  encrypt,
  decrypt,
  encryptString,
  decryptString,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  uint8ArrayToBase64,
  base64ToUint8Array,
  checkPasswordStrength,
  createStoredCredentials,
  verifyPassword,
  getEncryptionKey,
} from './index';

// Check if crypto.subtle is available
const hasCryptoSubtle = typeof crypto !== 'undefined' && crypto.subtle;

describe('Encryption utilities', () => {
  describe('Random byte generation', () => {
    it('generates bytes of the correct length', () => {
      const bytes16 = generateRandomBytes(16);
      const bytes32 = generateRandomBytes(32);

      expect(bytes16.length).toBe(16);
      expect(bytes32.length).toBe(32);
    });

    it('generates different values each time', () => {
      const bytes1 = generateRandomBytes(16);
      const bytes2 = generateRandomBytes(16);

      // Extremely unlikely to be equal
      expect(bytes1).not.toEqual(bytes2);
    });
  });

  describe('Salt and IV generation', () => {
    it('generates salt of 16 bytes', () => {
      const salt = generateSalt();
      expect(salt.length).toBe(16);
    });

    it('generates IV of 12 bytes', () => {
      const iv = generateIV();
      expect(iv.length).toBe(12);
    });
  });

  describe('Base64 conversion', () => {
    it('converts ArrayBuffer to base64 and back', () => {
      const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const base64 = arrayBufferToBase64(original.buffer as ArrayBuffer);
      const restored = new Uint8Array(base64ToArrayBuffer(base64));

      expect(restored).toEqual(original);
    });

    it('converts Uint8Array to base64 and back', () => {
      const original = new Uint8Array([10, 20, 30, 40, 50]);
      const base64 = uint8ArrayToBase64(original);
      const restored = base64ToUint8Array(base64);

      expect(restored).toEqual(original);
    });

    it('handles empty arrays', () => {
      const empty = new Uint8Array([]);
      const base64 = uint8ArrayToBase64(empty);
      const restored = base64ToUint8Array(base64);

      expect(restored).toEqual(empty);
    });
  });

  describe('Password strength checking', () => {
    it('rejects passwords shorter than 8 characters', () => {
      const result = checkPasswordStrength('short');
      expect(result.checks.minLength).toBe(false);
      expect(result.isStrong).toBe(false);
    });

    it('requires uppercase letters', () => {
      const result = checkPasswordStrength('lowercase123!');
      expect(result.checks.hasUppercase).toBe(false);
    });

    it('requires lowercase letters', () => {
      const result = checkPasswordStrength('UPPERCASE123!');
      expect(result.checks.hasLowercase).toBe(false);
    });

    it('requires numbers', () => {
      const result = checkPasswordStrength('NoNumbers!Aa');
      expect(result.checks.hasNumber).toBe(false);
    });

    it('requires special characters', () => {
      const result = checkPasswordStrength('NoSpecial123Aa');
      expect(result.checks.hasSpecial).toBe(false);
    });

    it('accepts strong passwords', () => {
      const result = checkPasswordStrength('MySecurePass123!');
      expect(result.checks.minLength).toBe(true);
      expect(result.checks.hasUppercase).toBe(true);
      expect(result.checks.hasLowercase).toBe(true);
      expect(result.checks.hasNumber).toBe(true);
      expect(result.checks.hasSpecial).toBe(true);
      expect(result.isStrong).toBe(true);
      expect(result.score).toBe(5);
    });

    it('calculates correct score', () => {
      expect(checkPasswordStrength('').score).toBe(0);
      expect(checkPasswordStrength('password').score).toBe(2); // length + lowercase
      expect(checkPasswordStrength('Password1').score).toBe(4); // length + upper + lower + number
      expect(checkPasswordStrength('Password1!').score).toBe(5); // all checks
    });
  });

  // Tests that require crypto.subtle
  describe.runIf(hasCryptoSubtle)('Key derivation', () => {
    it('derives a key from password and salt', async () => {
      const password = 'testPassword123';
      const salt = generateSalt();

      const key = await deriveKey(password, salt);

      expect(key).toBeDefined();
      expect(key.type).toBe('secret');
      expect(key.algorithm.name).toBe('AES-GCM');
    });

    it('derives the same key for same password and salt', async () => {
      const password = 'testPassword123';
      const salt = generateSalt();

      const key1 = await deriveKey(password, salt);
      const key2 = await deriveKey(password, salt);

      // Keys are not directly comparable, but they should encrypt/decrypt the same
      const testData = new TextEncoder().encode('test data');
      const encrypted1 = await encrypt(testData.buffer as ArrayBuffer, key1);
      const decrypted = await decrypt(encrypted1, key2);

      expect(new TextDecoder().decode(decrypted)).toBe('test data');
    });

    it('derives different keys for different passwords', async () => {
      const salt = generateSalt();

      const key1 = await deriveKey('password1', salt);
      const key2 = await deriveKey('password2', salt);

      const testData = new TextEncoder().encode('test data');
      const encrypted = await encrypt(testData.buffer as ArrayBuffer, key1);

      // Decrypting with different key should fail
      await expect(decrypt(encrypted, key2)).rejects.toThrow();
    });

    it('derives different keys for different salts', async () => {
      const password = 'testPassword123';

      const key1 = await deriveKey(password, generateSalt());
      const key2 = await deriveKey(password, generateSalt());

      const testData = new TextEncoder().encode('test data');
      const encrypted = await encrypt(testData.buffer as ArrayBuffer, key1);

      // Decrypting with different key should fail
      await expect(decrypt(encrypted, key2)).rejects.toThrow();
    });
  });

  describe.runIf(hasCryptoSubtle)('Verification hash', () => {
    it('produces consistent hash for same password and salt', async () => {
      const password = 'testPassword123';
      const salt = generateSalt();

      const hash1 = await deriveVerificationHash(password, salt);
      const hash2 = await deriveVerificationHash(password, salt);

      expect(hash1).toBe(hash2);
    });

    it('produces different hash for different passwords', async () => {
      const salt = generateSalt();

      const hash1 = await deriveVerificationHash('password1', salt);
      const hash2 = await deriveVerificationHash('password2', salt);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe.runIf(hasCryptoSubtle)('Encryption and decryption', () => {
    let testKey: CryptoKey;

    beforeAll(async () => {
      const salt = generateSalt();
      testKey = await deriveKey('testPassword', salt);
    });

    it('encrypts and decrypts ArrayBuffer data', async () => {
      const original = new TextEncoder().encode('Hello, World!');
      const encrypted = await encrypt(original.buffer as ArrayBuffer, testKey);
      const decrypted = await decrypt(encrypted, testKey);

      expect(new TextDecoder().decode(decrypted)).toBe('Hello, World!');
    });

    it('encrypts and decrypts strings', async () => {
      const original = 'This is a secret message';
      const encrypted = await encryptString(original, testKey);
      const decrypted = await decryptString(encrypted, testKey);

      expect(decrypted).toBe(original);
    });

    it('produces different ciphertext for same plaintext (due to random IV)', async () => {
      const original = new TextEncoder().encode('Same text');

      const encrypted1 = await encrypt(original.buffer as ArrayBuffer, testKey);
      const encrypted2 = await encrypt(original.buffer as ArrayBuffer, testKey);

      // Should produce different ciphertext due to random IV
      expect(arrayBufferToBase64(encrypted1)).not.toBe(
        arrayBufferToBase64(encrypted2)
      );

      // But both should decrypt to the same plaintext
      const decrypted1 = await decrypt(encrypted1, testKey);
      const decrypted2 = await decrypt(encrypted2, testKey);

      expect(new TextDecoder().decode(decrypted1)).toBe('Same text');
      expect(new TextDecoder().decode(decrypted2)).toBe('Same text');
    });

    it('handles empty strings', async () => {
      const encrypted = await encryptString('', testKey);
      const decrypted = await decryptString(encrypted, testKey);

      expect(decrypted).toBe('');
    });

    it('handles unicode strings', async () => {
      const original = '你好世界 🌍 مرحبا';
      const encrypted = await encryptString(original, testKey);
      const decrypted = await decryptString(encrypted, testKey);

      expect(decrypted).toBe(original);
    });
  });

  describe.runIf(hasCryptoSubtle)('Stored credentials', () => {
    it('creates stored credentials from password', async () => {
      const password = 'MySecurePassword123!';
      const credentials = await createStoredCredentials(password);

      expect(credentials.salt).toBeDefined();
      expect(credentials.verificationSalt).toBeDefined();
      expect(credentials.verificationHash).toBeDefined();

      // Should be base64 encoded
      expect(() => atob(credentials.salt)).not.toThrow();
      expect(() => atob(credentials.verificationSalt)).not.toThrow();
      expect(() => atob(credentials.verificationHash)).not.toThrow();
    });

    it('uses different salts for encryption and verification', async () => {
      const credentials = await createStoredCredentials('password');

      expect(credentials.salt).not.toBe(credentials.verificationSalt);
    });

    it('verifies correct password', async () => {
      const password = 'MySecurePassword123!';
      const credentials = await createStoredCredentials(password);

      const isValid = await verifyPassword(password, credentials);

      expect(isValid).toBe(true);
    });

    it('rejects incorrect password', async () => {
      const credentials = await createStoredCredentials('correctPassword');

      const isValid = await verifyPassword('wrongPassword', credentials);

      expect(isValid).toBe(false);
    });

    it('retrieves encryption key after verification', async () => {
      const password = 'MySecurePassword123!';
      const credentials = await createStoredCredentials(password);

      const key = await getEncryptionKey(password, credentials);

      expect(key).toBeDefined();
      expect(key.type).toBe('secret');

      // Verify key works for encryption
      const encrypted = await encryptString('test', key);
      const decrypted = await decryptString(encrypted, key);
      expect(decrypted).toBe('test');
    });
  });
});
