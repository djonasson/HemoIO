import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  analyzeLabReport,
  analyzeMultipleReports,
  AnalysisError,
} from './LabReportAnalyzer';

// Mock all dependencies
vi.mock('../ocr', () => ({
  OCRError: class OCRError extends Error {},
  detectDocumentType: vi.fn().mockResolvedValue({
    type: 'text-pdf',
    mimeType: 'application/pdf',
    fileName: 'test.pdf',
    fileSize: 1024,
    needsOCR: false,
    confidence: 0.95,
    metadata: { isValid: true },
  }),
  extractTextFromPDF: vi.fn().mockResolvedValue({
    fullText: 'Patient Lab Report\nGlucose: 95 mg/dL (70-100)\nHemoglobin: 14.5 g/dL',
    totalPages: 1,
    pages: [],
    isScanned: false,
    textConfidence: 0.9,
    errors: [],
  }),
  recognizeImage: vi.fn().mockResolvedValue({
    text: 'OCR extracted text with enough content for analysis to proceed successfully',
    confidence: 85,
    words: [],
    wasRotated: false,
    rotationAngle: 0,
    processingTime: 1000,
  }),
  renderPdfPages: vi.fn().mockResolvedValue([new Blob(['page1']), new Blob(['page2'])]),
  recognizeImages: vi.fn().mockResolvedValue([
    { text: 'Page one: Glucose 95 mg/dL', confidence: 90, words: [], wasRotated: false, rotationAngle: 0, processingTime: 500 },
    { text: 'Page two: Hemoglobin 14.5 g/dL', confidence: 80, words: [], wasRotated: false, rotationAngle: 0, processingTime: 500 },
  ]),
}));

vi.mock('../ai', () => {
  // Define the error class inside the factory
  class AIAnalysisError extends Error {
    readonly provider: string;
    readonly code?: string;
    constructor(message: string, provider: string, code?: string) {
      super(message);
      this.name = 'AIAnalysisError';
      this.provider = provider;
      this.code = code;
    }
  }

  return {
    getAIProvider: vi.fn().mockReturnValue({
      analyzeLabReport: vi.fn().mockResolvedValue({
        biomarkers: [
          {
            name: 'Glucose',
            value: 95,
            unit: 'mg/dL',
            referenceRange: { low: 70, high: 100, unit: 'mg/dL' },
            confidence: 0.95,
            flaggedAbnormal: false,
          },
          {
            name: 'Hemoglobin',
            value: 14.5,
            unit: 'g/dL',
            confidence: 0.92,
            flaggedAbnormal: false,
          },
        ],
        labDate: '2024-01-15',
        labName: 'City Medical Lab',
        overallConfidence: 0.93,
        analyzedText: 'test text',
        warnings: [],
        modelUsed: 'gpt-4o-mini',
        processingTime: 500,
      }),
    }),
    AIAnalysisError,
  };
});

vi.mock('../../data/biomarkers/dictionary', () => ({
  // As the dictionary does: exactly, then ignoring spacing and punctuation
  matchBiomarkerName: (name: string) =>
    mockFindBiomarker(name) ?? mockFindBiomarker(name.toLowerCase().replace(/[^a-z0-9]/g, '')),
  findBiomarker: vi.fn().mockImplementation((name: string) => mockFindBiomarker(name)),
  // No count in this dictionary has a percentage
  percentageOf: () => undefined,
}));

function mockFindBiomarker(name: string) {
  const dictionary: Record<string, { name: string; canonicalUnit: string; alternativeUnits: string[]; category: string }> = {
    glucose: {
      name: 'Glucose',
      canonicalUnit: 'mg/dL',
      alternativeUnits: ['mmol/L'],
      category: 'Metabolic',
    },
    hemoglobin: {
      name: 'Hemoglobin',
      canonicalUnit: 'g/dL',
      alternativeUnits: ['g/L'],
      category: 'CBC',
    },
    creatinine: {
      name: 'Creatinine',
      canonicalUnit: 'mg/dL',
      alternativeUnits: ['µmol/L'],
      category: 'Metabolic',
    },
  };
  return dictionary[name.toLowerCase()];
}

