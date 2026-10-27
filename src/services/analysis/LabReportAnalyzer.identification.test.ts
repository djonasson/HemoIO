/**
 * How the analyzer chooses each value's test: the AI's key, checked by the
 * unit, else the name. Real dictionary; text extraction and the AI mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeLabReport, NO_KEYS_NOTE } from './LabReportAnalyzer';
import type { ExtractedBiomarker } from '../ai';
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

function extracted(
  name: string,
  value: number,
  unit: string,
  biomarkerKey?: string
): ExtractedBiomarker {
  return { name, value, unit, confidence: 0.95, ...(biomarkerKey && { biomarkerKey }) };
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
  } as unknown as ReturnType<typeof aiModule.getAIProvider>);
  const file = new File([new ArrayBuffer(8)], 'report.pdf', { type: 'application/pdf' });
  return analyzeLabReport(file, { aiProvider: 'ollama', aiConfig: {} });
}

describe('analyzeLabReport: identifying each value', () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the AI's key when the unit fits it", async () => {
    const [value] = (
      await analyze([extracted('Creatinina/L (urine 24h)', 4582, 'µmol/L', 'urine-creatinine')])
    ).matchedBiomarkers;
    expect(value.dictionaryMatch?.key).toBe('urine-creatinine');
    expect(value.identifiedBy).toBe('ai');
    expect(value.identificationFlags).toEqual([]);
  });

  it("only proposes the AI's key when the unit does not fit it", async () => {
    const [value] = (await analyze([extracted('Creatinina', 1.55, 'g/24h', 'urine-creatinine')]))
      .matchedBiomarkers;
    expect(value.dictionaryMatch).toBeUndefined();
    expect(value.suggestedMatch?.key).toBe('urine-creatinine');
    expect(value.identificationFlags).toEqual(['unit-mismatch']);
  });

  it('flags a printed name that is an exact alias of another test', async () => {
    const [value] = (
      await analyze([extracted('Creatinina 24h', 4582, 'µmol/L', 'urine-creatinine')])
    ).matchedBiomarkers;
    expect(value.dictionaryMatch?.key).toBe('urine-creatinine');
    expect(value.identificationFlags).toEqual(['name-disagrees']);
    expect(value.nameSuggests?.key).toBe('24-hour-urine-creatinine');
  });

  it('falls back to the name for unknown and malformed keys', async () => {
    const result = await analyze([
      extracted('Glucose', 95, 'mg/dL', 'Glucose'),
      extracted('Glucose', 95, 'mg/dL', 'not-a-key'),
    ]);
    for (const value of result.matchedBiomarkers) {
      expect(value.dictionaryMatch?.key).toBe('glucose');
      expect(value.identifiedBy).toBe('name');
      expect(value.identificationFlags).toEqual(['name-only']);
    }
  });

  it('labels a value nothing identifies', async () => {
    const [value] = (await analyze([extracted('Zorblatin', 1, 'U/L')])).matchedBiomarkers;
    expect(value.identifiedBy).toBeUndefined();
    expect(value.identificationFlags).toEqual(['not-identified']);
  });

  it('notes when the model identified no test at all', async () => {
    const result = await analyze([
      extracted('Glucose', 95, 'mg/dL'),
      extracted('Zorblatin', 1, 'U/L'),
    ]);
    expect(result.warnings).toContain(NO_KEYS_NOTE);
  });

  it('does not note it when the model identified some', async () => {
    const result = await analyze([
      extracted('Glucose', 95, 'mg/dL', 'glucose'),
      extracted('Zorblatin', 1, 'U/L'),
    ]);
    expect(result.warnings).not.toContain(NO_KEYS_NOTE);
  });

  it('merges one value the AI keyed in two units that convert', async () => {
    const result = await analyze([
      extracted('Urea/L (urine)', 117, 'mmol/L', 'urine-urea'),
      extracted('Urea/L (urine)', 7, 'g/L', 'urine-urea'),
    ]);
    expect(result.duplicateConflicts).toEqual([]);
    expect(result.matchedBiomarkers).toHaveLength(1);
  });
});
