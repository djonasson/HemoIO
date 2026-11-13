import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  recognizeImage,
  recognizeDataUrl,
  isWorkerReady,
  terminateWorker,
  getCurrentLanguage,
  OCRError,
  OCR_UNAVAILABLE_MESSAGE,
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
    // The language data is checked before a worker starts
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
  });

  afterEach(async () => {
    await terminateWorker();
    vi.unstubAllGlobals();
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

      await expect(recognizeImage(image())).rejects.toThrow(new OCRError(OCR_UNAVAILABLE_MESSAGE));
      await expect(recognizeImage(image())).resolves.toMatchObject({ text: expect.any(String) });
      expect(Tesseract.createWorker).toHaveBeenCalledTimes(2);
    });

    it('says OCR could not load when its worker script cannot load', async () => {
      vi.mocked(Tesseract.createWorker).mockRejectedValueOnce(
        new Error(
          "Uncaught NetworkError: Failed to execute 'importScripts' on 'WorkerGlobalScope': " +
            'The script at /tesseract/worker.min.js failed to load.'
        )
      );

      const error = await recognizeImage(image()).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(OCRError);
      expect(error).toHaveProperty('message', OCR_UNAVAILABLE_MESSAGE);
    });

    it('starts no worker when the language data cannot be fetched', async () => {
      vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(recognizeImage(image())).rejects.toThrow(new OCRError(OCR_UNAVAILABLE_MESSAGE));
      expect(Tesseract.createWorker).not.toHaveBeenCalled();
    });

    it('says why when OCR fails for a reason going online cannot fix', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response);

      const notFound = await recognizeImage(image()).catch((e: unknown) => e);
      vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200 } as Response);
      vi.mocked(Tesseract.createWorker).mockRejectedValueOnce(
        new ReferenceError('WebAssembly is not defined')
      );
      const noWasm = await recognizeImage(image()).catch((e: unknown) => e);

      expect(notFound).toHaveProperty(
        'message',
        'OCR could not start (its language data could not be loaded: HTTP 404). Enter the values manually instead.'
      );
      expect(noWasm).toHaveProperty(
        'message',
        'OCR could not start (WebAssembly is not defined). Enter the values manually instead.'
      );
      expect(noWasm).toHaveProperty('cause', expect.any(ReferenceError));
    });

    it('loads the worker script from its own address, so the service worker caches it', async () => {
      await recognizeImage(image());

      expect(Tesseract.createWorker).toHaveBeenCalledWith(
        expect.any(String),
        1,
        expect.objectContaining({ workerBlobURL: false }),
        expect.any(Object)
      );
    });

    it('deletes the OCR files an earlier version cached', async () => {
      const deleted: string[] = [];
      vi.stubGlobal('caches', {
        keys: vi.fn().mockResolvedValue(['ocr-assets-0.0.1', __OCR_CACHE_NAME__, 'google-fonts']),
        delete: vi.fn(async (name: string) => deleted.push(name)),
      });

      await recognizeImage(image());

      expect(deleted).toEqual(['ocr-assets-0.0.1']);
    });

    it('tells the user OCR works offline once it has been used online', () => {
      expect(OCR_UNAVAILABLE_MESSAGE).toBe(
        'OCR could not load. Connect to the internet and try again: after its first use, OCR works offline.'
      );
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

    it('reports no straightening for an upright page', async () => {
      const mockFile = new File(['test'], 'test.png', { type: 'image/png' });

      const result = await recognizeImage(mockFile);

      expect(result.rotationAngle).toBe(0);
      expect(result.wasRotated).toBe(false);
    });

    it('straightens a page scanned askew, and says by how much', async () => {
      const worker = await Tesseract.createWorker();
      vi.mocked(worker.recognize).mockResolvedValueOnce({
        data: { text: 'Glucose: 95 mg/dL', confidence: 90, words: [], rotateRadians: Math.PI / 90 },
      } as unknown as Tesseract.RecognizeResult);
      const mockFile = new File(['test'], 'test.png', { type: 'image/png' });

      const result = await recognizeImage(mockFile);

      expect(worker.recognize).toHaveBeenCalledWith(mockFile, { rotateAuto: true });
      expect(result.rotationAngle).toBeCloseTo(2);
      expect(result.wasRotated).toBe(true);
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
