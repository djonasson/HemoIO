/**
 * Tests for LabResultPersistence service
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveReviewedResult, saveImportResults } from './LabResultPersistence';
import type { ReviewedResult } from '@components/import';
import type { MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';

// Mock the biomarker dictionary
vi.mock('@data/biomarkers/dictionary', () => ({
  findBiomarker: vi.fn((name: string) => {
    if (name === 'Hemoglobin' || name === 'Hgb') {
      return { name: 'Hemoglobin', category: 'cbc' };
    }
    if (name === 'Glucose') {
      return { name: 'Glucose', category: 'metabolic' };
    }
    return undefined;
  }),
  BIOMARKER_DEFINITIONS: [
    { name: 'Hemoglobin', category: 'cbc' },
    { name: 'Glucose', category: 'metabolic' },
    { name: 'Creatinine', category: 'metabolic' },
  ],
}));

// Create mock db
function createMockDb() {
  let labResultIdCounter = 1;
  let testValueIdCounter = 1;

  // Parameter captured for mock.calls access
  const addLabResult = vi.fn(async (data: Record<string, unknown>) => {
    void data;
    return labResultIdCounter++;
  });
  const addTestValues = vi.fn(async (values: unknown[]) =>
    values.map(() => testValueIdCounter++)
  );
  const addTestValue = vi.fn(async () => testValueIdCounter++);

  return {
    addLabResult,
    addTestValues,
    addTestValue,
    getLastLabResultCall: () => addLabResult.mock.calls[addLabResult.mock.calls.length - 1]?.[0],
    getLastTestValuesCall: () => addTestValues.mock.calls[addTestValues.mock.calls.length - 1]?.[0] as Record<string, unknown>[] | undefined,
  };
}

function createMockBiomarker(
  name: string,
  value: number,
  unit: string,
  options: Partial<MatchedBiomarker> = {}
): MatchedBiomarker {
  return {
    name,
    value,
    unit,
    confidence: 0.95,
    isExactMatch: true,
    normalizedUnit: unit,
    ...options,
  };
}

function createMockReviewedResult(
  fileName: string,
  biomarkers: MatchedBiomarker[],
  options: Partial<ReviewedResult> = {}
): ReviewedResult {
  return {
    fileId: `file_${fileName}`,
    fileName,
    success: true,
    biomarkers,
    confidence: 0.9,
    warnings: [],
    editedBiomarkers: biomarkers,
    editedLabDate: '2024-01-15',
    editedLabName: 'Test Lab',
    ...options,
  };
}

describe('LabResultPersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('saveReviewedResult', () => {
    it('should save a lab result and its test values', async () => {
      const mockDb = createMockDb();
      const biomarkers = [
        createMockBiomarker('Hemoglobin', 14.5, 'g/dL'),
        createMockBiomarker('Glucose', 95, 'mg/dL'),
      ];
      const reviewed = createMockReviewedResult('test.pdf', biomarkers);

      const result = await saveReviewedResult(reviewed, mockDb as any);

      expect(mockDb.addLabResult).toHaveBeenCalledTimes(1);
      expect(mockDb.addTestValues).toHaveBeenCalledTimes(1);
      expect(result.labResultId).toBe(1);
      expect(result.testValueCount).toBe(2);
    });

    it('should use edited lab date and name', async () => {
      const mockDb = createMockDb();
      const biomarkers = [createMockBiomarker('Hemoglobin', 14.5, 'g/dL')];
      const reviewed = createMockReviewedResult('test.pdf', biomarkers, {
        editedLabDate: '2024-06-15',
        editedLabName: 'Custom Lab Name',
      });

      await saveReviewedResult(reviewed, mockDb as any);

      const savedLabResult = mockDb.getLastLabResultCall();
      expect(savedLabResult?.labName).toBe('Custom Lab Name');
      expect((savedLabResult?.date as Date).toISOString().substring(0, 10)).toBe('2024-06-15');
    });

    it('should fallback to original lab date and name if not edited', async () => {
      const mockDb = createMockDb();
      const biomarkers = [createMockBiomarker('Hemoglobin', 14.5, 'g/dL')];
      const reviewed = createMockReviewedResult('test.pdf', biomarkers, {
        editedLabDate: undefined,
        editedLabName: undefined,
        labDate: '2024-03-20',
        labName: 'Original Lab',
      });

      await saveReviewedResult(reviewed, mockDb as any);

      const savedLabResult = mockDb.getLastLabResultCall();
      expect(savedLabResult?.labName).toBe('Original Lab');
      expect((savedLabResult?.date as Date).toISOString().substring(0, 10)).toBe('2024-03-20');
    });

    it('should handle US date format (MM/DD/YYYY)', async () => {
      const mockDb = createMockDb();
      const biomarkers = [createMockBiomarker('Hemoglobin', 14.5, 'g/dL')];
      const reviewed = createMockReviewedResult('test.pdf', biomarkers, {
        editedLabDate: '06/15/2024',
      });

      await saveReviewedResult(reviewed, mockDb as any);

      const savedLabResult = mockDb.getLastLabResultCall();
      const savedDate = savedLabResult?.date as Date;
      // Use UTC methods since we store dates in UTC
      expect(savedDate.getUTCMonth()).toBe(5); // June is 5 (0-indexed)
      expect(savedDate.getUTCDate()).toBe(15);
      expect(savedDate.getUTCFullYear()).toBe(2024);
    });

    it('should include reference ranges in test values', async () => {
      const mockDb = createMockDb();
      const biomarkers = [
        createMockBiomarker('Hemoglobin', 14.5, 'g/dL', {
          referenceRange: { low: 12.0, high: 17.5, unit: 'g/dL' },
        }),
      ];
      const reviewed = createMockReviewedResult('test.pdf', biomarkers);

      await saveReviewedResult(reviewed, mockDb as any);

      const savedTestValues = mockDb.getLastTestValuesCall();
      expect(savedTestValues?.[0]?.referenceRangeLow).toBe(12.0);
      expect(savedTestValues?.[0]?.referenceRangeHigh).toBe(17.5);
    });

    it('should warn about unmatched biomarkers', async () => {
      const mockDb = createMockDb();
      const biomarkers = [
        createMockBiomarker('UnknownBiomarker', 100, 'units', {
          dictionaryMatch: undefined,
          isExactMatch: false,
        }),
      ];
      const reviewed = createMockReviewedResult('test.pdf', biomarkers);

      const result = await saveReviewedResult(reviewed, mockDb as any);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('UnknownBiomarker');
    });

    it('should handle empty biomarkers list', async () => {
      const mockDb = createMockDb();
      const reviewed = createMockReviewedResult('test.pdf', []);

      const result = await saveReviewedResult(reviewed, mockDb as any);

      expect(mockDb.addLabResult).toHaveBeenCalledTimes(1);
      expect(mockDb.addTestValues).not.toHaveBeenCalled();
      expect(result.testValueCount).toBe(0);
    });

    it('should store confidence values', async () => {
      const mockDb = createMockDb();
      const biomarkers = [
        createMockBiomarker('Hemoglobin', 14.5, 'g/dL', { confidence: 0.85 }),
      ];
      const reviewed = createMockReviewedResult('test.pdf', biomarkers);

      await saveReviewedResult(reviewed, mockDb as any);

      const savedTestValues = mockDb.getLastTestValuesCall();
      expect(savedTestValues?.[0]?.confidence).toBe(0.85);
    });
  });

  describe('saveImportResults', () => {
    it('should save multiple reviewed results', async () => {
      const mockDb = createMockDb();
      const reviewed1 = createMockReviewedResult('test1.pdf', [
        createMockBiomarker('Hemoglobin', 14.5, 'g/dL'),
      ]);
      const reviewed2 = createMockReviewedResult('test2.pdf', [
        createMockBiomarker('Glucose', 95, 'mg/dL'),
        createMockBiomarker('Hemoglobin', 13.0, 'g/dL'),
      ]);

      const result = await saveImportResults([reviewed1, reviewed2], mockDb as any);

      expect(result.totalLabResults).toBe(2);
      expect(result.totalTestValues).toBe(3);
      expect(result.results).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });

    it('should capture errors for individual results', async () => {
      const mockDb = createMockDb();
      mockDb.addLabResult
        .mockResolvedValueOnce(1)
        .mockRejectedValueOnce(new Error('Database error'));

      const reviewed1 = createMockReviewedResult('test1.pdf', [
        createMockBiomarker('Hemoglobin', 14.5, 'g/dL'),
      ]);
      const reviewed2 = createMockReviewedResult('test2.pdf', [
        createMockBiomarker('Glucose', 95, 'mg/dL'),
      ]);

      const result = await saveImportResults([reviewed1, reviewed2], mockDb as any);

      expect(result.totalLabResults).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].fileName).toBe('test2.pdf');
      expect(result.errors[0].error).toBe('Database error');
    });

    it('should return empty results for empty input', async () => {
      const mockDb = createMockDb();

      const result = await saveImportResults([], mockDb as any);

      expect(result.totalLabResults).toBe(0);
      expect(result.totalTestValues).toBe(0);
      expect(result.results).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should aggregate warnings from all results', async () => {
      const mockDb = createMockDb();
      const reviewed1 = createMockReviewedResult('test1.pdf', [
        createMockBiomarker('UnknownMarker1', 100, 'units', {
          dictionaryMatch: undefined,
          isExactMatch: false,
        }),
      ]);
      const reviewed2 = createMockReviewedResult('test2.pdf', [
        createMockBiomarker('UnknownMarker2', 200, 'units', {
          dictionaryMatch: undefined,
          isExactMatch: false,
        }),
      ]);

      const result = await saveImportResults([reviewed1, reviewed2], mockDb as any);

      expect(result.results[0].warnings).toHaveLength(1);
      expect(result.results[1].warnings).toHaveLength(1);
    });
  });
});
