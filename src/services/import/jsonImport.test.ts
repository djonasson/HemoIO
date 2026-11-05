/**
 * Tests for JSON Import Service
 */

import { describe, it, expect } from 'vitest';
import {
  parseBackupJson,
  validateBackupFile,
  createIdMapping,
  updateTestValueReferences,
  updateNoteReferences,
  getImportPreview,
  UNKNOWN_KEY_BACKUP_MESSAGE,
  type ParsedBackupData,
} from './jsonImport';
import { BACKUP_SCHEMA_VERSION, exportToJson, type ExportDataSources } from '../export/jsonExport';
import type { LabResult, TestValue, UserNote } from '@/types';

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
    biomarkerKey: '2345-7',
    value: 95,
    unit: 'mg/dL',
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
  };
}

function createMockNote(id: number, labResultId?: number): UserNote {
  return {
    id,
    labResultId,
    content: 'Test note',
    tags: ['test'],
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
  };
}

function createMockDataSources(): ExportDataSources {
  return {
    labResults: [createMockLabResult(1), createMockLabResult(2)],
    testValues: [createMockTestValue(1, 1), createMockTestValue(2, 2)],
    userNotes: [createMockNote(1, 1)],
    userPreferences: {
      id: 1,
      unitPreferences: { 1: 'mg/dL' },
      personalTargets: {},
      theme: 'light',
      dateFormat: 'MM/DD/YYYY',
    },
    settings: {
      id: 1,
      storageProvider: 'local',
      aiProvider: 'openai',
      language: 'en',
    },
  };
}

