/**
 * Reports that give a value in two units (as Italian labs do: SI and
 * conventional) are matched and deduplicated with the real dictionary and
 * unit conversions. Only text extraction and the AI are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeLabReport } from './LabReportAnalyzer';
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

function extracted(name: string, value: number, unit: string): ExtractedBiomarker {
  return { name, value, unit, confidence: 0.95 };
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

/** Each kept value as "key: value unit" (or "name: …" when not matched) */
async function kept(biomarkers: ExtractedBiomarker[]): Promise<string[]> {
  const result = await analyze(biomarkers);
  expect(result.duplicateConflicts.map((c) => c.message)).toEqual([]);
  return result.matchedBiomarkers.map(
    (b) => `${b.dictionaryMatch?.key ?? b.name}: ${b.value} ${b.unit}`
  );
}

describe('analyzeLabReport: values reported in two units', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps one value, in the canonical unit, for each value reported twice', async () => {
    expect(
      await kept([
        extracted('Urea', 3.06, 'mmol/L'),
        extracted('Urea', 18, 'mg/dL'),
        extracted('Acido urico', 247, 'µmol/L'),
        extracted('Acido urico', 4.15, 'mg/dL'),
        extracted('Ferro', 38.4, 'µmol/L'),
        extracted('Ferro', 214, 'µg/dL'),
        extracted('Vitamina D (25-OH)', 81.5, 'nmol/L'),
        extracted('Vitamina D (25-OH)', 32.6, 'ng/mL'),
        extracted('Albumina/creatinina (urine)', 3.02, 'mg/mmol'),
        extracted('Albumina/creatinina (urine)', 26.69, 'mg/g'),
      ])
    ).toEqual([
      'urea: 18 mg/dL',
      'uric-acid: 4.15 mg/dL',
      'serum-iron: 214 µg/dL',
      'vitamin-d: 32.6 ng/mL',
      'albumin-creatinine-ratio: 26.69 mg/g',
    ]);
  });

  it('tells urine concentrations from 24-hour amounts, and keeps both samples', async () => {
    expect(
      await kept([
        extracted('Creatinina (urine, per litro)', 4582, 'µmol/L'),
        extracted('Creatinina (urine, per litro)', 0.51, 'g/L'),
        extracted('Creatinina (urine, 24h)', 13746, 'µmol/24h'),
        extracted('Creatinina (urine, 24h)', 1.55, 'g/24h'),
        extracted('Urea (urine, per litro)', 117, 'mmol/L'),
        extracted('Urea (urine, per litro)', 7, 'g/L'),
        extracted('Urea (urine, 24h)', 351, 'mmol/24h'),
        extracted('Urea (urine, 24h)', 21, 'g/24h'),
        // A second, spot sample: a separate measurement of the same thing
        extracted('Creatinina (urine, spot)', 4367, 'µmol/L'),
        extracted('Creatinina (urine, spot)', 0.49, 'g/L'),
      ])
    ).toEqual([
      // Neither is in the canonical unit (mg/dL): the first reported is kept
      'urine-creatinine: 4582 µmol/L',
      'urine-creatinine: 4367 µmol/L',
      '24-hour-urine-creatinine: 1.55 g/24h',
      'urine-urea: 7 g/L',
      '24-hour-urine-urea: 21 g/24h',
    ]);
  });

  it('tells concentrations in a 24-hour collection from the 24-hour amounts', async () => {
    // As the report names them: per litre of the 24-hour collection, and per 24 hours
    expect(
      await kept([
        extracted('Creatinina/L (urine 24h)', 4582, 'μmol/L'),
        extracted('Creatinina/L (urine 24h)', 0.51, 'g/L'),
        extracted('Creatinina 24h (urine)', 13746, 'μmol/24h'),
        extracted('Creatinina 24h (urine)', 1.55, 'g/24h'),
        extracted('Urea/L (urine 24h)', 117, 'mmol/L'),
        extracted('Urea/L (urine 24h)', 7, 'g/L'),
        extracted('Urea 24h (urine)', 351, 'mmol/24h'),
        extracted('Urea 24h (urine)', 21, 'g/24h'),
      ])
    ).toEqual([
      'urine-creatinine: 4582 μmol/L',
      '24-hour-urine-creatinine: 1.55 g/24h',
      'urine-urea: 7 g/L',
      '24-hour-urine-urea: 21 g/24h',
    ]);
  });

  it('merges a per-litre urine value named with its specimen only', async () => {
    // As the AI names the 24-hour collection's concentration on some runs
    expect(
      await kept([
        extracted('Urea/L (urine)', 117, 'mmol/L'),
        extracted('Urea/L (urine)', 7, 'g/L'),
        extracted('Creatinina/L (urine)', 4582, 'µmol/L'),
        extracted('Creatinina/L (urine)', 0.51, 'g/L'),
      ])
    ).toEqual(['urine-urea: 7 g/L', 'urine-creatinine: 4582 µmol/L']);
  });

  it('keeps a percentage and an absolute count of the same cells apart', async () => {
    expect(
      await kept([
        extracted('Eritroblasti', 0, '/100 WBC'),
        extracted('Eritroblasti', 0, '10^9/L'),
      ])
    ).toEqual([
      'nucleated-red-blood-cells-percentage: 0 /100 WBC',
      'nucleated-red-blood-cells: 0 10^9/L',
    ]);
    expect(
      await kept([extracted('Reticolociti', 81.3, '10^9/L'), extracted('Reticolociti', 1.67, '%')])
    ).toEqual(['reticulocytes: 81.3 10^9/L', 'reticulocytes-percentage: 1.67 %']);
    // English reports name both alike too
    expect(
      await kept([extracted('Reticulocytes', 75, '10^9/L'), extracted('Reticulocytes', 1.5, '%')])
    ).toEqual(['reticulocytes: 75 10^9/L', 'reticulocytes-percentage: 1.5 %']);
  });

  it('keeps English counts and percentages of the white cells apart', async () => {
    const cells = ['Neutrophils', 'Lymphocytes', 'Monocytes', 'Eosinophils', 'Basophils'];
    const result = await kept(
      cells.flatMap((name) => [extracted(name, 10, '%'), extracted(name, 0.5, '10^9/L')])
    );

    expect(result).toEqual(
      ['neutrophils', 'lymphocytes', 'monocytes', 'eosinophils', 'basophils'].flatMap((key) => [
        `${key}-percentage: 10 %`,
        `${key}: 0.5 10^9/L`,
      ])
    );
  });

  it('gives a count reported under any of its names in % to its percentage, exactly', async () => {
    const matches = async (biomarkers: ExtractedBiomarker[]) =>
      (await analyze(biomarkers)).matchedBiomarkers.map((b) => [
        b.dictionaryMatch?.key,
        b.isExactMatch,
      ]);

    expect(
      await matches([
        extracted('Granulociti Neutrofili', 55, '%'),
        extracted('Neutrofili (assoluti)', 3, '10^9/L'),
      ])
    ).toEqual([
      ['neutrophils-percentage', true],
      ['neutrophils', true],
    ]);
    expect(await matches([extracted('Neutrophils', 10, '%')])).toEqual([
      ['neutrophils-percentage', true],
    ]);
  });

  it('tells a 24-hour collection named once from its concentration, by the unit', async () => {
    // The same name for the collection's concentration and its 24-hour amount
    expect(
      await kept([
        extracted('Creatinina (urine, 24h)', 4582, 'µmol/L'),
        extracted('Creatinina (urine, 24h)', 0.51, 'g/L'),
        extracted('Creatinina (urine, 24h)', 13746, 'µmol/24h'),
        extracted('Creatinina (urine, 24h)', 1.55, 'g/24h'),
        extracted('Urea (urine, 24h)', 7, 'g/L'),
        extracted('Urea (urine, 24h)', 21, 'g/24h'),
      ])
    ).toEqual([
      'urine-creatinine: 4582 µmol/L',
      '24-hour-urine-creatinine: 1.55 g/24h',
      'urine-urea: 7 g/L',
      '24-hour-urine-urea: 21 g/24h',
    ]);
  });

  it('never takes a % name for the count, or a count name in an unrelated unit for anything', async () => {
    const result = await analyze([
      extracted('Neutrofili (%)', 55.2, '10^9/L'),
      extracted('Neutrophils', 3, 'mg/dL'),
    ]);

    expect(result.matchedBiomarkers.map((b) => b.dictionaryMatch?.key)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it('merges reticulocytes reported in ‰ and %, and in 10^9/L and K/µL', async () => {
    expect(
      await kept([
        extracted('Reticolociti', 16.7, '‰'),
        extracted('Reticolociti', 1.67, '%'),
        extracted('Reticolociti', 81.3, '10^9/L'),
        extracted('Reticolociti', 81.3, 'K/µL'),
      ])
    ).toEqual(['reticulocytes-percentage: 1.67 %', 'reticulocytes: 81.3 10^9/L']);
  });

  it('keeps the urine dipstick haemoglobin and the urine red cell count apart', async () => {
    expect(
      await kept([
        extracted('Emoglobina (urine)', 0, 'mg/dL'),
        extracted('Eritrociti (urine)', 15, 'cell/µL'),
      ])
    ).toEqual(['urine-blood: 0 mg/dL', 'urine-red-blood-cells: 15 cell/µL']);
  });

  it('asks which value to keep when two units cannot be compared', async () => {
    const result = await analyze([
      extracted('Zorblatin', 5, 'mg/L'),
      extracted('Zorblatin', 3, 'µmol/L'),
    ]);

    expect(result.duplicateConflicts.map((c) => c.message)).toEqual([
      '"Zorblatin" is reported in mg/L and in µmol/L, which cannot be converted to each other. Keep the value you want and delete the other.',
    ]);
  });

  it('still flags one name reported with two different values', async () => {
    const result = await analyze([
      extracted('Acido urico', 4.15, 'mg/dL'),
      extracted('Acido urico', 6.2, 'mg/dL'),
    ]);

    expect(result.duplicateConflicts).toHaveLength(1);
    expect(result.duplicateConflicts[0].message).toMatch(/^Conflicting values found for "Uric Acid"/);
  });
});
