import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readTurned, readingScore } from './turnedReading';
import { recognizeImage, type OCRResult } from './tesseractService';

vi.mock('./tesseractService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tesseractService')>()),
  recognizeImage: vi.fn(),
}));

function ocr(text: string, confidence: number): OCRResult {
  return { text, confidence, words: [], wasRotated: false, rotationAngle: 0, processingTime: 1 };
}

const GOOD = ocr('Glucose 95 mg/dL', 90);
const NOISE = ocr('q~ ;l 1r ,;', 20);

describe('readingScore', () => {
  it('scores a report, even of short names and units, above the same marks read the wrong way round', () => {
    const report = readingScore({ text: 'Hb 14 g/dl\nGR 4,5\nGB 6,9 10^3/ul', confidence: 61 });
    const sideways = readingScore({ text: 'Tr oO O = © = 9 Q = O Dj = © OO e I Q n = QD o © o ©', confidence: 61 });
    expect(report).toBeGreaterThan(sideways * 1.2);
  });

  it('gives the confidence itself for text all in words, and nothing for no text', () => {
    expect(readingScore({ text: 'Glucose 95 mg', confidence: 90 })).toBe(90);
    expect(readingScore({ text: ' \n', confidence: 0 })).toBe(0);
  });
});

describe('readTurned', () => {
  let rendered: Array<[number, number]>;
  const render = vi.fn(async (turn: number, scale: number) => {
    rendered.push([turn, scale]);
    return new Blob([`${turn}`]);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    rendered = [];
  });

  it('reads an image that reads well once, as it is', async () => {
    vi.mocked(recognizeImage).mockResolvedValueOnce(GOOD);

    await expect(readTurned(render, { language: 'ita' })).resolves.toEqual({ result: GOOD, turned: 0 });
    expect(rendered).toEqual([[0, 1]]);
    expect(recognizeImage).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ language: 'ita' }));
  });

  it('tries the turns on a small image, sideways first, and reads the first that reads well at full size', async () => {
    vi.mocked(recognizeImage)
      .mockResolvedValueOnce(NOISE)
      .mockResolvedValueOnce(NOISE)
      .mockResolvedValueOnce(ocr('Glucose 95 mg/dL', 80))
      .mockResolvedValueOnce(GOOD);

    const reading = await readTurned(render);

    expect(rendered).toEqual([
      [0, 1],
      [90, 1 / 3],
      [270, 1 / 3],
      [270, 1],
    ]);
    expect(reading).toEqual({ result: GOOD, turned: 270 });
  });

  it('keeps the image as it is when no turn reads better', async () => {
    vi.mocked(recognizeImage).mockResolvedValueOnce(ocr('Glucose 9S', 40)).mockResolvedValue(NOISE);

    const reading = await readTurned(render);

    // Every turn tried small, none read again at full size
    expect(rendered).toEqual([
      [0, 1],
      [90, 1 / 3],
      [270, 1 / 3],
      [180, 1 / 3],
    ]);
    expect(reading.turned).toBe(0);
  });

  it('keeps the image as it is when the turn read at full size reads no better', async () => {
    vi.mocked(recognizeImage)
      .mockResolvedValueOnce(ocr('Glucose 9S', 40))
      .mockResolvedValueOnce(ocr('Glucose 95 mg/dL', 80))
      .mockResolvedValueOnce(NOISE);

    const reading = await readTurned(render);

    expect(rendered).toEqual([
      [0, 1],
      [90, 1 / 3],
      [90, 1],
    ]);
    expect(reading).toEqual({ result: ocr('Glucose 9S', 40), turned: 0 });
  });

  it('does not turn a blank image', async () => {
    vi.mocked(recognizeImage).mockResolvedValueOnce(ocr('', 0));

    await readTurned(render);

    expect(rendered).toEqual([[0, 1]]);
  });

  it('never moves progress back while the image is read again turned', async () => {
    vi.mocked(recognizeImage).mockImplementation(async (_image, options) => {
      options?.onProgress?.({ status: 'recognizing text', progress: 1 });
      return NOISE;
    });
    const shares: number[] = [];

    await readTurned(render, {
      onRendering: (done) => shares.push(done),
      onOcr: (_status, done) => shares.push(done),
    });

    expect(shares).toEqual([...shares].sort((a, b) => a - b));
    expect(Math.max(...shares)).toBeLessThanOrEqual(1);
  });
});
