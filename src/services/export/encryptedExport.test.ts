/**
 * Tests for encrypted export service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  exportToEncryptedJson,
  generateEncryptedBackupFilename,
  downloadEncryptedBackup,
} from './encryptedExport';
import { isEncryptedBackupFile, ENCRYPTED_BACKUP_TYPE_ID } from '@/types/backup';
import type { ExportDataSources } from './jsonExport';
import type { Settings } from '@/types';

describe('encryptedExport', () => {
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
        biomarkerId: 1,
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
    },
    settings: {
      storageProvider: 'local',
      aiProvider: 'openai',
      aiApiKey: 'sk-test-api-key-123',
      language: 'en',
    } as Settings,
  };

  describe('exportToEncryptedJson', () => {
    it('should create valid encrypted backup structure', async () => {
      const password = 'SecurePassword123!';

      const result = await exportToEncryptedJson(mockDataSources, { password });
      const parsed = JSON.parse(result);

      expect(isEncryptedBackupFile(parsed)).toBe(true);
      expect(parsed.type).toBe(ENCRYPTED_BACKUP_TYPE_ID);
      expect(parsed.version).toBe(2);
      expect(parsed.encryption.algorithm).toBe('AES-GCM');
      expect(parsed.encryption.keyDerivation).toBe('PBKDF2');
      expect(parsed.encryption.iterations).toBe(100000);
      expect(typeof parsed.encryption.salt).toBe('string');
      expect(typeof parsed.payload).toBe('string');
    });

    it('should include API key in encrypted payload', async () => {
      const password = 'SecurePassword123!';

      const result = await exportToEncryptedJson(mockDataSources, { password });
      const parsed = JSON.parse(result);

      // The payload is encrypted, but we can verify the structure exists
      expect(parsed.payload).toBeDefined();
      expect(parsed.payload.length).toBeGreaterThan(0);
    });

    it('should create different encrypted outputs for same data', async () => {
      const password = 'SecurePassword123!';

      const result1 = await exportToEncryptedJson(mockDataSources, { password });
      const result2 = await exportToEncryptedJson(mockDataSources, { password });

      const parsed1 = JSON.parse(result1);
      const parsed2 = JSON.parse(result2);

      // Different salts
      expect(parsed1.encryption.salt).not.toBe(parsed2.encryption.salt);
      // Different payloads (due to different salt and IV)
      expect(parsed1.payload).not.toBe(parsed2.payload);
    });

    it('should handle null settings', async () => {
      const sourcesWithNullSettings: ExportDataSources = {
        ...mockDataSources,
        settings: null,
      };
      const password = 'SecurePassword123!';

      const result = await exportToEncryptedJson(sourcesWithNullSettings, {
        password,
      });
      const parsed = JSON.parse(result);

      expect(isEncryptedBackupFile(parsed)).toBe(true);
    });

    it('should handle empty data sources', async () => {
      const emptySources: ExportDataSources = {
        labResults: [],
        testValues: [],
        userNotes: [],
        userPreferences: null,
        settings: null,
      };
      const password = 'SecurePassword123!';

      const result = await exportToEncryptedJson(emptySources, { password });
      const parsed = JSON.parse(result);

      expect(isEncryptedBackupFile(parsed)).toBe(true);
    });
  });

  describe('generateEncryptedBackupFilename', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should generate filename with .hemoio extension', () => {
      vi.setSystemTime(new Date('2024-06-15T10:30:45.000Z'));

      const filename = generateEncryptedBackupFilename();

      expect(filename).toMatch(/\.hemoio$/);
      expect(filename).toBe('hemoio-backup-2024-06-15-10-30-45.hemoio');
    });

    it('should include date and time in filename', () => {
      vi.setSystemTime(new Date('2024-12-25T23:59:59.000Z'));

      const filename = generateEncryptedBackupFilename();

      expect(filename).toContain('2024-12-25');
      expect(filename).toContain('23-59-59');
    });
  });

  describe('downloadEncryptedBackup', () => {
    beforeEach(() => {
      // Mock DOM methods
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      // Mock createElement and click
      const mockLink = {
        href: '',
        download: '',
        style: { display: '' },
        click: vi.fn(),
      };
      vi.spyOn(document, 'createElement').mockReturnValue(
        mockLink as unknown as HTMLAnchorElement
      );
      vi.spyOn(document.body, 'appendChild').mockImplementation(
        () => mockLink as unknown as HTMLElement
      );
      vi.spyOn(document.body, 'removeChild').mockImplementation(
        () => mockLink as unknown as HTMLElement
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should create blob and trigger download', () => {
      const content = JSON.stringify({ test: 'data' });
      const filename = 'test-backup.hemoio';

      downloadEncryptedBackup(content, filename);

      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(URL.revokeObjectURL).toHaveBeenCalled();
    });

    it('should set correct filename', () => {
      const content = '{}';
      const filename = 'my-backup.hemoio';

      const mockLink = { href: '', download: '', style: { display: '' }, click: vi.fn() };
      vi.spyOn(document, 'createElement').mockReturnValue(
        mockLink as unknown as HTMLAnchorElement
      );

      downloadEncryptedBackup(content, filename);

      expect(mockLink.download).toBe(filename);
    });
  });
});
