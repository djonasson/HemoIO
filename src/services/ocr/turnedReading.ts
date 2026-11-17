/**
 * Reading a page or photo that may have been scanned or taken turned:
 * Tesseract straightens a page a little askew, but reads one turned a
 * quarter or upside down as noise.
 */
import { recognizeImage, type OCRResult } from './tesseractService';

/** The longest side of an image for OCR, an A4 page at 300 DPI: a larger page or photo is not read huge */
export const MAX_OCR_SIDE = 3508;
/**
 * How well a reading reads, under which the image is tried turned. A page
 * read sideways comes out as letters and marks Tesseract can be fairly sure
 * of (61% on a test scan), but they seldom make words: the score is the
 * confidence times the share of the text in words (see `readingScore`)
 */
const TURN_RETRY_SCORE = 45;
/** The turns tried, sideways first: a page is more often scanned sideways than upside down */
const TURNS = [90, 270, 180] as const;
/**
 * The size, against the full one, of the image a turn is tried on: a third,
 * about 100 DPI for a page. It tells the way that reads best as surely
 * (about 70-90 against 30 or less, measured), in a quarter of the time.
 */
const TRY_SCALE = 1 / 3;
/** Readings made at most: as it is, each turn tried small, and the best turn at full size */
const READINGS = 2 + TURNS.length;

/** A canvas as a PNG image */
export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not make an image to read'));
    }, 'image/png');
  });
}

/** Letters and digits in a text */
export function letterCount(text: string): number {
  return text.replace(/[^\p{L}\p{N}]/gu, '').length;
}

/**
 * How well an OCR reading reads: its confidence times the share of its marks
 * in words, that is runs of two or more letters or digits, or decimals. A
 * report, even one of short names, units and values ("Hb 14 g/dl", "5.4"),
 * is mostly words; a page read the wrong way round is mostly single marks
 * ("Tr oO O = © = 9 Q").
 */
export function readingScore({ text, confidence }: Pick<OCRResult, 'text' | 'confidence'>): number {
  const marks = text.replace(/\s/gu, '').length;
  if (marks === 0) return 0;
  const inWords = (text.match(/\p{N}+[.,]\p{N}+|[\p{L}\p{N}]{2,}/gu) ?? []).join('').length;
  return (confidence * inWords) / marks;
}

/** The image to read, turned `turn` degrees clockwise, at `scale` of its full size for OCR */
export type RenderTurned = (turn: number, scale: number) => Promise<Blob>;

export interface ReadTurnedOptions {
  /** OCR language(s) */
  language?: string | string[];
  /** An image is being made, with the share of the reading done (0-1) */
  onRendering?: (done: number) => void;
  /** OCR's own status, with the share of the reading done (0-1) */
  onOcr?: (status: string, done: number) => void;
}

/** The best reading of an image, and how far it was turned to be read */
export interface TurnedReading {
  result: OCRResult;
  /** Degrees clockwise */
  turned: number;
}

/**
 * Read an image as it is, and when that reads poorly, try it turned: each
 * turn on a small image first, then the one reading best at full size, kept
 * when it reads better. A blank image reads as nothing whichever way it is
 * turned, so it is read once.
 */
export async function readTurned(
  render: RenderTurned,
  { language, onRendering, onOcr }: ReadTurnedOptions = {}
): Promise<TurnedReading> {
  let readings = 0;
  // Each reading has its share, so progress never goes back for an image read again
  const read = async (turn: number, scale: number): Promise<OCRResult> => {
    const slot = readings++;
    const done = (share: number) => (slot + share) / READINGS;
    onRendering?.(done(0));
    const image = await render(turn, scale);
    return recognizeImage(image, {
      language,
      onProgress: (progress) => onOcr?.(progress.status, done(progress.progress)),
    });
  };

  const upright = await read(0, 1);
  const uprightScore = readingScore(upright);
  if (uprightScore >= TURN_RETRY_SCORE || letterCount(upright.text) === 0) return { result: upright, turned: 0 };

  let best: { turn: number; score: number } | undefined;
  for (const turn of TURNS) {
    const score = readingScore(await read(turn, TRY_SCALE));
    if (!best || score > best.score) best = { turn, score };
    if (score >= TURN_RETRY_SCORE) break;
  }
  // No way round reads better, even small: the image is as it is
  if (!best || best.score <= uprightScore) return { result: upright, turned: 0 };
  const turned = await read(best.turn, 1);
  return readingScore(turned) > uprightScore ? { result: turned, turned: best.turn } : { result: upright, turned: 0 };
}
