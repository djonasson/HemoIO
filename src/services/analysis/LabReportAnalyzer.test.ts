import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  analyzeLabReport,
  analyzeMultipleReports,
  AnalysisError,
} from './LabReportAnalyzer';

// Mock all dependencies
vi.mock('../ocr', () => ({
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
  findBiomarker: vi.fn().mockImplementation((name: string) => {
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
    };
    return dictionary[name.toLowerCase()];
  }),
}));

vi.mock('../units', () => ({
  normalizeUnit: vi.fn().mockImplementation((unit: string) => unit),
  canConvert: vi.fn().mockReturnValue(true),
}));

// Import mocked modules for control
import * as ocrModule from '../ocr';
import * as aiModule from '../ai';

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
});
