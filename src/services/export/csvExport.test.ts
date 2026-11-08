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
  biomarkerKey: string,
  value: number,
  unit: string,
  refLow?: number,
  refHigh?: number
): TestValue {
  return {
    id,
    labResultId,
    biomarkerKey,
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

  const biomarkerNames = new Map<string, string>([
    ['2345-7', 'Glucose'],
    ['718-7', 'Hemoglobin'],
    ['unknown:colesterolo', 'Cholesterol'],
  ]);

  return [
    {
      labResult: labResult1,
      testValues: [
        createMockTestValue(1, 1, '2345-7', 95, 'mg/dL', 70, 100),
        createMockTestValue(2, 1, '718-7', 14.5, 'g/dL', 12.0, 17.5),
      ],
      biomarkerNames,
    },
    {
      labResult: labResult2,
      testValues: [
        createMockTestValue(3, 2, '2345-7', 102, 'mg/dL', 70, 100),
        createMockTestValue(4, 2, 'unknown:colesterolo', 185, 'mg/dL', 0, 200),
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
      expect(lines[0]).toBe('Date,Lab Name,Biomarker,LOINC,Value,Unit,Reference Low,Reference High');
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

    it('exports an interval as its ends, as text a spreadsheet keeps', () => {
      const csv = exportToCsv([
        {
          labResult: createMockLabResult(1, '2024-01-15', 'Lab'),
          testValues: [
            {
              ...createMockTestValue(1, 1, 'unknown:eritrociti', 7.5, '/[HPF]'),
              numericValueType: 'interval',
              intervalLow: 5,
              intervalHigh: 10,
            },
          ],
          biomarkerNames: new Map([['unknown:eritrociti', 'Eritrociti']]),
        },
      ]);

      expect(csv.split('\n')[1]).toContain(',"=""5-10""",');
      expect(csv).not.toContain('7.5');
    });

    it('exports a censored value with its comparator', () => {
      const csv = exportToCsv([
        {
          labResult: createMockLabResult(1, '2024-01-15', 'Lab'),
          testValues: [{ ...createMockTestValue(1, 1, '2345-7', 10, 'mg/dL'), censored: '<' }],
          biomarkerNames: new Map([['2345-7', 'Glucose']]),
        },
      ]);

      expect(csv.split('\n')[1]).toContain(',< 10,mg/dL');
    });

    it('exports a qualitative result as printed', () => {
      const csv = exportToCsv([
        {
          labResult: createMockLabResult(1, '2024-01-15', 'Lab'),
          testValues: [{ ...createMockTestValue(1, 1, '25145-4', 0, ''), value: 'Assenti', qualitativeType: 'boolean' }],
          biomarkerNames: new Map([['25145-4', 'Bacteria']]),
        },
      ]);

      expect(csv.split('\n')[1]).toContain(',Assenti,');
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
      expect(lines[0]).toBe('Date,Lab Name,Biomarker,LOINC,Value,Unit');
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

    it('includes results from the whole of the end day', () => {
      const data = createMockExportData();
      // A local calendar day, as the date picker gives it
      const csv = exportToCsv(data, { endDate: new Date(2024, 2, 20) });

      expect(csv).toContain('2024-03-20');
    });

    it('writes a result without a date with an empty Date field', () => {
      const data = createMockExportData();
      data[0].labResult = { ...data[0].labResult, date: new Date(Number.NaN) };

      const lines = exportToCsv(data).split('\n');

      // Every value is kept; the undated result's rows start with an empty date
      expect(lines).toHaveLength(5);
      expect(lines[1].startsWith(',')).toBe(true);
    });

    it('leaves out a result without a date when a date range is set', () => {
      const data = createMockExportData();
      data[1].labResult = { ...data[1].labResult, date: new Date(Number.NaN) };

      expect(exportToCsv(data, { startDate: new Date('2024-01-01') }).split('\n')).toHaveLength(3);
      expect(exportToCsv(data, { endDate: new Date('2024-12-31') }).split('\n')).toHaveLength(3);
    });

    it('should filter by biomarker IDs', () => {
      const data = createMockExportData();
      const csv = exportToCsv(data, { biomarkerKeys: ['2345-7'] }); // Only Glucose

      const lines = csv.split('\n');
      // Header + 2 Glucose values
      expect(lines).toHaveLength(3);
      expect(csv).toContain('Glucose');
      expect(csv).not.toContain('Hemoglobin');
      expect(csv).not.toContain('Cholesterol');
    });

    it('exports no values when the chosen tests have none: an empty filter is not every test', () => {
      const csv = exportToCsv(createMockExportData(), { biomarkerKeys: [] });

      expect(csv.split('\n')).toHaveLength(1); // Just header
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

    it("gives each identified value's LOINC code, and none for a value that is not a LOINC test", () => {
      const lines = exportToCsv(createMockExportData()).split('\n');
      expect(lines[1]).toBe('2024-01-15,Quest Diagnostics,Glucose,"=""2345-7""",95,mg/dL,70,100');
      expect(lines[4]).toBe('2024-03-20,LabCorp,Cholesterol,,185,mg/dL,0,200');
    });

    it('writes a LOINC code as text, so a spreadsheet does not read "2345-7" as a date', () => {
      const [, row] = exportToCsv(createMockExportData()).split('\n');
      // The field is ="2345-7", quoted: spreadsheet apps evaluate it to the text 2345-7
      expect(row.split(',')[3]).toBe('"=""2345-7"""');
    });

    it('writes a key that is not a LOINC code as plain text, so it cannot break out of ="…"', () => {
      const data = createMockExportData();
      data[0].testValues[0].biomarkerKey = '1"&HYPERLINK("http://x")&"';
      const [, row] = exportToCsv(data).split('\n');
      expect(row).toContain(',"1""&HYPERLINK(""http://x"")&""",');
      expect(row).not.toContain('=');
    });

    it('neutralises text fields a spreadsheet would read as a formula', () => {
      for (const start of ['=', '+', '-', '@', '\t', '\r']) {
        const data = createMockExportData();
        data[0].labResult.labName = `${start}SUM(A1)`;
        data[0].biomarkerNames.set(data[0].testValues[0].biomarkerKey, `${start}cmd`);
        data[0].testValues[0].unit = `${start}x`;
        data[0].testValues[0].value = `${start}y`;
        const [, row] = exportToCsv(data).split('\n');
        const fields = row.replace(/"/g, '');
        expect(fields).toContain(`'${start}SUM(A1)`);
        expect(fields).toContain(`'${start}cmd`);
        expect(fields).toContain(`'${start}x`);
        expect(fields).toContain(`'${start}y`);
      }
    });

    it('leaves numbers such as -5 as numbers', () => {
      const data = createMockExportData();
      data[0].testValues[0].value = -5;
      data[0].testValues[0].referenceRangeLow = -10;
      const [, row] = exportToCsv(data).split('\n');
      expect(row).toContain(',-5,mg/dL,-10,');
    });

    it('should handle unknown biomarker names', () => {
      const data = createMockExportData();
      data[0].testValues[0].biomarkerKey = 'unknown:zorb'; // No name given

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
