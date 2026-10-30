/**
 * Tests for LabResultPersistence service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openTestDb } from '@data/db/testDb';
import { SaveError } from '@data/db/saveError';
import { saveImportResults } from './LabResultPersistence';
import type { EncryptedDb } from '@data/db';
import type { ReviewedResult } from '@components/import';
import type { MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';
import type { LabResult, TestValue } from '@/types';

// Mock the biomarker dictionary
vi.mock('@data/biomarkers/dictionary', () => ({
  findBiomarker: vi.fn((name: string) => {
    if (name === 'Hemoglobin' || name === 'Hgb') {
      return { key: 'hemoglobin', name: 'Hemoglobin', category: 'cbc' };
    }
    if (name === 'Glucose') {
      return { key: 'glucose', name: 'Glucose', category: 'metabolic' };
    }
    return undefined;
  }),
  BIOMARKER_DEFINITIONS: [
    { name: 'Hemoglobin', category: 'cbc' },
    { name: 'Glucose', category: 'metabolic' },
    { name: 'Creatinine', category: 'metabolic' },
  ],
  unknownBiomarkerKey: (name: string) => `unknown:${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
}));

/** The values saved, newest result first, with their lab result */
async function saved(db: EncryptedDb): Promise<Array<LabResult & { values: TestValue[] }>> {
  const results = await db.getAllLabResults();
  return Promise.all(
    results.map(async (r) => ({ ...r, values: await db.getTestValuesByLabResult(r.id!) }))
  );
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

/** Save one reviewed result and return it as stored */
async function saveOne(reviewed: ReviewedResult): Promise<LabResult & { values: TestValue[] }> {
  const { db } = await openTestDb();
  await saveImportResults([reviewed], db);
  const [result] = await saved(db);
  return result;
}

describe('saveImportResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves a lab result and its test values', async () => {
    const result = await saveOne(
      createMockReviewedResult('test.pdf', [
        createMockBiomarker('Hemoglobin', 14.5, 'g/dL'),
        createMockBiomarker('Glucose', 95, 'mg/dL'),
      ])
    );

    expect(result.values.map((v) => v.biomarkerKey).sort()).toEqual(['glucose', 'hemoglobin']);
  });

  it('uses the edited lab date and name', async () => {
    const result = await saveOne(
      createMockReviewedResult('test.pdf', [createMockBiomarker('Hemoglobin', 14.5, 'g/dL')], {
        editedLabDate: '2024-06-15',
        editedLabName: 'Custom Lab Name',
      })
    );

    expect(result.labName).toBe('Custom Lab Name');
    expect(result.date.toISOString().substring(0, 10)).toBe('2024-06-15');
  });

  it('falls back to the original lab date and name if not edited', async () => {
    const result = await saveOne(
      createMockReviewedResult('test.pdf', [createMockBiomarker('Hemoglobin', 14.5, 'g/dL')], {
        editedLabDate: undefined,
        editedLabName: undefined,
        labDate: '2024-03-20',
        labName: 'Original Lab',
      })
    );

    expect(result.labName).toBe('Original Lab');
    expect(result.date.toISOString().substring(0, 10)).toBe('2024-03-20');
  });

  it.each([
    ['06/15/2024', '2024-06-15'],
    ['15.01.2024', '2024-01-15'],
    ['15/01/2024', '2024-01-15'],
    ['01/15/2024', '2024-01-15'],
  ])('saves the lab date %s under %s', async (labDate, day) => {
    const result = await saveOne(
      createMockReviewedResult('test.pdf', [createMockBiomarker('Hemoglobin', 14.5, 'g/dL')], {
        editedLabDate: labDate,
      })
    );

    expect(result.date.toISOString().slice(0, 10)).toBe(day);
  });

  it('includes reference ranges and confidence in test values', async () => {
    const result = await saveOne(
      createMockReviewedResult('test.pdf', [
        createMockBiomarker('Hemoglobin', 14.5, 'g/dL', {
          confidence: 0.85,
          referenceRange: { low: 12.0, high: 17.5, unit: 'g/dL' },
        }),
      ])
    );

    expect(result.values[0]).toEqual(
      expect.objectContaining({ referenceRangeLow: 12.0, referenceRangeHigh: 17.5, confidence: 0.85 })
    );
  });

  it('saves a value the user put as not in the dictionary under its own name', async () => {
    const result = await saveOne(
      createMockReviewedResult('test.pdf', [
        createMockBiomarker('Glucose', 95, 'mg/dL', { savedAsUnknown: true }),
      ])
    );

    expect(result.values[0].biomarkerKey).toBe('unknown:glucose');
  });

  it('saves an analyzed value without a test under its own name, as review showed it', async () => {
    // Review shows "Not in dictionary": the name alone must not pick a test
    const result = await saveOne(
      createMockReviewedResult('test.pdf', [
        createMockBiomarker('Glucose', 95, 'mmol/24h', {
          dictionaryMatch: undefined,
          identificationFlags: ['not-identified'],
        }),
      ])
    );

    expect(result.values[0].biomarkerKey).toBe('unknown:glucose');
  });

  it('saves a lab result without values', async () => {
    const result = await saveOne(createMockReviewedResult('test.pdf', []));

    expect(result.values).toEqual([]);
  });

  it('saves every file and counts what it saved', async () => {
    const { db } = await openTestDb();
    const output = await saveImportResults(
      [
        createMockReviewedResult('test1.pdf', [createMockBiomarker('Hemoglobin', 14.5, 'g/dL')]),
        createMockReviewedResult('test2.pdf', [
          createMockBiomarker('Glucose', 95, 'mg/dL'),
          createMockBiomarker('Hemoglobin', 13.0, 'g/dL'),
        ]),
      ],
      db
    );

    expect(output).toEqual({ totalLabResults: 2, totalTestValues: 3 });
    expect(await saved(db)).toHaveLength(2);
  });

  it('saves nothing, and says why, when the storage does not keep the import', async () => {
    const { db } = await openTestDb();
    vi.spyOn(db, 'addLabResultsWithValues').mockRejectedValue(new SaveError('quota'));

    await expect(
      saveImportResults(
        [createMockReviewedResult('test1.pdf', [createMockBiomarker('Hemoglobin', 14.5, 'g/dL')])],
        db
      )
    ).rejects.toEqual(new SaveError('quota'));
  });

  it('saves nothing for an empty import', async () => {
    const { db } = await openTestDb();

    expect(await saveImportResults([], db)).toEqual({ totalLabResults: 0, totalTestValues: 0 });
    expect(await saved(db)).toEqual([]);
  });
});