vi.mock('../units', () => ({
  normalizeUnit: vi.fn().mockImplementation((unit: string) => unit),
  // The mocked conversions below take the dictionary names themselves
  componentForBiomarker: (name: string) => name,
  unitsMatch: (a: string, b: string) => a.toLowerCase() === b.toLowerCase(),
  canConvert: vi.fn().mockImplementation((name: string, from: string, to: string) => {
    // Glucose can be converted between mg/dL and mmol/L
    if (name.toLowerCase() === 'glucose') {
      return (from === 'mg/dL' && to === 'mg/dL') ||
             (from === 'mmol/L' && to === 'mg/dL') ||
             (from === 'mg/dL' && to === 'mmol/L');
    }
    if (name.toLowerCase() === 'creatinine') {
      return ['mg/dL', 'µmol/L'].includes(from) && ['mg/dL', 'µmol/L'].includes(to);
    }
    return from === to;
  }),
  convertValue: vi.fn().mockImplementation((name: string, value: number, from: string, to: string) => {
    // Glucose conversion: mg/dL to mmol/L (divide by 18.0182) or vice versa
    if (name.toLowerCase() === 'glucose') {
      if (from === 'mmol/L' && to === 'mg/dL') {
        return { convertedValue: Math.round(value * 18.0182), originalValue: value, originalUnit: from, targetUnit: to, precision: 0 };
      }
      if (from === 'mg/dL' && to === 'mmol/L') {
        return { convertedValue: Math.round(value / 18.0182 * 100) / 100, originalValue: value, originalUnit: from, targetUnit: to, precision: 2 };
      }
    }
    if (name.toLowerCase() === 'creatinine' && from === 'µmol/L' && to === 'mg/dL') {
      return { convertedValue: Math.round(value * 0.0113 * 100) / 100, originalValue: value, originalUnit: from, targetUnit: to, precision: 2 };
    }
    return { convertedValue: value, originalValue: value, originalUnit: from, targetUnit: to, precision: 2 };
  }),
}));

// Import mocked modules for control
import * as ocrModule from '../ocr';
import * as aiModule from '../ai';
import type { AnalysisOptions } from '../ai/types';

