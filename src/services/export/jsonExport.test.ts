/**
 * Tests for JSON Export Service
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  exportToJson,
  generateBackupFilename,
  downloadJson,
  getBackupStats,
  isValidBackupData,
  BACKUP_SCHEMA_VERSION,
  type ExportDataSources,
  type BackupData,
} from './jsonExport';
import type { LabResult, TestValue, UserNote, Settings, UserPreferences } from '@/types';

function createMockLabResult(id: number): LabResult {
  return {
    id,
    date: new Date('2024-01-15'),
    labName: 'Quest Diagnostics',
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
  };
}

function createMockTestValue(id: number, labResultId: number): TestValue {
  return {
    id,
    labResultId,
    biomarkerId: 1,
    value: 95,
    unit: 'mg/dL',
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
  };
}

function createMockNote(id: number): UserNote {
  return {
    id,
    content: 'Test note',
    tags: ['test'],
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
  };
}

function createMockSettings(): Settings {
  return {
    id: 1,
    storageProvider: 'local',
    aiProvider: 'openai',
    aiApiKey: 'sk-secret-key',
    language: 'en',
  };
}

function createMockPreferences(): UserPreferences {
  return {
    id: 1,
    unitPreferences: { 1: 'mg/dL' },
    personalTargets: { 1: { low: 70, high: 100 } },
    theme: 'light',
    dateFormat: 'MM/DD/YYYY',
  };
}

function createMockDataSources(): ExportDataSources {
  return {
    labResults: [createMockLabResult(1), createMockLabResult(2)],
    testValues: [createMockTestValue(1, 1), createMockTestValue(2, 2)],
    userNotes: [createMockNote(1)],
    userPreferences: createMockPreferences(),
    settings: createMockSettings(),
  };
}

describe('jsonExport', () => {
  describe('exportToJson', () => {
    it('should export valid JSON', () => {
      const sources = createMockDataSources();
      const json = exportToJson(sources);

      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should include schema version', () => {
      const sources = createMockDataSources();
      const json = exportToJson(sources);
      const data = JSON.parse(json) as BackupData;

      expect(data.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    });

    it('should include export timestamp', () => {
      const sources = createMockDataSources();
      const json = exportToJson(sources);
      const data = JSON.parse(json) as BackupData;

      expect(data.exportedAt).toBeDefined();
      expect(new Date(data.exportedAt).getTime()).not.toBeNaN();
    });

    it('should include app version', () => {
      const sources = createMockDataSources();
      const json = exportToJson(sources);
      const data = JSON.parse(json) as BackupData;

      expect(data.appVersion).toBe('1.0.0');
    });

    it('should include all lab results', () => {
      const sources = createMockDataSources();
      const json = exportToJson(sources);
      const data = JSON.parse(json) as BackupData;

      expect(data.labResults).toHaveLength(2);
    });

    it('should include all test values', () => {
      const sources = createMockDataSources();
      const json = exportToJson(sources);
      const data = JSON.parse(json) as BackupData;

      expect(data.testValues).toHaveLength(2);
    });

    it('should include all user notes', () => {
      const sources = createMockDataSources();
      const json = exportToJson(sources);
      const data = JSON.parse(json) as BackupData;

      expect(data.userNotes).toHaveLength(1);
    });

    it('should include user preferences', () => {
      const sources = createMockDataSources();
      const json = exportToJson(sources);
      const data = JSON.parse(json) as BackupData;

      expect(data.userPreferences).not.toBeNull();
      expect(data.userPreferences?.theme).toBe('light');
    });

    it('should exclude preferences when option is false', () => {
      const sources = createMockDataSources();
      const json = exportToJson(sources, { includePreferences: false });
      const data = JSON.parse(json) as BackupData;

      expect(data.userPreferences).toBeNull();
    });

    it('should sanitize settings to remove API key', () => {
      const sources = createMockDataSources();
      const json = exportToJson(sources);
      const data = JSON.parse(json) as BackupData;

      expect(data.settings).not.toBeNull();
      expect((data.settings as any).aiApiKey).toBeUndefined();
      expect(data.settings?.storageProvider).toBe('local');
    });

    it('should exclude settings when option is false', () => {
      const sources = createMockDataSources();
      const json = exportToJson(sources, { includeSettings: false });
      const data = JSON.parse(json) as BackupData;

      expect(data.settings).toBeNull();
    });

    it('should serialize dates to ISO strings', () => {
      const sources = createMockDataSources();
      const json = exportToJson(sources);
      const data = JSON.parse(json) as BackupData;

      expect(typeof data.labResults[0].date).toBe('string');
      expect(data.labResults[0].date).toContain('2024-01-15');
    });

    it('should pretty print when option is true', () => {
      const sources = createMockDataSources();
      const json = exportToJson(sources, { prettyPrint: true });

      expect(json).toContain('\n');
      expect(json).toContain('  ');
    });

    it('should not pretty print by default', () => {
      const sources = createMockDataSources();
      const json = exportToJson(sources);

      expect(json).not.toContain('\n');
    });

    it('should handle null preferences', () => {
      const sources = createMockDataSources();
      sources.userPreferences = null;
      const json = exportToJson(sources);
      const data = JSON.parse(json) as BackupData;

      expect(data.userPreferences).toBeNull();
    });

    it('should handle null settings', () => {
      const sources = createMockDataSources();
      sources.settings = null;
      const json = exportToJson(sources);
      const data = JSON.parse(json) as BackupData;

      expect(data.settings).toBeNull();
    });

    it('should handle empty data', () => {
      const sources: ExportDataSources = {
        labResults: [],
        testValues: [],
        userNotes: [],
        userPreferences: null,
        settings: null,
      };
      const json = exportToJson(sources);
      const data = JSON.parse(json) as BackupData;

      expect(data.labResults).toHaveLength(0);
      expect(data.testValues).toHaveLength(0);
      expect(data.userNotes).toHaveLength(0);
    });
  });

  describe('generateBackupFilename', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-15T14:30:45.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should generate filename with date and time', () => {
      const filename = generateBackupFilename();

      expect(filename).toBe('hemoio-backup-2024-06-15-14-30-45.json');
    });
  });

  describe('getBackupStats', () => {
    it('should return correct counts', () => {
      const sources = createMockDataSources();
      const stats = getBackupStats(sources);

      expect(stats.labResultCount).toBe(2);
      expect(stats.testValueCount).toBe(2);
      expect(stats.noteCount).toBe(1);
      expect(stats.hasSettings).toBe(true);
      expect(stats.hasPreferences).toBe(true);
    });

    it('should handle null settings', () => {
      const sources = createMockDataSources();
      sources.settings = null;
      const stats = getBackupStats(sources);

      expect(stats.hasSettings).toBe(false);
    });

    it('should handle null preferences', () => {
      const sources = createMockDataSources();
      sources.userPreferences = null;
      const stats = getBackupStats(sources);

      expect(stats.hasPreferences).toBe(false);
    });
  });

  describe('isValidBackupData', () => {
    it('should return true for valid backup data', () => {
      const sources = createMockDataSources();
      const json = exportToJson(sources);
      const data = JSON.parse(json);

      expect(isValidBackupData(data)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isValidBackupData(null)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isValidBackupData('string')).toBe(false);
      expect(isValidBackupData(123)).toBe(false);
    });

    it('should return false for missing schemaVersion', () => {
      const data = {
        exportedAt: '2024-01-15',
        appVersion: '1.0.0',
        labResults: [],
        testValues: [],
        userNotes: [],
      };
      expect(isValidBackupData(data)).toBe(false);
    });

    it('should return false for missing exportedAt', () => {
      const data = {
        schemaVersion: 1,
        appVersion: '1.0.0',
        labResults: [],
        testValues: [],
        userNotes: [],
      };
      expect(isValidBackupData(data)).toBe(false);
    });

    it('should return false for missing labResults', () => {
      const data = {
        schemaVersion: 1,
        exportedAt: '2024-01-15',
        appVersion: '1.0.0',
        testValues: [],
        userNotes: [],
      };
      expect(isValidBackupData(data)).toBe(false);
    });

    it('should return false for non-array labResults', () => {
      const data = {
        schemaVersion: 1,
        exportedAt: '2024-01-15',
        appVersion: '1.0.0',
        labResults: 'not an array',
        testValues: [],
        userNotes: [],
      };
      expect(isValidBackupData(data)).toBe(false);
    });
  });

  describe('downloadJson', () => {
    it('should create and click download link', () => {
      const mockCreateObjectURL = vi.fn(() => 'blob:test');
      const mockRevokeObjectURL = vi.fn();
      const mockClick = vi.fn();
      const mockAppendChild = vi.fn();
      const mockRemoveChild = vi.fn();

      vi.stubGlobal('URL', {
        ...URL,
        createObjectURL: mockCreateObjectURL,
        revokeObjectURL: mockRevokeObjectURL,
      });

      const mockLink = {
        href: '',
        download: '',
        style: { display: '' },
        click: mockClick,
      };

      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
      vi.spyOn(document.body, 'appendChild').mockImplementation(mockAppendChild);
      vi.spyOn(document.body, 'removeChild').mockImplementation(mockRemoveChild);

      downloadJson('{"test": true}', 'backup.json');

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockLink.download).toBe('backup.json');
      expect(mockClick).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalled();
    });
  });
});
