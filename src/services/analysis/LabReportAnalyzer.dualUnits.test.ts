/**
 * Reports that give a value in two units (as Italian labs do: SI and
 * conventional) are identified in the generated LOINC catalog and
 * deduplicated with the real unit conversions. Only text extraction and the
 * AI are mocked; the AI picks the best candidate of each value.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadCatalog } from '@data/loinc/catalog';
import { analyzeLabReport } from './LabReportAnalyzer';
import type { ExtractedBiomarker, TestChoiceRequest } from '../ai';
import * as aiModule from '../ai';

vi.mock('../ocr', () => ({
  OCRError: class OCRError extends Error {},
  detectDocumentType: vi.fn().mockResolvedValue({
    type: 'text-pdf',
    mimeType: 'application/pdf',
    fileName: 'report.pdf',
    fileSize: 1024,
    needsOCR: false,
    confidence: 0.95,
    metadata: { isValid: true },
  }),
  extractTextFromPDF: vi.fn().mockResolvedValue({
    fullText: 'Referto di laboratorio con abbastanza testo per l’analisi',
    totalPages: 1,
    pages: [],
    isScanned: false,
    textConfidence: 0.9,
    errors: [],
  }),
}));

vi.mock('../ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../ai')>()),
  getAIProvider: vi.fn(),
}));

function extracted(name: string, value: number, unit: string, specimenHint?: string): ExtractedBiomarker {
  return { name, value, unit, confidence: 0.95, ...(specimenHint && { specimenHint }) };
}

async function analyze(biomarkers: ExtractedBiomarker[]) {
  vi.mocked(aiModule.getAIProvider).mockReturnValue({
    analyzeLabReport: vi.fn().mockResolvedValue({
      biomarkers,
      labDate: '2026-10-20',
      overallConfidence: 0.95,
      analyzedText: '',
      warnings: [],
      modelUsed: 'test',
      processingTime: 1,
    }),
    chooseTests: async (requests: TestChoiceRequest[]) =>
      requests.map(({ id, candidates }) => ({ id, code: candidates[0].code, confident: true })),
  } as unknown as ReturnType<typeof aiModule.getAIProvider>);
  const file = new File([new ArrayBuffer(8)], 'report.pdf', { type: 'application/pdf' });
  return analyzeLabReport(file, { aiProvider: 'ollama', aiConfig: {}, catalog: await loadCatalog() });
}

/** Each kept value as "code: value unit" (or "name: …" with no code) */
async function kept(biomarkers: ExtractedBiomarker[]): Promise<string[]> {
  const result = await analyze(biomarkers);
  expect(result.duplicateConflicts.map((c) => c.message)).toEqual([]);
  return result.matchedBiomarkers.map((b) => `${b.loincCode ?? b.name}: ${b.value} ${b.unit}`);
}

describe('analyzeLabReport: values reported in two units', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps one value, in the standard unit, for each value reported in its mass and molar unit', async () => {
    expect(
      await kept([
        extracted('Acido urico', 247, 'µmol/L'),
        extracted('Acido urico', 4.15, 'mg/dL'),
        extracted('Ferro', 38.4, 'µmol/L'),
        extracted('Ferro', 214, 'µg/dL'),
        extracted('Creatinina', 88.4, 'µmol/L'),
        extracted('Creatinina', 1.0, 'mg/dL'),
      ])
    ).toEqual(['3084-1: 4.15 mg/dL', '2498-4: 214 µg/dL', '2160-0: 1 mg/dL']);
  });

  it('keeps the first value reported when neither is in the standard unit', async () => {
    expect(
      await kept([
        extracted('Creatinina (urine)', 4582, 'µmol/L', 'urine'),
        extracted('Creatinina (urine)', 0.51, 'g/L', 'urine'),
      ])
    ).toEqual(['14683-7: 4582 µmol/L']);
  });

  it('keeps a urine concentration and a 24-hour amount of one substance apart', async () => {
    expect(
      await kept([
        extracted('Creatinina (urine)', 0.51, 'g/L', 'urine'),
        extracted('Creatinina 24h', 1.55, 'g/24h', '24h urine'),
      ])
    ).toEqual(['2161-8: 0.51 g/L', '2162-6: 1.55 g/24h']);
  });

  it('keeps one value of a ratio to creatinine given in mg/mmol and in mg/g, in the standard unit', async () => {
    // 34366-5 [Ratio] for mg/mmol and 2890-2 [Mass Ratio] for mg/g are one ratio
    expect(
      await kept([
        extracted('U-Proteine/Creatinina', 15, 'mg/mmol'),
        extracted('U-Proteine/Creatinina', 132, 'mg/g'),
      ])
    ).toEqual(['2890-2: 132 mg/g']);
  });

  it('keeps a second sample of the same test, reported under its own name', async () => {
    expect(
      await kept([
        extracted('Creatinina (urine, spot)', 4367, 'µmol/L', 'urine'),
        extracted('Creatinina (urine, prima)', 4582, 'µmol/L', 'urine'),
      ])
    ).toEqual(['14683-7: 4367 µmol/L', '14683-7: 4582 µmol/L']);
  });

  it('flags a small value that only looks close: 67 µmol/L is not 1.5 mg/dL', async () => {
    const result = await analyze([extracted('Creatinina', 67, 'µmol/L'), extracted('Creatinina', 1.5, 'mg/dL')]);
    expect(result.duplicateConflicts).toHaveLength(1);
    expect(result.duplicateConflicts[0].biomarkerName).toMatch(/^Creatinine \[/);
    expect(result.matchedBiomarkers.every((b) => b.hasDuplicateConflict)).toBe(true);
  });
});

describe('analyzeLabReport: conflicting values', () => {
  beforeEach(() => vi.clearAllMocks());

  it('states a censored value with its comparator in the conflict', async () => {
    const result = await analyze([
      { ...extracted('Glucosio', 10, 'mg/dL', 'serum'), censored: '<' },
      extracted('Glucosio', 5, 'mmol/L', 'serum'),
    ]);

    expect(result.duplicateConflicts).toHaveLength(1);
    expect(result.duplicateConflicts[0].message).toContain('< 10 mg/dL');
    // A bound read as printed is not restated as a converted number
    expect(result.duplicateConflicts[0].message).not.toContain('(=10 mg/dL)');
    expect(result.duplicateConflicts[0].message).toContain('5 mmol/L (=90');
  });
});

describe('analyzeLabReport: twins with a comparator or a lab mark', () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the twin's comparator and mark on the value kept", async () => {
    const result = await analyze([
      extracted('Creatinina', 0.5, 'mg/dL', 'serum'),
      { ...extracted('Creatinina', 44, 'µmol/L', 'serum'), censored: '<' },
      { ...extracted('Glucosio', 7.2, 'mmol/L', 'serum'), labFlag: 'high' },
      extracted('Glucosio', 130, 'mg/dL', 'serum'),
    ]);

    expect(result.duplicateConflicts).toEqual([]);
    expect(result.matchedBiomarkers).toEqual([
      expect.objectContaining({ value: 0.5, unit: 'mg/dL', censored: '<' }),
      expect.objectContaining({ value: 130, unit: 'mg/dL', labFlag: 'high' }),
    ]);
  });
});
