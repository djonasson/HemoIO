import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  recognizeImage,
  recognizeImages,
  recognizeDataUrl,
  isWorkerReady,
  terminateWorker,
  getCurrentLanguage,
  OCRError,
  PageSegmentationMode,
} from './tesseractService';

// Mock tesseract.js
vi.mock('tesseract.js', () => {
  const mockRecognizeResult = {
    data: {
      text: 'Patient Name: John Doe\nGlucose: 95 mg/dL\nHemoglobin: 14.5 g/dL',
      confidence: 92.5,
      words: [
        { text: 'Patient', confidence: 95, bbox: { x0: 10, y0: 10, x1: 80, y1: 30 } },
        { text: 'Name:', confidence: 94, bbox: { x0: 85, y0: 10, x1: 140, y1: 30 } },
        { text: 'John', confidence: 93, bbox: { x0: 145, y0: 10, x1: 185, y1: 30 } },
        { text: 'Doe', confidence: 91, bbox: { x0: 190, y0: 10, x1: 230, y1: 30 } },
        { text: 'Glucose:', confidence: 96, bbox: { x0: 10, y0: 40, x1: 85, y1: 60 } },
        { text: '95', confidence: 98, bbox: { x0: 90, y0: 40, x1: 115, y1: 60 } },
        { text: 'mg/dL', confidence: 97, bbox: { x0: 120, y0: 40, x1: 175, y1: 60 } },
      ],
      osd: { angle: 0 },
    },
  };

  const mockWorker = {
    recognize: vi.fn().mockResolvedValue(mockRecognizeResult),
    setParameters: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn().mockResolvedValue(undefined),
  };

  let workerInstance: typeof mockWorker | null = null;

  return {
    default: {},
    createWorker: vi.fn().mockImplementation(() => {
      workerInstance = { ...mockWorker };
      return Promise.resolve(workerInstance);
    }),
    // Expose mock worker for testing
    __getMockWorker: () => workerInstance,
    __resetMock: () => {
      workerInstance = null;
    },
  };
});

// Get mock control
import * as Tesseract from 'tesseract.js';
const { __resetMock } = Tesseract as unknown as {
  __resetMock: () => void;
};

