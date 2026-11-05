/**
 * Tests for encrypted import service
 */

import { describe, it, expect } from 'vitest';
import {
  detectBackupType,
  detectBackupTypeFromFile,
  validateEncryptedBackupFile,
  parseEncryptedBackup,
  validateBackupPassword,
  getEncryptedImportPreview,
} from './encryptedImport';
import { exportToEncryptedJson } from '../export/encryptedExport';
import { exportToJson } from '../export/jsonExport';
import type { ExportDataSources } from '../export/jsonExport';
import { UNKNOWN_KEY_BACKUP_MESSAGE } from './jsonImport';
import type { Settings } from '@/types';
import { encryptForBackup } from '@data/encryption/backupEncryption';
import {
  ENCRYPTED_BACKUP_TYPE_ID,
  ENCRYPTED_BACKUP_SCHEMA_VERSION,
} from '@/types/backup';

describe('encryptedImport', () => {
  const mockDataSources: ExportDataSources = {
    labResults: [
      {
        id: 1,
        date: new Date('2024-01-15'),
        labName: 'Test Lab',
        createdAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-01-15'),
      },
    ],
    testValues: [
      {
        id: 1,
        labResultId: 1,
        biomarkerKey: '2345-7',
        value: 100,
        unit: 'mg/dL',
        createdAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-01-15'),
      },
    ],
    userNotes: [
      {
        id: 1,
        content: 'Test note',
        tags: ['test'],
        createdAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-01-15'),
      },
    ],
    userPreferences: {
      unitPreferences: {},
      personalTargets: {},
      theme: 'system',
      dateFormat: 'MM/DD/YYYY',
    },
    settings: {
      storageProvider: 'local',
      aiProvider: 'openai',
      aiApiKey: 'sk-test-api-key-123',
      language: 'en',
    } as Settings,
  };

  describe('detectBackupType', () => {
    it('should detect encrypted backup', async () => {
      const password = 'SecurePassword123!';
      const encrypted = await exportToEncryptedJson(mockDataSources, { password });

      const result = detectBackupType(encrypted);

      expect(result.type).toBe('encrypted');
      expect(result.success).toBe(true);
      expect(result.encryptedBackup).toBeDefined();
      expect(result.encryptedBackup?.type).toBe(ENCRYPTED_BACKUP_TYPE_ID);
    });

    it('should detect standard backup', () => {
      const standard = exportToJson(mockDataSources);

      const result = detectBackupType(standard);

      expect(result.type).toBe('standard');
      expect(result.success).toBe(true);
      expect(result.encryptedBackup).toBeUndefined();
    });

    it('should handle invalid JSON', () => {
      const result = detectBackupType('not valid json {{{');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid JSON format');
    });

    it('should handle unrecognized format', () => {
      const result = detectBackupType('{"foo": "bar"}');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unrecognized backup file format');
    });
  });

  describe('detectBackupTypeFromFile', () => {
    it('should detect .hemoio as encrypted', () => {
      const file = new File([''], 'backup.hemoio', { type: 'application/json' });

      const result = detectBackupTypeFromFile(file);

      expect(result).toBe('encrypted');
    });

    it('should detect .json as standard', () => {
      const file = new File([''], 'backup.json', { type: 'application/json' });

      const result = detectBackupTypeFromFile(file);

      expect(result).toBe('standard');
    });

    it('should default to standard for unknown extensions', () => {
      const file = new File([''], 'backup.txt', { type: 'text/plain' });

      const result = detectBackupTypeFromFile(file);

      expect(result).toBe('standard');
    });
  });

  describe('validateEncryptedBackupFile', () => {
    it('should accept .hemoio files', () => {
      const file = new File(['{}'], 'backup.hemoio', { type: 'application/json' });

      const result = validateEncryptedBackupFile(file);

      expect(result.valid).toBe(true);
    });

    it('should accept .json files', () => {
      const file = new File(['{}'], 'backup.json', { type: 'application/json' });

      const result = validateEncryptedBackupFile(file);

      expect(result.valid).toBe(true);
    });

    it('should reject files with invalid extensions', () => {
      const file = new File(['{}'], 'backup.txt', { type: 'text/plain' });

      const result = validateEncryptedBackupFile(file);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('.hemoio');
    });

    it('should reject files larger than 50MB', () => {
      // Mock a large file by creating a File with overridden size
      const file = new File(['test'], 'backup.hemoio', {
        type: 'application/json',
      });

      // Override the size property to simulate a large file
      Object.defineProperty(file, 'size', {
        value: 51 * 1024 * 1024,
        writable: false,
      });

      const result = validateEncryptedBackupFile(file);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('too large');
    });
  });

  describe('parseEncryptedBackup', () => {
    it('should parse and decrypt encrypted backup', async () => {
      const password = 'SecurePassword123!';
      const encrypted = await exportToEncryptedJson(mockDataSources, { password });

      const result = await parseEncryptedBackup(encrypted, password);

      expect(result.labResults).toHaveLength(1);
      expect(result.labResults[0].labName).toBe('Test Lab');
      expect(result.testValues).toHaveLength(1);
      expect(result.userNotes).toHaveLength(1);
      expect(result.wasEncrypted).toBe(true);
    });

    it('refuses a backup with a value keyed by anything but a LOINC code or an unknown key', async () => {
      const password = 'SecurePassword123!';
      const sources = {
        ...mockDataSources,
        testValues: [{ ...mockDataSources.testValues[0], biomarkerKey: 'glucose' }],
      };
      const encrypted = await exportToEncryptedJson(sources, { password });

      await expect(parseEncryptedBackup(encrypted, password)).rejects.toThrow(UNKNOWN_KEY_BACKUP_MESSAGE);
    });

    it('should round-trip AI model choices', async () => {
      const password = 'SecurePassword123!';
      const sources = {
        ...mockDataSources,
        settings: { ...mockDataSources.settings!, aiProvider: 'anthropic', anthropicModel: 'claude-x', openaiModel: 'gpt-y', ollamaModel: 'llama-z' } as Settings,
      };
      const encrypted = await exportToEncryptedJson(sources, { password });

      const result = await parseEncryptedBackup(encrypted, password);

      expect(result.fullSettings).toMatchObject({
        aiProvider: 'anthropic',
        anthropicModel: 'claude-x',
        openaiModel: 'gpt-y',
        ollamaModel: 'llama-z',
      });
      // The unencrypted settings section never carries the key
      expect(result.settings).not.toHaveProperty('aiApiKey');
      expect(result.settings).toMatchObject({ anthropicModel: 'claude-x' });
    });

    it('should include fullSettings with API key', async () => {
      const password = 'SecurePassword123!';
      const encrypted = await exportToEncryptedJson(mockDataSources, { password });

      const result = await parseEncryptedBackup(encrypted, password);

      expect(result.fullSettings).toBeDefined();
      expect(result.fullSettings?.aiApiKey).toBe('sk-test-api-key-123');
      expect(result.fullSettings?.aiProvider).toBe('openai');
    });

    it('should deserialize dates correctly', async () => {
      const password = 'SecurePassword123!';
      const encrypted = await exportToEncryptedJson(mockDataSources, { password });

      const result = await parseEncryptedBackup(encrypted, password);

      expect(result.labResults[0].date).toBeInstanceOf(Date);
      expect(result.labResults[0].createdAt).toBeInstanceOf(Date);
      expect(result.exportedAt).toBeInstanceOf(Date);
    });

    it('refuses a backup made before tests were identified by LOINC', async () => {
      const password = 'SecurePassword123!';
      const v1Payload = {
        schemaVersion: 1,
        exportedAt: '2024-03-01T00:00:00.000Z',
        appVersion: '1.0.0',
        labResults: [
          { id: 1, date: '2024-01-15T00:00:00.000Z', labName: 'Lab', createdAt: '2024-01-15T00:00:00.000Z', updatedAt: '2024-01-15T00:00:00.000Z' },
        ],
        testValues: [
          { id: 1, labResultId: 1, biomarkerId: 3, value: 14.5, unit: 'g/dL', createdAt: '2024-01-15T00:00:00.000Z', updatedAt: '2024-01-15T00:00:00.000Z' },
        ],
        userNotes: [],
        userPreferences: null,
        settings: null,
      };
      const { payload, metadata } = await encryptForBackup(JSON.stringify(v1Payload), password);
      const encrypted = JSON.stringify({
        type: ENCRYPTED_BACKUP_TYPE_ID,
        version: ENCRYPTED_BACKUP_SCHEMA_VERSION,
        encryption: metadata,
        payload,
      });

      await expect(parseEncryptedBackup(encrypted, password)).rejects.toThrow(
        'This backup was made before tests were identified by LOINC and cannot be restored. Re-import your reports instead.'
      );
    });

    it('should throw error with wrong password', async () => {
      const password = 'SecurePassword123!';
      const wrongPassword = 'WrongPassword456!';
      const encrypted = await exportToEncryptedJson(mockDataSources, { password });

      await expect(parseEncryptedBackup(encrypted, wrongPassword)).rejects.toThrow(
        'Unable to decrypt backup'
      );
    });

    it('should throw error with invalid JSON', async () => {
      await expect(parseEncryptedBackup('not json', 'password')).rejects.toThrow(
        'Invalid backup file format'
      );
    });

    it('should throw error with invalid structure', async () => {
      const invalidStructure = JSON.stringify({
        type: ENCRYPTED_BACKUP_TYPE_ID,
        version: ENCRYPTED_BACKUP_SCHEMA_VERSION,
        // Missing encryption and payload
      });

      await expect(parseEncryptedBackup(invalidStructure, 'password')).rejects.toThrow(
        'Invalid encrypted backup structure'
      );
    });
  });

  describe('validateBackupPassword', () => {
    it('should return true for correct password', async () => {
      const password = 'SecurePassword123!';
      const encrypted = await exportToEncryptedJson(mockDataSources, { password });
      const parsed = JSON.parse(encrypted);

      const result = await validateBackupPassword(parsed, password);

      expect(result).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const password = 'SecurePassword123!';
      const wrongPassword = 'WrongPassword456!';
      const encrypted = await exportToEncryptedJson(mockDataSources, { password });
      const parsed = JSON.parse(encrypted);

      const result = await validateBackupPassword(parsed, wrongPassword);

      expect(result).toBe(false);
    });
  });

  describe('getEncryptedImportPreview', () => {
    it('should return correct preview data', async () => {
      const password = 'SecurePassword123!';
      const encrypted = await exportToEncryptedJson(mockDataSources, { password });
      const parsed = await parseEncryptedBackup(encrypted, password);

      const preview = getEncryptedImportPreview(parsed);

      expect(preview.labResultCount).toBe(1);
      expect(preview.testValueCount).toBe(1);
      expect(preview.noteCount).toBe(1);
      expect(preview.hasSettings).toBe(true);
      expect(preview.hasApiKey).toBe(true);
      expect(preview.hasPreferences).toBe(true);
      expect(preview.wasEncrypted).toBe(true);
      expect(preview.exportedAt).toBeInstanceOf(Date);
    });

    it('should correctly indicate missing API key', async () => {
      const sourcesWithoutApiKey: ExportDataSources = {
        ...mockDataSources,
        settings: {
          storageProvider: 'local',
          aiProvider: 'openai',
          language: 'en',
          // No aiApiKey
        } as Settings,
      };

      const password = 'SecurePassword123!';
      const encrypted = await exportToEncryptedJson(sourcesWithoutApiKey, { password });
      const parsed = await parseEncryptedBackup(encrypted, password);

      const preview = getEncryptedImportPreview(parsed);

      expect(preview.hasApiKey).toBe(false);
    });

    it('should handle empty data', async () => {
      const emptySources: ExportDataSources = {
        labResults: [],
        testValues: [],
        userNotes: [],
        userPreferences: null,
        settings: null,
      };

      const password = 'SecurePassword123!';
      const encrypted = await exportToEncryptedJson(emptySources, { password });
      const parsed = await parseEncryptedBackup(encrypted, password);

      const preview = getEncryptedImportPreview(parsed);

      expect(preview.labResultCount).toBe(0);
      expect(preview.testValueCount).toBe(0);
      expect(preview.noteCount).toBe(0);
      expect(preview.hasSettings).toBe(false);
      expect(preview.hasApiKey).toBe(false);
      expect(preview.hasPreferences).toBe(false);
    });
  });

  describe('roundtrip encryption', () => {
    it('should preserve all data through encrypt/decrypt cycle', async () => {
      const password = 'ComplexP@ssword123!';
      const encrypted = await exportToEncryptedJson(mockDataSources, { password });
      const restored = await parseEncryptedBackup(encrypted, password);

      // Verify lab results
      expect(restored.labResults).toHaveLength(mockDataSources.labResults.length);
      expect(restored.labResults[0].labName).toBe(mockDataSources.labResults[0].labName);

      // Verify test values
      expect(restored.testValues).toHaveLength(mockDataSources.testValues.length);
      expect(restored.testValues[0].value).toBe(mockDataSources.testValues[0].value);
      expect(restored.testValues[0].unit).toBe(mockDataSources.testValues[0].unit);

      // Verify notes
      expect(restored.userNotes).toHaveLength(mockDataSources.userNotes.length);
      expect(restored.userNotes[0].content).toBe(mockDataSources.userNotes[0].content);

      // Verify settings including API key
      expect(restored.fullSettings?.aiApiKey).toBe(mockDataSources.settings?.aiApiKey);
      expect(restored.fullSettings?.aiProvider).toBe(mockDataSources.settings?.aiProvider);
    });

    it('should handle unicode content', async () => {
      const unicodeSources: ExportDataSources = {
        ...mockDataSources,
        userNotes: [
          {
            id: 1,
            content: 'Note with unicode: 世界 🌍 Привет мир! €£¥',
            tags: ['unicode', '日本語'],
            createdAt: new Date('2024-01-15'),
            updatedAt: new Date('2024-01-15'),
          },
        ],
        labResults: [
          {
            id: 1,
            date: new Date('2024-01-15'),
            labName: 'Лаборатория テスト',
            createdAt: new Date('2024-01-15'),
            updatedAt: new Date('2024-01-15'),
          },
        ],
      };

      const password = 'SecurePassword123!';
      const encrypted = await exportToEncryptedJson(unicodeSources, { password });
      const restored = await parseEncryptedBackup(encrypted, password);

      expect(restored.userNotes[0].content).toBe(unicodeSources.userNotes[0].content);
      expect(restored.userNotes[0].tags).toEqual(unicodeSources.userNotes[0].tags);
      expect(restored.labResults[0].labName).toBe(unicodeSources.labResults[0].labName);
    });
  });
});
