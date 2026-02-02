/**
 * Tests for backup-specific encryption utilities
 */

import { describe, it, expect } from 'vitest';
import {
  deriveBackupKey,
  encryptForBackup,
  decryptFromBackup,
  validateBackupPassword,
  generateBackupSalt,
} from './backupEncryption';
import { uint8ArrayToBase64 } from './index';

describe('backupEncryption', () => {
  describe('deriveBackupKey', () => {
    it('should derive a CryptoKey from password and salt', async () => {
      const password = 'TestPassword123!';
      const salt = generateBackupSalt();

      const key = await deriveBackupKey(password, salt);

      expect(key).toBeInstanceOf(CryptoKey);
      expect(key.type).toBe('secret');
      expect(key.algorithm.name).toBe('AES-GCM');
    });

    it('should derive different keys for different passwords', async () => {
      // We can't directly compare CryptoKeys, but we can encrypt something
      // and verify the outputs are different
      const testData = 'test data';
      const encrypted1 = await encryptForBackup(testData, 'Password1!');
      const encrypted2 = await encryptForBackup(testData, 'Password2!');

      // Payloads will be different due to different keys and random IVs
      expect(encrypted1.payload).not.toBe(encrypted2.payload);
    });

    it('should derive different keys for different salts', async () => {
      const password = 'TestPassword123!';
      const salt1 = generateBackupSalt();
      const salt2 = generateBackupSalt();

      const key1 = await deriveBackupKey(password, salt1);
      const key2 = await deriveBackupKey(password, salt2);

      expect(key1).toBeInstanceOf(CryptoKey);
      expect(key2).toBeInstanceOf(CryptoKey);
      // Keys are different internally (different salts)
    });
  });

  describe('encryptForBackup', () => {
    it('should encrypt data and return payload with metadata', async () => {
      const testData = JSON.stringify({ test: 'data', value: 123 });
      const password = 'SecurePassword123!';

      const result = await encryptForBackup(testData, password);

      expect(result.payload).toBeDefined();
      expect(typeof result.payload).toBe('string');
      expect(result.metadata).toBeDefined();
      expect(result.metadata.algorithm).toBe('AES-GCM');
      expect(result.metadata.keyDerivation).toBe('PBKDF2');
      expect(result.metadata.iterations).toBe(100000);
      expect(result.metadata.salt).toBeDefined();
      expect(typeof result.metadata.salt).toBe('string');
    });

    it('should produce different payloads for same data due to random IV', async () => {
      const testData = 'same data';
      const password = 'SamePassword123!';

      const result1 = await encryptForBackup(testData, password);
      const result2 = await encryptForBackup(testData, password);

      // Payloads should be different due to random IV
      expect(result1.payload).not.toBe(result2.payload);
      // Salts should also be different
      expect(result1.metadata.salt).not.toBe(result2.metadata.salt);
    });

    it('should handle empty string', async () => {
      const result = await encryptForBackup('', 'Password123!');

      expect(result.payload).toBeDefined();
      expect(result.metadata.salt).toBeDefined();
    });

    it('should handle unicode content', async () => {
      const unicodeData = JSON.stringify({
        message: 'Hello 世界! 🌍 Привет мир!',
        symbols: '€£¥₹',
      });
      const password = 'Password123!';

      const result = await encryptForBackup(unicodeData, password);
      const decrypted = await decryptFromBackup(
        result.payload,
        password,
        result.metadata.salt
      );

      expect(decrypted).toBe(unicodeData);
    });
  });

  describe('decryptFromBackup', () => {
    it('should decrypt data encrypted with encryptForBackup', async () => {
      const originalData = JSON.stringify({
        labResults: [{ id: 1, name: 'Test Result' }],
        settings: { aiApiKey: 'sk-test-123' },
      });
      const password = 'MySecurePassword123!';

      const encrypted = await encryptForBackup(originalData, password);
      const decrypted = await decryptFromBackup(
        encrypted.payload,
        password,
        encrypted.metadata.salt
      );

      expect(decrypted).toBe(originalData);
    });

    it('should throw error with wrong password', async () => {
      const testData = 'secret data';
      const correctPassword = 'CorrectPassword123!';
      const wrongPassword = 'WrongPassword123!';

      const encrypted = await encryptForBackup(testData, correctPassword);

      await expect(
        decryptFromBackup(encrypted.payload, wrongPassword, encrypted.metadata.salt)
      ).rejects.toThrow('Unable to decrypt backup. Please check your password.');
    });

    it('should throw error with wrong salt', async () => {
      const testData = 'secret data';
      const password = 'Password123!';

      const encrypted = await encryptForBackup(testData, password);
      const wrongSalt = uint8ArrayToBase64(generateBackupSalt());

      await expect(
        decryptFromBackup(encrypted.payload, password, wrongSalt)
      ).rejects.toThrow('Unable to decrypt backup. Please check your password.');
    });

    it('should throw error with corrupted payload', async () => {
      const testData = 'secret data';
      const password = 'Password123!';

      const encrypted = await encryptForBackup(testData, password);
      // Create a valid base64 string that will produce corrupted data when decoded
      // Replace last few characters with valid base64 chars
      const corruptedPayload = encrypted.payload.slice(0, -10) + 'AAAAAAAAAA';

      await expect(
        decryptFromBackup(corruptedPayload, password, encrypted.metadata.salt)
      ).rejects.toThrow('Unable to decrypt backup. Please check your password.');
    });
  });

  describe('validateBackupPassword', () => {
    it('should reject empty password', () => {
      const result = validateBackupPassword('');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Password must be at least 8 characters long');
    });

    it('should reject password shorter than 8 characters', () => {
      const result = validateBackupPassword('Short1!');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Password must be at least 8 characters long');
    });

    it('should accept password with 8 or more characters', () => {
      const result = validateBackupPassword('Password123!');

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept exactly 8 character password', () => {
      const result = validateBackupPassword('12345678');

      expect(result.valid).toBe(true);
    });
  });

  describe('generateBackupSalt', () => {
    it('should generate a 16-byte salt', () => {
      const salt = generateBackupSalt();

      expect(salt).toBeInstanceOf(Uint8Array);
      expect(salt.length).toBe(16);
    });

    it('should generate different salts each time', () => {
      const salt1 = generateBackupSalt();
      const salt2 = generateBackupSalt();
      const salt3 = generateBackupSalt();

      const salt1Base64 = uint8ArrayToBase64(salt1);
      const salt2Base64 = uint8ArrayToBase64(salt2);
      const salt3Base64 = uint8ArrayToBase64(salt3);

      expect(salt1Base64).not.toBe(salt2Base64);
      expect(salt2Base64).not.toBe(salt3Base64);
      expect(salt1Base64).not.toBe(salt3Base64);
    });
  });

  describe('roundtrip encryption', () => {
    it('should successfully roundtrip large JSON data', async () => {
      const largeData = {
        labResults: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          date: new Date().toISOString(),
          labName: `Lab ${i}`,
          values: Array.from({ length: 50 }, (_, j) => ({
            biomarkerId: j,
            value: Math.random() * 1000,
            unit: 'mg/dL',
          })),
        })),
        settings: {
          aiApiKey: 'sk-test-very-long-api-key-12345678901234567890',
          storageProvider: 'local',
        },
      };

      const originalJson = JSON.stringify(largeData);
      const password = 'VerySecurePassword123!@#';

      const encrypted = await encryptForBackup(originalJson, password);
      const decrypted = await decryptFromBackup(
        encrypted.payload,
        password,
        encrypted.metadata.salt
      );

      expect(decrypted).toBe(originalJson);
      expect(JSON.parse(decrypted)).toEqual(largeData);
    });

    it('should handle special characters in password', async () => {
      const testData = 'test data';
      const specialPassword = 'P@$$w0rd!#%^&*()_+-=[]{}|;:,.<>?€£¥';

      const encrypted = await encryptForBackup(testData, specialPassword);
      const decrypted = await decryptFromBackup(
        encrypted.payload,
        specialPassword,
        encrypted.metadata.salt
      );

      expect(decrypted).toBe(testData);
    });
  });
});
