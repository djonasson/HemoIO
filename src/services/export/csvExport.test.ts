/**
 * Tests for CSV Export Service
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  exportToCsv,
  generateCsvFilename,
  downloadCsv,
  type LabResultForExport,
} from './csvExport';
import type { LabResult, TestValue } from '@/types';

function createMockLabResult(id: number, date: string, labName: string): LabResult {
  return {
    id,
    date: new Date(date),
    labName,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createMockTestValue(
  id: number,
  labResultId: number,
  biomarkerId: number,
  value: number,
  unit: string,
  refLow?: number,
  refHigh?: number
): TestValue {
  return {
    id,
    labResultId,
    biomarkerId,
    value,
    unit,
    referenceRangeLow: refLow,
    referenceRangeHigh: refHigh,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createMockExportData(): LabResultForExport[] {
  const labResult1 = createMockLabResult(1, '2024-01-15', 'Quest Diagnostics');
  const labResult2 = createMockLabResult(2, '2024-03-20', 'LabCorp');

  const biomarkerNames = new Map<number, string>([
    [1, 'Glucose'],
    [2, 'Hemoglobin'],
    [3, 'Cholesterol'],
  ]);

  return [
    {
      labResult: labResult1,
      testValues: [
        createMockTestValue(1, 1, 1, 95, 'mg/dL', 70, 100),
        createMockTestValue(2, 1, 2, 14.5, 'g/dL', 12.0, 17.5),
      ],
      biomarkerNames,
    },
    {
      labResult: labResult2,
      testValues: [
        createMockTestValue(3, 2, 1, 102, 'mg/dL', 70, 100),
        createMockTestValue(4, 2, 3, 185, 'mg/dL', 0, 200),
      ],
      biomarkerNames,
    },
  ];
}

describe('csvExport', () => {
  describe('exportToCsv', () => {
    it('should export basic CSV with headers', () => {
      const data = createMockExportData();
      const csv = exportToCsv(data);

      const lines = csv.split('\n');
      expect(lines[0]).toBe('Date,Lab Name,Biomarker,Value,Unit,Reference Low,Reference High');
    });

    it('should export all test values', () => {
      const data = createMockExportData();
      const csv = exportToCsv(data);

      const lines = csv.split('\n');
      // Header + 4 test values
      expect(lines).toHaveLength(5);
    });

    it('should format dates in ISO format by default', () => {
      const data = createMockExportData();
      const csv = exportToCsv(data);

      expect(csv).toContain('2024-01-15');
      expect(csv).toContain('2024-03-20');
    });

    it('should format dates in US format when specified', () => {
      const data = createMockExportData();
      const csv = exportToCsv(data, { dateFormat: 'us' });

      expect(csv).toContain('1/15/2024');
      expect(csv).toContain('3/20/2024');
    });

    it('should format dates in EU format when specified', () => {
      const data = createMockExportData();
      const csv = exportToCsv(data, { dateFormat: 'eu' });

      expect(csv).toContain('15/1/2024');
      expect(csv).toContain('20/3/2024');
    });

    it('should include lab name and biomarker name', () => {
      const data = createMockExportData();
      const csv = exportToCsv(data);

      expect(csv).toContain('Quest Diagnostics');
      expect(csv).toContain('LabCorp');
      expect(csv).toContain('Glucose');
      expect(csv).toContain('Hemoglobin');
    });

    it('should include reference ranges by default', () => {
      const data = createMockExportData();
      const csv = exportToCsv(data);

      expect(csv).toContain('Reference Low');
      expect(csv).toContain('Reference High');
      expect(csv).toContain('70');
      expect(csv).toContain('100');
    });

    it('should exclude reference ranges when option is false', () => {
      const data = createMockExportData();
      const csv = exportToCsv(data, { includeReferenceRanges: false });

      const lines = csv.split('\n');
      expect(lines[0]).toBe('Date,Lab Name,Biomarker,Value,Unit');
    });

    it('should include confidence when option is true', () => {
      const data = createMockExportData();
      data[0].testValues[0].confidence = 0.95;

      const csv = exportToCsv(data, { includeConfidence: true });

      expect(csv).toContain('Confidence');
      expect(csv).toContain('0.95');
    });

    it('should filter by date range', () => {
      const data = createMockExportData();
      const csv = exportToCsv(data, {
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-04-01'),
      });

      const lines = csv.split('\n');
      // Header + 2 test values from March 2024
      expect(lines).toHaveLength(3);
      expect(csv).not.toContain('2024-01-15');
      expect(csv).toContain('2024-03-20');
    });

    it('should filter by biomarker IDs', () => {
      const data = createMockExportData();
      const csv = exportToCsv(data, { biomarkerIds: [1] }); // Only Glucose

      const lines = csv.split('\n');
      // Header + 2 Glucose values
      expect(lines).toHaveLength(3);
      expect(csv).toContain('Glucose');
      expect(csv).not.toContain('Hemoglobin');
      expect(csv).not.toContain('Cholesterol');
    });

    it('should escape commas in values', () => {
      const data = createMockExportData();
      data[0].labResult.labName = 'Lab, Inc.';

      const csv = exportToCsv(data);

      expect(csv).toContain('"Lab, Inc."');
    });

    it('should escape quotes in values', () => {
      const data = createMockExportData();
      data[0].labResult.labName = 'Lab "Test"';

      const csv = exportToCsv(data);

      expect(csv).toContain('"Lab ""Test"""');
    });

    it('should escape newlines in values', () => {
      const data = createMockExportData();
      data[0].labResult.labName = 'Lab\nTest';

      const csv = exportToCsv(data);

      expect(csv).toContain('"Lab\nTest"');
    });

    it('should handle empty results', () => {
      const csv = exportToCsv([]);

      const lines = csv.split('\n');
      expect(lines).toHaveLength(1); // Just header
    });

    it('should handle unknown biomarker names', () => {
      const data = createMockExportData();
      data[0].testValues[0].biomarkerId = 999; // Unknown

      const csv = exportToCsv(data);

      expect(csv).toContain('Unknown');
    });
  });

  describe('generateCsvFilename', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-06-15'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should generate filename with current date', () => {
      const filename = generateCsvFilename();

      expect(filename).toBe('hemoio-export-2024-06-15.csv');
    });

    it('should include date range in filename when specified', () => {
      const filename = generateCsvFilename({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-06-01'),
      });

      expect(filename).toBe('hemoio-export-2024-06-15-from-2024-01-01-to-2024-06-01.csv');
    });

    it('should include only start date if only start specified', () => {
      const filename = generateCsvFilename({
        startDate: new Date('2024-01-01'),
      });

      expect(filename).toBe('hemoio-export-2024-06-15-from-2024-01-01.csv');
    });
  });

  describe('downloadCsv', () => {
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

      downloadCsv('test,data', 'test.csv');

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockLink.download).toBe('test.csv');
      expect(mockClick).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalled();
    });
  });
});
