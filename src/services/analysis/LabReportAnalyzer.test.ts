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
      chooseTests: vi.fn().mockResolvedValue([]),
    }),
    AIAnalysisError,
  };
});

// Import mocked modules for control
import * as ocrModule from '../ocr';
import * as aiModule from '../ai';
import { fixtureCatalog } from '@/test/loincFixture';
import type { AnalysisOptions } from '../ai/types';

const catalog = fixtureCatalog();

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
      catalog,
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

    it('identifies each value in the LOINC catalog', async () => {
      const file = createMockFile('report.pdf', 'application/pdf');

      const result = await analyzeLabReport(file, defaultOptions);

      const hemoglobin = result.matchedBiomarkers.find((b) => b.name === 'Hemoglobin');
      expect(hemoglobin).toMatchObject({ loincCode: '718-7', identifiedBy: 'local', isExactMatch: true });
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
        'Test Identification',
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
        chooseTests: vi.fn(),
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
      expect(await stagesWith({ ...defaultOptions, aiProvider: 'anthropic', aiConfig: { apiKey: 'sk' } })).toContain(
        'Analyzing with Anthropic'
      );
      expect(await stagesWith({ ...defaultOptions, aiProvider: 'ollama', aiConfig: { model: 'llama3.2' } })).toContain(
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
        chooseTests: vi.fn(),
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
      catalog,
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
        chooseTests: vi.fn(),
      });

      const result = await analyzeLabReport(createMockFile('scan.pdf', 'application/pdf'), {
        aiProvider: 'openai',
        aiConfig: { apiKey: 'sk-test-key', model: 'test-model' },
        catalog,
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
        chooseTests: vi.fn(),
      });

      const result = await analyzeLabReport(createMockFile('scan.pdf', 'application/pdf'), {
        aiProvider: 'openai',
        aiConfig: { apiKey: 'sk-test-key', model: 'test-model' },
        catalog,
      });

      expect(ocrModule.renderPdfPages).toHaveBeenCalled();
      const sentText = analyze.mock.calls[0][0] as string;
      expect(sentText).toContain('Page one: Glucose 95 mg/dL');
      expect(sentText).toContain('Page two: Hemoglobin 14.5 g/dL');
      expect(sentText).not.toContain('Unable to extract text');
      expect(result.extractionMethod).toBe('ocr');
    });
  });
});
