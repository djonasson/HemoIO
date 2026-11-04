/**
 * How the analyzer gives each value its LOINC test: locally, then one AI
 * choice for the values several tests fit. Fixture catalog; text
 * extraction and the AI mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fixtureCatalog } from '@/test/loincFixture';
import { analyzeLabReport, CHOICE_FAILED_NOTE, unidentifiedNote } from './LabReportAnalyzer';
import type { ExtractedBiomarker, TestChoice, TestChoiceRequest } from '../ai';
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

const catalog = fixtureCatalog();

async function analyze(
  biomarkers: ExtractedBiomarker[],
  chooseTests: (requests: TestChoiceRequest[]) => Promise<TestChoice[]> = async () => [],
  learnedTests?: Record<string, string>
) {
  const choose = vi.fn(chooseTests);
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
    chooseTests: choose,
  } as unknown as ReturnType<typeof aiModule.getAIProvider>);
  const file = new File([new ArrayBuffer(8)], 'report.pdf', { type: 'application/pdf' });
  const result = await analyzeLabReport(file, { aiProvider: 'ollama', aiConfig: {}, catalog, learnedTests });
  return { result, choose };
}

/** Each value as "code: value unit", or "name: …" with no code */
function saved(result: Awaited<ReturnType<typeof analyze>>['result']): string[] {
  return result.matchedBiomarkers.map((b) => `${b.loincCode ?? b.name}: ${b.value} ${b.unit}`);
}

describe('analyzeLabReport: identifying each value', () => {
  beforeEach(() => vi.clearAllMocks());

  it('matches a known test locally and does not ask the AI', async () => {
    const { result, choose } = await analyze([extracted('P-Glucosio', 90, 'mg/dL')]);
    expect(saved(result)).toEqual(['2345-7: 90 mg/dL']);
    expect(result.matchedBiomarkers[0]).toMatchObject({ identifiedBy: 'local', identificationFlags: [] });
    expect(choose).not.toHaveBeenCalled();
    expect(result.warnings).toEqual([]);
  });

  it('asks the AI once, with only the values several tests fit, and takes its confident choice', async () => {
    const { result, choose } = await analyze(
      [extracted('Hb', 14, 'g/dL'), extracted('Glucosio', 5, 'mmol/L'), extracted('Zorb', 1, 'mg/dL')],
      async (requests) => requests.map(({ id }) => ({ id, code: '14749-6', confident: true }))
    );
    expect(choose).toHaveBeenCalledTimes(1);
    expect(choose.mock.calls[0][0].map((request) => request.name)).toEqual(['Glucosio']);
    expect(result.matchedBiomarkers.find((b) => b.name === 'Glucosio')).toMatchObject({
      loincCode: '14749-6',
      identifiedBy: 'ai',
    });
    // Only the value no test fits is left to the user
    expect(result.warnings).toEqual([unidentifiedNote(1)]);
  });

  it('leaves the candidates to the user when the AI cannot be asked', async () => {
    const { result } = await analyze([extracted('Glucosio', 5, 'mmol/L')], () =>
      Promise.reject(new Error('unreachable'))
    );
    const [glucose] = result.matchedBiomarkers;
    expect(glucose.loincCode).toBeUndefined();
    expect(glucose.identificationFlags).toEqual(['ambiguous']);
    expect(glucose.candidates.map((c) => c.code)).toEqual(['14749-6', '15074-8']);
    expect(result.warnings).toEqual([CHOICE_FAILED_NOTE, unidentifiedNote(1)]);
  });

  it('uses learned tests before the local match', async () => {
    const { result, choose } = await analyze([extracted('Glucosio', 5, 'mmol/L')], undefined, {
      'glucosio|mmol/L': '15074-8',
    });
    expect(result.matchedBiomarkers[0]).toMatchObject({ loincCode: '15074-8', identifiedBy: 'learned' });
    expect(choose).not.toHaveBeenCalled();
  });

  it('saves a value the report gives no unit under its own name, without asking the AI', async () => {
    const { result, choose } = await analyze([extracted('Proteine (urine)', 15, '', 'urine')]);
    expect(result.matchedBiomarkers[0]).toMatchObject({ savedAsUnknown: true, identificationFlags: ['no-unit'] });
    expect(choose).not.toHaveBeenCalled();
    expect(result.warnings).toEqual([]);
  });

  it('gives a 24-hour urine value and a plasma value of one substance different codes, both kept', async () => {
    const { result } = await analyze([
      extracted('Glucosio', 90, 'mg/dL', 'plasma'),
      extracted('Glucosio', 300, 'mg/L', '24h urine'),
    ]);
    expect(saved(result)).toEqual(['2345-7: 90 mg/dL', '21305-8: 300 mg/L']);
    expect(result.duplicateConflicts).toEqual([]);
  });

  it('merges one value reported in its mass and its molar unit, keeping the standard unit', async () => {
    const { result } = await analyze([extracted('P-Glucosio', 5, 'mmol/L'), extracted('P-Glucosio', 90, 'mg/dL')]);
    expect(saved(result)).toEqual(['2345-7: 90 mg/dL']);
    expect(result.duplicateConflicts).toEqual([]);
  });

  it('flags two values of one test that are not the same measurement', async () => {
    const { result } = await analyze([extracted('P-Glucosio', 8, 'mmol/L'), extracted('P-Glucosio', 90, 'mg/dL')]);
    expect(result.duplicateConflicts).toHaveLength(1);
    expect(result.matchedBiomarkers.every((b) => b.hasDuplicateConflict)).toBe(true);
  });
});
