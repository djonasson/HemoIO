/**
 * How the analyzer chooses each value's test: the AI's key, checked by the
 * unit, else the name. Real dictionary; text extraction and the AI mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeLabReport, NO_KEYS_NOTE, type NameFallback } from './LabReportAnalyzer';
import { getBiomarkerByKey } from '../../data/biomarkers/dictionary';
import { MODEL_LOAD_NOTE } from '../matching';
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

async function analyze(biomarkers: ExtractedBiomarker[], nameFallback?: NameFallback) {
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
  return analyzeLabReport(file, { aiProvider: 'ollama', aiConfig: {}, nameFallback });
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
    // Glucose has no 24-hour pair: nothing the unit fits
    const [value] = (await analyze([extracted('Glicemia', 5, 'mmol/24h', 'glucose')]))
      .matchedBiomarkers;
    expect(value.dictionaryMatch).toBeUndefined();
    expect(value.suggestedMatch?.key).toBe('glucose');
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

  it('matches a learned name after the dictionary aliases, with a fitting unit', async () => {
    const learned = () => getBiomarkerByKey('urine-urea');
    const result = await analyze(
      [
        extracted('Zorb', 7, 'g/L'),
        extracted('Glucose', 95, 'mg/dL'),
        extracted('Zorb', 3, '10^9/L'),
      ],
      { learned }
    );

    expect(
      result.matchedBiomarkers.map((b) => [b.dictionaryMatch?.key, b.identificationFlags])
    ).toEqual([
      ['urine-urea', ['name-only']],
      ['glucose', ['name-only']],
      [undefined, ['not-identified']],
    ]);
  });

  it('matches a name by meaning only with a fitting unit', async () => {
    const similar = async () => [getBiomarkerByKey('urine-urea')!];
    const result = await analyze(
      [extracted('Zorb urinaria', 7, 'g/L'), extracted('Zorb urinaria', 3, '10^9/L')],
      { similar }
    );

    expect(
      result.matchedBiomarkers.map((b) => [
        b.dictionaryMatch?.key,
        b.identifiedBy,
        b.identificationFlags,
      ])
    ).toEqual([
      ['urine-urea', 'model', ['similar-name']],
      [undefined, undefined, ['not-identified']],
    ]);
  });

  it('notes once when the matching model could not load', async () => {
    const similar = async () => {
      throw new Error('offline');
    };
    const result = await analyze([extracted('Zorb', 1, 'U/L'), extracted('Blarg', 2, 'U/L')], {
      similar,
    });

    expect(result.matchedBiomarkers.map((b) => b.identificationFlags)).toEqual([
      ['not-identified'],
      ['not-identified'],
    ]);
    expect(result.warnings.filter((w) => w === MODEL_LOAD_NOTE)).toHaveLength(1);
  });

  it("takes the AI's test's pair when the unit fits that, not a conflict", async () => {
    // The AI gave the concentration's key to the 24-hour amount too
    const result = await analyze([
      extracted('Creatinina urine', 120, 'mg/dL', 'urine-creatinine'),
      extracted('Creatinina urine', 1.55, 'g/24h', 'urine-creatinine'),
      extracted('Neutrofili', 55, '%', 'neutrophils'),
    ]);

    expect(result.duplicateConflicts).toEqual([]);
    expect(result.matchedBiomarkers.map((b) => [b.dictionaryMatch?.key, b.identifiedBy])).toEqual([
      ['urine-creatinine', 'ai'],
      ['24-hour-urine-creatinine', 'ai'],
      ['neutrophils-percentage', 'ai'],
    ]);
  });

  it('never groups a proposal whose unit does not fit with a confirmed value', async () => {
    const result = await analyze([
      extracted('Creatinina urine', 120, 'mg/dL', 'urine-creatinine'),
      extracted('Creatinina urine', 3, 'U/L', 'urine-creatinine'),
    ]);

    expect(result.duplicateConflicts).toEqual([]);
    expect(result.matchedBiomarkers).toHaveLength(2);
  });

  it('says not identified when the closest test by meaning does not fit the unit', async () => {
    // A runner-up is no safer: the nearest test was rejected
    const similar = async () => [getBiomarkerByKey('glucose')!, getBiomarkerByKey('urine-urea')!];
    const [value] = (await analyze([extracted('Zorb urinaria', 7, 'g/L')], { similar }))
      .matchedBiomarkers;

    expect(value.dictionaryMatch).toBeUndefined();
    expect(value.identificationFlags).toEqual(['not-identified']);
  });
});