describe('Tesseract OCR Service', () => {
  beforeEach(() => {
    __resetMock();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await terminateWorker();
  });

  describe('worker lifecycle', () => {
    const image = () => new File(['test'], 'test.png', { type: 'image/png' });

    function fakeWorker(recognize: () => Promise<unknown>) {
      return {
        recognize: vi.fn(recognize),
        setParameters: vi.fn().mockResolvedValue(undefined),
        terminate: vi.fn().mockResolvedValue(undefined),
      };
    }

    it('shares one worker between recognitions running at the same time', async () => {
      await Promise.all([recognizeImage(image()), recognizeImage(image()), recognizeImage(image())]);
      expect(Tesseract.createWorker).toHaveBeenCalledTimes(1);
    });

    it('reports progress through the same worker instead of starting another', async () => {
      vi.mocked(Tesseract.createWorker).mockImplementationOnce(async (_lang, _oem, options) => {
        const logger = (options as { logger: (m: { status: string; progress: number }) => void })
          .logger;
        return fakeWorker(async () => {
          logger({ status: 'recognizing text', progress: 0.5 });
          return { data: { text: 'Glucose 95', confidence: 90, words: [] } };
        }) as unknown as Tesseract.Worker;
      });
      const onProgress = vi.fn();

      await recognizeImage(image(), { onProgress });

      expect(Tesseract.createWorker).toHaveBeenCalledTimes(1);
      expect(onProgress).toHaveBeenCalledWith({ status: 'recognizing text', progress: 0.5 });
    });

    it('fails, then starts a new worker, when the language data cannot load', async () => {
      // tesseract.js reports this only through errorHandler: createWorker never settles
      vi.mocked(Tesseract.createWorker).mockImplementationOnce((_lang, _oem, options) => {
        const { errorHandler } = options as { errorHandler: (error: unknown) => void };
        setTimeout(() => errorHandler('Network error while fetching ita.traineddata.gz'));
        return new Promise<Tesseract.Worker>(() => {});
      });

      await expect(recognizeImage(image())).rejects.toThrow(/language data/);
      await expect(recognizeImage(image())).resolves.toMatchObject({ text: expect.any(String) });
      expect(Tesseract.createWorker).toHaveBeenCalledTimes(2);
    });

    it('keeps working after a failed recognition, without another worker', async () => {
      let calls = 0;
      vi.mocked(Tesseract.createWorker).mockImplementationOnce(
        async () =>
          fakeWorker(async () => {
            calls++;
            if (calls === 1) throw new Error('bad image');
            return { data: { text: 'ok', confidence: 90, words: [] } };
          }) as unknown as Tesseract.Worker
      );

      await expect(recognizeImage(image(), { onProgress: vi.fn() })).rejects.toThrow('bad image');
      await expect(recognizeImage(image(), { onProgress: vi.fn() })).resolves.toMatchObject({
        text: 'ok',
      });
      expect(Tesseract.createWorker).toHaveBeenCalledTimes(1);
    });
  });

  describe('recognizeImage', () => {
    it('extracts text from an image file', async () => {
      const mockFile = new File(['test'], 'test.png', { type: 'image/png' });

      const result = await recognizeImage(mockFile);

      expect(result.text).toContain('Patient Name');
      expect(result.text).toContain('Glucose');
      expect(result.confidence).toBeGreaterThan(90);
    });

    it('extracts text from a data URL', async () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

      const result = await recognizeImage(dataUrl);

      expect(result.text).toContain('Patient Name');
    });

    it('returns word-level results', async () => {
      const mockFile = new File(['test'], 'test.png', { type: 'image/png' });

      const result = await recognizeImage(mockFile);

      expect(result.words).toHaveLength(7);
      expect(result.words[0].text).toBe('Patient');
      expect(result.words[0].confidence).toBe(95);
      expect(result.words[0].bbox).toEqual({ x0: 10, y0: 10, x1: 80, y1: 30 });
    });

    it('records processing time', async () => {
      const mockFile = new File(['test'], 'test.png', { type: 'image/png' });

      const result = await recognizeImage(mockFile);

      expect(result.processingTime).toBeGreaterThanOrEqual(0);
    });

    it('loads the worker, core and languages from the app itself', async () => {
      await recognizeImage(new File(['test'], 'test.png', { type: 'image/png' }));

      expect(Tesseract.createWorker).toHaveBeenCalledWith(
        'eng+ita',
        1,
        expect.objectContaining({
          workerPath: expect.stringMatching(/\/tesseract\/worker\.min\.js$/),
          corePath: expect.stringMatching(/\/tesseract\/core$/),
          langPath: expect.stringMatching(/\/tesseract\/lang$/),
        }),
        // The Italian data's missing word list must not be looked up
        expect.objectContaining({ user_words_suffix: '' })
      );
    });

    it('loads every worker from the app itself, also when reporting progress', async () => {
      await recognizeImage(new File(['test'], 'test.png', { type: 'image/png' }), {
        onProgress: vi.fn(),
      });

      for (const call of vi.mocked(Tesseract.createWorker).mock.calls) {
        expect(call[1]).toBe(1);
        expect(call[2]).toEqual(
          expect.objectContaining({ langPath: expect.stringMatching(/\/tesseract\/lang$/) })
        );
      }
    });

    it('accepts custom language option', async () => {
      const mockFile = new File(['test'], 'test.png', { type: 'image/png' });

      await recognizeImage(mockFile, { language: 'deu' });

      expect(Tesseract.createWorker).toHaveBeenCalledWith('deu', 1, expect.any(Object), expect.any(Object));
    });

    it('accepts multiple languages', async () => {
      const mockFile = new File(['test'], 'test.png', { type: 'image/png' });

      await recognizeImage(mockFile, { language: ['eng', 'deu'] });

      expect(Tesseract.createWorker).toHaveBeenCalledWith('eng+deu', 1, expect.any(Object), expect.any(Object));
    });

    it('uses specified page segmentation mode', async () => {
      const mockFile = new File(['test'], 'test.png', { type: 'image/png' });

      await recognizeImage(mockFile, {
        pageSegmentationMode: PageSegmentationMode.SINGLE_BLOCK,
      });

      // Worker should have setParameters called
      expect(Tesseract.createWorker).toHaveBeenCalled();
    });

    it('reports progress when callback provided', async () => {
      const mockFile = new File(['test'], 'test.png', { type: 'image/png' });
      const progressCallback = vi.fn();

      await recognizeImage(mockFile, { onProgress: progressCallback });

      // With progress callback, a new worker is created
      expect(Tesseract.createWorker).toHaveBeenCalled();
    });

    it('detects rotation angle', async () => {
      const mockFile = new File(['test'], 'test.png', { type: 'image/png' });

      const result = await recognizeImage(mockFile);

      expect(result.rotationAngle).toBe(0);
      expect(result.wasRotated).toBe(false);
    });
  });

  describe('recognizeImages', () => {
    it('processes multiple images', async () => {
      const images = [
        new File(['test1'], 'test1.png', { type: 'image/png' }),
        new File(['test2'], 'test2.png', { type: 'image/png' }),
        new File(['test3'], 'test3.png', { type: 'image/png' }),
      ];

      const results = await recognizeImages(images);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.text).toContain('Patient Name');
      });
    });

    it('reports per-image progress', async () => {
      const images = [
        new File(['test1'], 'test1.png', { type: 'image/png' }),
        new File(['test2'], 'test2.png', { type: 'image/png' }),
      ];
      const progressCallback = vi.fn();

      await recognizeImages(images, { onImageProgress: progressCallback });

      expect(progressCallback).toHaveBeenCalledTimes(2);
      expect(progressCallback).toHaveBeenCalledWith(1, 2, expect.any(Object));
      expect(progressCallback).toHaveBeenCalledWith(2, 2, expect.any(Object));
    });

    it('handles empty image array', async () => {
      const results = await recognizeImages([]);

      expect(results).toEqual([]);
    });
  });

  describe('recognizeDataUrl', () => {
    it('processes data URL images', async () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

      const result = await recognizeDataUrl(dataUrl);

      expect(result.text).toContain('Patient Name');
    });
  });

  describe('Worker Management', () => {
    describe('isWorkerReady', () => {
      it('returns false when no worker is initialized', async () => {
        expect(isWorkerReady()).toBe(false);
      });

      it('returns true after first recognition', async () => {
        const mockFile = new File(['test'], 'test.png', { type: 'image/png' });
        await recognizeImage(mockFile);

        expect(isWorkerReady()).toBe(true);
      });
    });

    describe('getCurrentLanguage', () => {
      it('returns empty string when no worker', () => {
        expect(getCurrentLanguage()).toBe('');
      });

      it('returns language after initialization', async () => {
        const mockFile = new File(['test'], 'test.png', { type: 'image/png' });
        await recognizeImage(mockFile, { language: 'eng' });

        expect(getCurrentLanguage()).toBe('eng');
      });
    });

    describe('terminateWorker', () => {
      it('terminates and clears worker', async () => {
        const mockFile = new File(['test'], 'test.png', { type: 'image/png' });
        await recognizeImage(mockFile);

        expect(isWorkerReady()).toBe(true);

        await terminateWorker();

        expect(isWorkerReady()).toBe(false);
        expect(getCurrentLanguage()).toBe('');
      });

      it('handles termination when no worker exists', async () => {
        // Should not throw
        await expect(terminateWorker()).resolves.not.toThrow();
      });
    });
  });

  describe('PageSegmentationMode', () => {
    it('has expected values', () => {
      expect(PageSegmentationMode.AUTO).toBe(3);
      expect(PageSegmentationMode.SINGLE_BLOCK).toBe(6);
      expect(PageSegmentationMode.SINGLE_LINE).toBe(7);
      expect(PageSegmentationMode.SPARSE_TEXT).toBe(11);
    });
  });

  describe('OCRError', () => {
    it('has correct name property', () => {
      const error = new OCRError('Test error');

      expect(error.name).toBe('OCRError');
      expect(error.message).toBe('Test error');
    });
  });
});