// Helper to create mock files
function createMockFile(name: string, type: string, size: number = 1024): File {
  const content = new ArrayBuffer(size);
  const file = new File([content], name, { type });
  (file as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = () =>
    Promise.resolve(content);
  return file;
}

describe('LabReportAnalyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('analyzeLabReport', () => {
    const defaultOptions = {
      aiProvider: 'openai' as const,
      aiConfig: { apiKey: 'sk-test-key' },
    };

    it('analyzes a text PDF successfully', async () => {
      const file = createMockFile('report.pdf', 'application/pdf');

      const result = await analyzeLabReport(file, defaultOptions);

      expect(result.fileName).toBe('report.pdf');
      expect(result.documentType).toBe('text-pdf');
      expect(result.extractionMethod).toBe('pdf-text');
      expect(result.matchedBiomarkers).toHaveLength(2);
    });

    it('includes AI analysis results', async () => {
      const file = createMockFile('report.pdf', 'application/pdf');

      const result = await analyzeLabReport(file, defaultOptions);

      expect(result.aiAnalysis).toBeDefined();
      expect(result.aiAnalysis.biomarkers).toHaveLength(2);
      expect(result.labDate).toBe('2024-01-15');
      expect(result.labName).toBe('City Medical Lab');
    });

    it('matches biomarkers to dictionary', async () => {
      const file = createMockFile('report.pdf', 'application/pdf');

      const result = await analyzeLabReport(file, defaultOptions);

      const glucoseMatch = result.matchedBiomarkers.find(
        (b) => b.name === 'Glucose'
      );
      expect(glucoseMatch?.isExactMatch).toBe(true);
      expect(glucoseMatch?.dictionaryMatch).toBeDefined();
    });

    it('generates unique analysis ID', async () => {
      const file = createMockFile('report.pdf', 'application/pdf');

      const result1 = await analyzeLabReport(file, defaultOptions);
      const result2 = await analyzeLabReport(file, defaultOptions);

      expect(result1.id).not.toBe(result2.id);
      expect(result1.id).toMatch(/^analysis_\d+_[a-z0-9]+$/);
    });

    it('tracks processing stages', async () => {
      const file = createMockFile('report.pdf', 'application/pdf');

      const result = await analyzeLabReport(file, defaultOptions);

      expect(result.stages).toHaveLength(4);
      expect(result.stages.map((s) => s.name)).toEqual([
        'Document Detection',
        'Text Extraction',
        'AI Analysis',
        'Biomarker Matching',
      ]);
      expect(result.stages.every((s) => s.status === 'completed')).toBe(true);
    });

    it('calculates total processing time', async () => {
      const file = createMockFile('report.pdf', 'application/pdf');

      const result = await analyzeLabReport(file, defaultOptions);

      expect(result.totalProcessingTime).toBeGreaterThan(0);
    });

    it('calls progress callback during analysis', async () => {
      const file = createMockFile('report.pdf', 'application/pdf');
      const progressCallback = vi.fn();

      await analyzeLabReport(file, {
        ...defaultOptions,
        onProgress: progressCallback,
      });

      expect(progressCallback).toHaveBeenCalled();
      expect(progressCallback).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number)
      );
    });

    it('uses OCR for images', async () => {
      vi.mocked(ocrModule.detectDocumentType).mockResolvedValueOnce({
        type: 'image',
        mimeType: 'image/jpeg',
        fileName: 'scan.jpg',
        fileSize: 1024,
        needsOCR: true,
        confidence: 1.0,
        metadata: { isValid: true },
      });

      const file = createMockFile('scan.jpg', 'image/jpeg');

      const result = await analyzeLabReport(file, defaultOptions);

      expect(result.extractionMethod).toBe('ocr');
      expect(ocrModule.recognizeImage).toHaveBeenCalled();
    });

    it('shows why OCR failed in words the user can act on', async () => {
      vi.mocked(ocrModule.detectDocumentType).mockResolvedValueOnce({
        type: 'image',
        mimeType: 'image/jpeg',
        fileName: 'scan.jpg',
        fileSize: 1024,
        needsOCR: true,
        confidence: 1.0,
        metadata: { isValid: true },
      });
      vi.mocked(ocrModule.recognizeImage).mockRejectedValueOnce(
        new ocrModule.OCRError('OCR could not load.')
      );

      await expect(
        analyzeLabReport(createMockFile('scan.jpg', 'image/jpeg'), defaultOptions)
      ).rejects.toThrow(/^OCR could not load\.$/);
    });

    it('handles document detection failure', async () => {
      vi.mocked(ocrModule.detectDocumentType).mockResolvedValueOnce({
        type: 'image',
        mimeType: 'unknown',
        fileName: 'test.exe',
        fileSize: 1024,
        needsOCR: false,
        confidence: 0,
        metadata: {
          isValid: false,
          validationError: 'Unsupported file type',
        },
      });

      const file = createMockFile('test.exe', 'application/x-msdownload');

      await expect(analyzeLabReport(file, defaultOptions)).rejects.toThrow(
        AnalysisError
      );
    });

    it('shows the rate-limit wait as a progress stage', async () => {
      const realProvider = vi.mocked(aiModule.getAIProvider)(
        'openai',
        defaultOptions.aiConfig
      );
      vi.mocked(aiModule.getAIProvider).mockReturnValueOnce({
        type: 'openai',
        name: 'OpenAI',
        analyzeLabReport: vi.fn(async (text: string, options?: AnalysisOptions) => {
          options?.rateLimit?.onWait?.(2000, 1);
          options?.rateLimit?.onResume?.();
          return realProvider.analyzeLabReport(text);
        }),
        validateConfiguration: vi.fn(),
        testConnection: vi.fn(),
      });
      const stages: string[] = [];
      const file = createMockFile('report.pdf', 'application/pdf');

      await analyzeLabReport(file, { ...defaultOptions, onProgress: (stage) => stages.push(stage) });

      const waiting = stages.indexOf('Waiting for the AI provider (rate limited)');
      expect(waiting).toBeGreaterThan(stages.indexOf('Analyzing with OpenAI'));
      expect(stages.lastIndexOf('Analyzing with OpenAI')).toBeGreaterThan(waiting);
    });

    it('names the provider and model it analyzes with', async () => {
      const stagesWith = async (options: Parameters<typeof analyzeLabReport>[1]) => {
        const stages: string[] = [];
        const file = createMockFile('report.pdf', 'application/pdf');
        await analyzeLabReport(file, { ...options, onProgress: (stage) => stages.push(stage) });
        return stages;
      };

      expect(
        await stagesWith({ ...defaultOptions, aiConfig: { apiKey: 'sk', model: 'gpt-4o-mini' } })
      ).toContain('Analyzing with OpenAI gpt-4o-mini');
      // Without a chosen model, the provider's default: named by the provider alone
      expect(await stagesWith({ aiProvider: 'anthropic', aiConfig: { apiKey: 'sk' } })).toContain(
        'Analyzing with Anthropic'
      );
      expect(await stagesWith({ aiProvider: 'ollama', aiConfig: { model: 'llama3.2' } })).toContain(
        'Analyzing with Ollama llama3.2'
      );
    });

    it('handles AI analysis failure', async () => {
      vi.mocked(aiModule.getAIProvider).mockReturnValueOnce({
        type: 'openai',
        name: 'OpenAI',
        analyzeLabReport: vi.fn().mockRejectedValue(new Error('API error')),
        validateConfiguration: vi.fn(),
        testConnection: vi.fn(),
      });

      const file = createMockFile('report.pdf', 'application/pdf');

      await expect(analyzeLabReport(file, defaultOptions)).rejects.toThrow(
        'AI analysis failed'
      );
    });

    it('adds warnings for low OCR confidence', async () => {
      vi.mocked(ocrModule.detectDocumentType).mockResolvedValueOnce({
        type: 'image',
        mimeType: 'image/jpeg',
        fileName: 'blurry.jpg',
        fileSize: 1024,
        needsOCR: true,
        confidence: 1.0,
        metadata: { isValid: true },
      });

      vi.mocked(ocrModule.recognizeImage).mockResolvedValueOnce({
        text: 'Some blurry text that is hard to read but still contains enough characters',
        confidence: 50,
        words: [],
        wasRotated: false,
        rotationAngle: 0,
        processingTime: 1000,
      });

      const file = createMockFile('blurry.jpg', 'image/jpeg');

      const result = await analyzeLabReport(file, defaultOptions);

      expect(result.warnings.some((w) => w.includes('Low OCR confidence'))).toBe(
        true
      );
    });

    it('handles empty extracted text', async () => {
      vi.mocked(ocrModule.extractTextFromPDF).mockResolvedValueOnce({
        fullText: '',
        totalPages: 1,
        pages: [],
        isScanned: false,
        textConfidence: 0,
        errors: [],
      });

      const file = createMockFile('empty.pdf', 'application/pdf');

      await expect(analyzeLabReport(file, defaultOptions)).rejects.toThrow(
        'No readable text found'
      );
    });
  });

  describe('analyzeMultipleReports', () => {
    const defaultOptions = {
      aiProvider: 'openai' as const,
      aiConfig: { apiKey: 'sk-test-key' },
    };

    it('analyzes multiple files', async () => {
      const files = [
        createMockFile('report1.pdf', 'application/pdf'),
        createMockFile('report2.pdf', 'application/pdf'),
      ];

      const results = await analyzeMultipleReports(files, defaultOptions);

      expect(results).toHaveLength(2);
      expect(results.every((r) => 'matchedBiomarkers' in r)).toBe(true);
    });

    it('reports progress per file', async () => {
      const files = [
        createMockFile('report1.pdf', 'application/pdf'),
        createMockFile('report2.pdf', 'application/pdf'),
      ];
      const progressCallback = vi.fn();

      await analyzeMultipleReports(files, defaultOptions, progressCallback);

      expect(progressCallback).toHaveBeenCalledTimes(2);
      expect(progressCallback).toHaveBeenCalledWith(1, 2, expect.any(Object));
      expect(progressCallback).toHaveBeenCalledWith(2, 2, expect.any(Object));
    });

    it('handles individual file failures', async () => {
      vi.mocked(ocrModule.detectDocumentType)
        .mockResolvedValueOnce({
          type: 'text-pdf',
          mimeType: 'application/pdf',
          fileName: 'good.pdf',
          fileSize: 1024,
          needsOCR: false,
          confidence: 0.95,
          metadata: { isValid: true },
        })
        .mockResolvedValueOnce({
          type: 'image',
          mimeType: 'unknown',
          fileName: 'bad.exe',
          fileSize: 1024,
          needsOCR: false,
          confidence: 0,
          metadata: { isValid: false, validationError: 'Unsupported' },
        });

      const files = [
        createMockFile('good.pdf', 'application/pdf'),
        createMockFile('bad.exe', 'application/x-msdownload'),
      ];

      const results = await analyzeMultipleReports(files, defaultOptions);

      expect(results).toHaveLength(2);
      expect('matchedBiomarkers' in results[0]).toBe(true);
      expect('error' in results[1]).toBe(true);
    });

    it('continues processing after failures', async () => {
      vi.mocked(ocrModule.detectDocumentType)
        .mockResolvedValueOnce({
          type: 'image',
          mimeType: 'unknown',
          fileName: 'bad.exe',
          fileSize: 1024,
          needsOCR: false,
          confidence: 0,
          metadata: { isValid: false, validationError: 'Unsupported' },
        })
        .mockResolvedValueOnce({
          type: 'text-pdf',
          mimeType: 'application/pdf',
          fileName: 'good.pdf',
          fileSize: 1024,
          needsOCR: false,
          confidence: 0.95,
          metadata: { isValid: true },
        });

      const files = [
        createMockFile('bad.exe', 'application/x-msdownload'),
        createMockFile('good.pdf', 'application/pdf'),
      ];

      const results = await analyzeMultipleReports(files, defaultOptions);

      expect(results).toHaveLength(2);
      expect('error' in results[0]).toBe(true);
      expect('matchedBiomarkers' in results[1]).toBe(true);
    });
  });

  describe('AnalysisError', () => {
    it('has correct properties', () => {
      const cause = new Error('Original error');
      const error = new AnalysisError('Test message', 'Test Stage', cause);

      expect(error.name).toBe('AnalysisError');
      expect(error.message).toBe('Test message');
      expect(error.stage).toBe('Test Stage');
      expect(error.cause).toBe(cause);
    });
  });

  describe('scanned PDFs', () => {
    it('renders the pages and sends the OCR text to the AI', async () => {
      vi.mocked(ocrModule.detectDocumentType).mockResolvedValueOnce({
        type: 'scanned-pdf',
        mimeType: 'application/pdf',
        fileName: 'scan.pdf',
        fileSize: 1024,
        needsOCR: true,
        confidence: 0.9,
        metadata: { isValid: true },
      });
      vi.mocked(ocrModule.extractTextFromPDF).mockResolvedValueOnce({
        fullText: '',
        totalPages: 2,
        pages: [],
        isScanned: true,
        textConfidence: 0,
        errors: [],
      });
      const analyze = vi.fn().mockResolvedValue({
        biomarkers: [],
        overallConfidence: 0.9,
        analyzedText: '',
        warnings: [],
        modelUsed: 'test',
        processingTime: 1,
      });
      vi.mocked(aiModule.getAIProvider).mockReturnValueOnce({
        type: 'openai',
        name: 'OpenAI',
        analyzeLabReport: analyze,
        validateConfiguration: vi.fn(),
        testConnection: vi.fn(),
      });

      const result = await analyzeLabReport(createMockFile('scan.pdf', 'application/pdf'), {
        aiProvider: 'openai',
        aiConfig: { apiKey: 'sk-test-key', model: 'test-model' },
      });

      expect(ocrModule.renderPdfPages).toHaveBeenCalled();
      const sentText = analyze.mock.calls[0][0] as string;
      expect(sentText).toContain('Page one: Glucose 95 mg/dL');
      expect(sentText).toContain('Page two: Hemoglobin 14.5 g/dL');
      expect(sentText).not.toContain('Unable to extract text');
      expect(result.extractionMethod).toBe('ocr');
    });

    it('runs OCR when the text layer is only page separators and stray marks', async () => {
      vi.mocked(ocrModule.detectDocumentType).mockResolvedValueOnce({
        type: 'scanned-pdf',
        mimeType: 'application/pdf',
        fileName: 'scan.pdf',
        fileSize: 1024,
        needsOCR: true,
        confidence: 0.9,
        metadata: { isValid: true },
      });
      vi.mocked(ocrModule.extractTextFromPDF).mockResolvedValueOnce({
        // 40 pages with one stray mark each: over 100 characters, all but 40 of them breaks
        fullText: Array(40).fill('.').join('\n\n'),
        totalPages: 2,
        pages: [],
        isScanned: true,
        textConfidence: 0,
        errors: [],
      });
      const analyze = vi.fn().mockResolvedValue({
        biomarkers: [],
        overallConfidence: 0.9,
        analyzedText: '',
        warnings: [],
        modelUsed: 'test',
        processingTime: 1,
      });
      vi.mocked(aiModule.getAIProvider).mockReturnValueOnce({
        type: 'openai',
        name: 'OpenAI',
        analyzeLabReport: analyze,
        validateConfiguration: vi.fn(),
        testConnection: vi.fn(),
      });

      const result = await analyzeLabReport(createMockFile('scan.pdf', 'application/pdf'), {
        aiProvider: 'openai',
        aiConfig: { apiKey: 'sk-test-key', model: 'test-model' },
      });

      expect(ocrModule.renderPdfPages).toHaveBeenCalled();
      const sentText = analyze.mock.calls[0][0] as string;
      expect(sentText).toContain('Page one: Glucose 95 mg/dL');
      expect(sentText).toContain('Page two: Hemoglobin 14.5 g/dL');
      expect(sentText).not.toContain('Unable to extract text');
      expect(result.extractionMethod).toBe('ocr');
    });
  });

  describe('dictionary matching', () => {
    const defaultOptions = {
      aiProvider: 'openai' as const,
      aiConfig: { apiKey: 'sk-test-key' },
    };

    function mockExtraction(biomarkers: Array<{ name: string; value: number; unit: string }>) {
      vi.mocked(aiModule.getAIProvider).mockReturnValueOnce({
        type: 'openai',
        name: 'OpenAI',
        analyzeLabReport: vi.fn().mockResolvedValue({
          biomarkers: biomarkers.map((b) => ({ ...b, confidence: 0.9, flaggedAbnormal: false })),
          labDate: '2024-01-15',
          labName: 'Test Lab',
          overallConfidence: 0.9,
          analyzedText: 'test text',
          warnings: [],
          modelUsed: 'gpt-4o-mini',
          processingTime: 500,
        }),
        validateConfiguration: vi.fn(),
        testConnection: vi.fn(),
      });
    }

    it('matches name variations (punctuation, spacing) to the dictionary', async () => {
      mockExtraction([{ name: 'Hemo-globin', value: 14.5, unit: 'g/dL' }]);

      const result = await analyzeLabReport(createMockFile('report.pdf', 'application/pdf'), defaultOptions);

      const [biomarker] = result.matchedBiomarkers;
      expect(biomarker.dictionaryMatch?.name).toBe('Hemoglobin');
      expect(biomarker.isExactMatch).toBe(false);
    });

    it('only suggests a match when the unit is incompatible', async () => {
      mockExtraction([{ name: 'Hemo-globin', value: 14.5, unit: 'mg/dL' }]);

      const result = await analyzeLabReport(createMockFile('report.pdf', 'application/pdf'), defaultOptions);

      const [biomarker] = result.matchedBiomarkers;
      expect(biomarker.dictionaryMatch).toBeUndefined();
      expect(biomarker.suggestedMatch?.name).toBe('Hemoglobin');
    });
  });

  describe('biomarker deduplication', () => {
    const defaultOptions = {
      aiProvider: 'openai' as const,
      aiConfig: { apiKey: 'sk-test-key' },
    };

    it('deduplicates biomarkers with same value in different units', async () => {
      // Mock AI to return duplicate Glucose values in different units
      // 100 mg/dL and 5.55 mmol/L are equivalent (5.55 * 18.0182 ≈ 100)
      vi.mocked(aiModule.getAIProvider).mockReturnValueOnce({
        type: 'openai',
        name: 'OpenAI',
        analyzeLabReport: vi.fn().mockResolvedValue({
          biomarkers: [
            {
              name: 'Glucose',
              value: 100,
              unit: 'mg/dL',
              referenceRange: { low: 70, high: 100, unit: 'mg/dL' },
              confidence: 0.95,
              flaggedAbnormal: false,
            },
            {
              name: 'Glucose',
              value: 5.55,
              unit: 'mmol/L',
              referenceRange: { low: 3.9, high: 5.6, unit: 'mmol/L' },
              confidence: 0.90,
              flaggedAbnormal: false,
            },
          ],
          labDate: '2024-01-15',
          labName: 'Test Lab',
          overallConfidence: 0.92,
          analyzedText: 'test text',
          warnings: [],
          modelUsed: 'gpt-4o-mini',
          processingTime: 500,
        }),
        validateConfiguration: vi.fn(),
        testConnection: vi.fn(),
      });

      const file = createMockFile('report.pdf', 'application/pdf');
      const result = await analyzeLabReport(file, defaultOptions);

      // Should have only one Glucose entry (deduplicated)
      const glucoseEntries = result.matchedBiomarkers.filter(
        (b) => b.name === 'Glucose'
      );
      expect(glucoseEntries).toHaveLength(1);
      expect(result.duplicateConflicts).toHaveLength(0);
    });

    function mockCreatinineDuplicates(micromolar: number, mgPerDl: number) {
      vi.mocked(aiModule.getAIProvider).mockReturnValueOnce({
        type: 'openai',
        name: 'OpenAI',
        analyzeLabReport: vi.fn().mockResolvedValue({
          biomarkers: [
            { name: 'Creatinine', value: micromolar, unit: 'µmol/L', confidence: 0.95, flaggedAbnormal: false },
            { name: 'Creatinine', value: mgPerDl, unit: 'mg/dL', confidence: 0.95, flaggedAbnormal: false },
          ],
          labDate: '2024-01-15',
          labName: 'Test Lab',
          overallConfidence: 0.95,
          analyzedText: 'test text',
          warnings: [],
          modelUsed: 'gpt-4o-mini',
          processingTime: 500,
        }),
        validateConfiguration: vi.fn(),
        testConnection: vi.fn(),
      });
    }

    it('flags small-valued duplicates that differ by less than one unit', async () => {
      // 67 µmol/L is 0.76 mg/dL: clearly not the same result as 1.5 mg/dL
      mockCreatinineDuplicates(67, 1.5);

      const result = await analyzeLabReport(createMockFile('report.pdf', 'application/pdf'), defaultOptions);

      expect(result.duplicateConflicts).toHaveLength(1);
      expect(result.matchedBiomarkers.filter((b) => b.name === 'Creatinine')).toHaveLength(2);
    });

    it('merges small-valued duplicates that are equal after conversion', async () => {
      // 88.4 µmol/L is 1.0 mg/dL
      mockCreatinineDuplicates(88.4, 1.0);

      const result = await analyzeLabReport(createMockFile('report.pdf', 'application/pdf'), defaultOptions);

      expect(result.duplicateConflicts).toHaveLength(0);
      expect(result.matchedBiomarkers.filter((b) => b.name === 'Creatinine')).toHaveLength(1);
    });

    it('flags conflicting duplicate biomarkers for user review', async () => {
      // Mock AI to return conflicting Glucose values
      // 100 mg/dL and 8.0 mmol/L are NOT equivalent (8.0 * 18.0182 ≈ 144, not 100)
      vi.mocked(aiModule.getAIProvider).mockReturnValueOnce({
        type: 'openai',
        name: 'OpenAI',
        analyzeLabReport: vi.fn().mockResolvedValue({
          biomarkers: [
            {
              name: 'Glucose',
              value: 100,
              unit: 'mg/dL',
              referenceRange: { low: 70, high: 100, unit: 'mg/dL' },
              confidence: 0.95,
              flaggedAbnormal: false,
            },
            {
              name: 'Glucose',
              value: 8.0,
              unit: 'mmol/L',
              referenceRange: { low: 3.9, high: 5.6, unit: 'mmol/L' },
              confidence: 0.90,
              flaggedAbnormal: true,
            },
          ],
          labDate: '2024-01-15',
          labName: 'Test Lab',
          overallConfidence: 0.92,
          analyzedText: 'test text',
          warnings: [],
          modelUsed: 'gpt-4o-mini',
          processingTime: 500,
        }),
        validateConfiguration: vi.fn(),
        testConnection: vi.fn(),
      });

      const file = createMockFile('report.pdf', 'application/pdf');
      const result = await analyzeLabReport(file, defaultOptions);

      // Both entries should be kept since values conflict
      const glucoseEntries = result.matchedBiomarkers.filter(
        (b) => b.name === 'Glucose'
      );
      expect(glucoseEntries).toHaveLength(2);

      // All Glucose entries should be flagged as having conflicts
      expect(glucoseEntries.every((g) => g.hasDuplicateConflict)).toBe(true);

      // Should have one conflict for Glucose
      expect(result.duplicateConflicts).toHaveLength(1);
      expect(result.duplicateConflicts[0].biomarkerName).toBe('Glucose');
      expect(result.duplicateConflicts[0].valuesMatch).toBe(false);

      // Warnings should mention the conflict
      expect(
        result.warnings.some((w) => w.includes('conflicting duplicate'))
      ).toBe(true);
    });
  });
});
