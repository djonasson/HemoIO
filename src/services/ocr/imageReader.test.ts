import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readImage } from './imageReader';
import { recognizeImage, type OCRResult } from './tesseractService';

vi.mock('./tesseractService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tesseractService')>()),
  recognizeImage: vi.fn(),
}));

function ocr(text: string, confidence: number): OCRResult {
  return { text, confidence, words: [], wasRotated: false, rotationAngle: 0, processingTime: 1 };
}

const photo = new Blob(['jpeg'], { type: 'image/jpeg' });

describe('readImage', () => {
  let drawn: string[];
  let bitmap: { width: number; height: number; close: ReturnType<typeof vi.fn> };
  const createImageBitmap = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    drawn = [];
    bitmap = { width: 1400, height: 610, close: vi.fn() };
    createImageBitmap.mockResolvedValue(bitmap);
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    // jsdom has no canvas implementation
    const context = { translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback
    ) {
      drawn.push(`${this.width}x${this.height}`);
      callback(new Blob(['png'], { type: 'image/png' }));
    });
    vi.mocked(recognizeImage).mockResolvedValue(ocr('Glucose 95 mg/dL', 90));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the photo the way it is shown, as its camera marked it', async () => {
    const reading = await readImage(photo, { language: 'ita' });

    expect(createImageBitmap).toHaveBeenCalledWith(photo, { imageOrientation: 'from-image' });
    expect(drawn).toEqual(['1400x610']);
    expect(recognizeImage).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ language: 'ita' }));
    expect(reading).toMatchObject({ text: 'Glucose 95 mg/dL', confidence: 90, turned: 0 });
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('reads a photo taken sideways turned, trying the turn small first', async () => {
    vi.mocked(recognizeImage)
      .mockResolvedValueOnce(ocr('q~ ;l 1r ,;', 20))
      .mockResolvedValueOnce(ocr('Glucose 95 mg/dL', 80))
      .mockResolvedValueOnce(ocr('Glucose 95 mg/dL', 88));

    const reading = await readImage(photo);

    expect(drawn).toEqual(['1400x610', '203x467', '610x1400']);
    expect(reading).toMatchObject({ confidence: 88, turned: 90 });
  });

  it('reads a large photo no larger than an A4 page at 300 DPI, letting the full-size one go at once', async () => {
    const large = { width: 4000, height: 3000, close: vi.fn() };
    createImageBitmap.mockResolvedValueOnce(large).mockResolvedValueOnce({ ...bitmap, width: 3508, height: 2631 });

    await readImage(photo);

    expect(createImageBitmap).toHaveBeenLastCalledWith(large, expect.objectContaining({ resizeWidth: 3508, resizeHeight: 2631 }));
    expect(large.close).toHaveBeenCalled();
    expect(drawn).toEqual(['3508x2631']);
  });

  it('reads an image the browser cannot draw as it is', async () => {
    createImageBitmap.mockRejectedValue(new DOMException('The source image could not be decoded.', 'InvalidStateError'));

    const reading = await readImage(photo);

    expect(recognizeImage).toHaveBeenCalledWith(photo, expect.anything());
    expect(drawn).toEqual([]);
    expect(reading.turned).toBe(0);
  });

  it('lets the photo go even when it cannot be read', async () => {
    vi.mocked(recognizeImage).mockRejectedValue(new Error('OCR failed'));

    await expect(readImage(photo)).rejects.toThrow('OCR failed');
    expect(bitmap.close).toHaveBeenCalled();
  });
});