describe('jsonImport', () => {
  describe('parseBackupJson', () => {
    it('should parse valid backup JSON', () => {
      const sources = createMockDataSources();
      const json = exportToJson(sources);

      const parsed = parseBackupJson(json);

      expect(parsed.labResults).toHaveLength(2);
      expect(parsed.testValues).toHaveLength(2);
      expect(parsed.userNotes).toHaveLength(1);
    });

    it('accepts values keyed by a LOINC code or an unknown key', () => {
      const sources = createMockDataSources();
      sources.testValues[1] = { ...sources.testValues[1], biomarkerKey: 'unknown:zorblatina' };

      expect(parseBackupJson(exportToJson(sources)).testValues).toHaveLength(2);
    });

    it.each(['glucose', 'marker-1', '2345-77', 'unknown:', '<img src=x>', ''])(
      'refuses a backup with a value keyed %j, which no HemoIO writes',
      (key) => {
        const sources = createMockDataSources();
        sources.testValues[0] = { ...sources.testValues[0], biomarkerKey: key };

        expect(() => parseBackupJson(exportToJson(sources))).toThrow(UNKNOWN_KEY_BACKUP_MESSAGE);
      }
    );

    it('refuses a backup with a note on a key no HemoIO writes', () => {
      const sources = createMockDataSources();
      sources.userNotes[0] = { ...sources.userNotes[0], biomarkerKey: 'glucose' };

      expect(() => parseBackupJson(exportToJson(sources))).toThrow(UNKNOWN_KEY_BACKUP_MESSAGE);
    });

    it('should convert date strings to Date objects', () => {
      const sources = createMockDataSources();
      const json = exportToJson(sources);

      const parsed = parseBackupJson(json);

      expect(parsed.labResults[0].date).toBeInstanceOf(Date);
      expect(parsed.labResults[0].createdAt).toBeInstanceOf(Date);
      expect(parsed.labResults[0].updatedAt).toBeInstanceOf(Date);
    });

    it('should preserve IDs for mapping during restore', () => {
      // IDs are preserved during parsing so they can be used for ID mapping
      // during the restore process. They are stripped when inserting into the database.
      const sources = createMockDataSources();
      const json = exportToJson(sources);

      const parsed = parseBackupJson(json);

      // IDs should be preserved for mapping
      expect(parsed.labResults[0].id).toBe(1);
      expect(parsed.testValues[0].id).toBe(1);
      expect(parsed.userNotes[0].id).toBe(1);
    });

    it('should preserve labResultId references', () => {
      const sources = createMockDataSources();
      const json = exportToJson(sources);

      const parsed = parseBackupJson(json);

      expect(parsed.testValues[0].labResultId).toBe(1);
      expect(parsed.testValues[1].labResultId).toBe(2);
    });

    it('should throw on invalid JSON', () => {
      expect(() => parseBackupJson('not valid json')).toThrow('Invalid JSON format');
    });

    it('should throw on invalid backup structure', () => {
      expect(() => parseBackupJson('{"foo": "bar"}')).toThrow('Invalid backup file structure');
    });

    it('should throw on newer schema version', () => {
      const data = {
        schemaVersion: 999,
        exportedAt: new Date().toISOString(),
        appVersion: '1.0.0',
        labResults: [],
        testValues: [],
        userNotes: [],
      };

      expect(() => parseBackupJson(JSON.stringify(data))).toThrow(
        /created with a newer version/
      );
    });

    it('should include exportedAt date', () => {
      const sources = createMockDataSources();
      const json = exportToJson(sources);

      const parsed = parseBackupJson(json);

      expect(parsed.exportedAt).toBeInstanceOf(Date);
    });

    it('should include schema version', () => {
      const sources = createMockDataSources();
      const json = exportToJson(sources);

      const parsed = parseBackupJson(json);

      expect(parsed.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    });
  });

  describe('validateBackupFile', () => {
    it('should accept valid JSON file', () => {
      const file = new File(['{}'], 'backup.json', { type: 'application/json' });
      const result = validateBackupFile(file);

      expect(result.valid).toBe(true);
    });

    it('should reject non-JSON file', () => {
      const file = new File(['data'], 'backup.txt', { type: 'text/plain' });
      const result = validateBackupFile(file);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('File must be a JSON file');
    });

    it('should reject files over 50MB', () => {
      // Create a mock file with size > 50MB
      const largeContent = new ArrayBuffer(51 * 1024 * 1024);
      const file = new File([largeContent], 'backup.json', { type: 'application/json' });

      const result = validateBackupFile(file);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('File is too large (max 50MB)');
    });
  });

  describe('createIdMapping', () => {
    it('should create mapping from old IDs to new IDs', () => {
      const originalData = [{ id: 10 }, { id: 20 }, { id: 30 }];
      const newIds = [100, 200, 300];

      const mapping = createIdMapping(originalData, newIds);

      expect(mapping.get(10)).toBe(100);
      expect(mapping.get(20)).toBe(200);
      expect(mapping.get(30)).toBe(300);
    });

    it('should handle undefined IDs', () => {
      const originalData = [{ id: 10 }, { id: undefined }, { id: 30 }];
      const newIds = [100, 200, 300];

      const mapping = createIdMapping(originalData, newIds);

      expect(mapping.size).toBe(2);
      expect(mapping.has(10)).toBe(true);
      expect(mapping.has(30)).toBe(true);
    });
  });

  describe('updateTestValueReferences', () => {
    it('should update labResultId references', () => {
      const testValues: TestValue[] = [
        createMockTestValue(1, 10),
        createMockTestValue(2, 20),
      ];
      const mapping = new Map<number, number>([
        [10, 100],
        [20, 200],
      ]);

      const updated = updateTestValueReferences(testValues, mapping);

      expect(updated[0].labResultId).toBe(100);
      expect(updated[1].labResultId).toBe(200);
    });

    it('should preserve unmapped references', () => {
      const testValues: TestValue[] = [createMockTestValue(1, 999)];
      const mapping = new Map<number, number>();

      const updated = updateTestValueReferences(testValues, mapping);

      expect(updated[0].labResultId).toBe(999);
    });
  });

  describe('updateNoteReferences', () => {
    it('should update labResultId references', () => {
      const notes: UserNote[] = [
        createMockNote(1, 10),
        createMockNote(2, 20),
      ];
      const mapping = new Map<number, number>([
        [10, 100],
        [20, 200],
      ]);

      const updated = updateNoteReferences(notes, mapping);

      expect(updated[0].labResultId).toBe(100);
      expect(updated[1].labResultId).toBe(200);
    });

    it('should handle notes without labResultId', () => {
      const notes: UserNote[] = [createMockNote(1)]; // No labResultId
      const mapping = new Map<number, number>();

      const updated = updateNoteReferences(notes, mapping);

      expect(updated[0].labResultId).toBeUndefined();
    });
  });

  describe('getImportPreview', () => {
    it('should return correct counts', () => {
      const parsed: ParsedBackupData = {
        labResults: [createMockLabResult(1), createMockLabResult(2)],
        testValues: [createMockTestValue(1, 1)],
        userNotes: [createMockNote(1)],
        settings: { storageProvider: 'local', aiProvider: 'openai', language: 'en' },
        userPreferences: { id: 1, unitPreferences: {}, personalTargets: {}, theme: 'light', dateFormat: 'MM/DD/YYYY' },
        schemaVersion: 1,
        exportedAt: new Date('2024-01-15'),
      };

      const preview = getImportPreview(parsed);

      expect(preview.labResultCount).toBe(2);
      expect(preview.testValueCount).toBe(1);
      expect(preview.noteCount).toBe(1);
      expect(preview.hasSettings).toBe(true);
      expect(preview.hasPreferences).toBe(true);
      expect(preview.schemaVersion).toBe(1);
    });

    it('should handle null settings and preferences', () => {
      const parsed: ParsedBackupData = {
        labResults: [],
        testValues: [],
        userNotes: [],
        settings: null,
        userPreferences: null,
        schemaVersion: 1,
        exportedAt: new Date(),
      };

      const preview = getImportPreview(parsed);

      expect(preview.hasSettings).toBe(false);
      expect(preview.hasPreferences).toBe(false);
    });
  });

  describe('backups made before tests were identified by LOINC', () => {
    const at = '2024-01-15T00:00:00.000Z';
    const REFUSAL =
      'This backup was made before tests were identified by LOINC and cannot be restored. Re-import your reports instead.';
    const backup = (schemaVersion: number) => ({
      schemaVersion,
      exportedAt: at,
      appVersion: '1.0.0',
      labResults: [{ id: 1, date: at, labName: 'Lab', createdAt: at, updatedAt: at }],
      testValues: [
        { id: 1, labResultId: 1, biomarkerKey: '2345-7', rawText: 'Glucose', value: 95, unit: 'mg/dL', createdAt: at, updatedAt: at },
      ],
      userNotes: [],
      userPreferences: null,
      settings: null,
    });

    it.each([1, 2, 3])('refuses a version %i backup with the message', (version) => {
      expect(() => parseBackupJson(JSON.stringify(backup(version)))).toThrow(REFUSAL);
    });

    it('restores a version 4 backup as it is', () => {
      const parsed = parseBackupJson(JSON.stringify(backup(4)));

      expect(parsed.testValues.map((tv) => tv.biomarkerKey)).toEqual(['2345-7']);
      expect(parsed.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    });

    it('rejects backups from a newer version', () => {
      expect(() =>
        parseBackupJson(JSON.stringify(backup(BACKUP_SCHEMA_VERSION + 1)))
      ).toThrow(/newer version/);
    });
  });
});
