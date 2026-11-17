/**
 * Reading a photo or scanned image of a report: drawn the way it is shown,
 * as a camera marks a photo taken turned, then read turned when it reads
 * poorly, as one taken sideways does.
 */
import { recognizeImage, type OCRResult } from './tesseractService';
import { canvasToPng, MAX_OCR_SIDE, readTurned } from './turnedReading';

export interface ReadImageOptions {
  /** OCR language(s) */
  language?: string | string[];
  /** What is being done, and the share of the image done (0-1) */
  onProgress?: (message: string, done: number) => void;
}

/** A photo read, and how far it was turned to be read */
export interface ImageReading extends OCRResult {
  /** Degrees clockwise */
  turned: number;
}

/** The image turned `turn` degrees clockwise, at `share` of its size */
async function drawTurned(bitmap: ImageBitmap, turn: number, share: number): Promise<Blob> {
  const width = Math.max(1, Math.round(bitmap.width * share));
  const height = Math.max(1, Math.round(bitmap.height * share));
  const sideways = turn % 180 !== 0;
  const canvas = document.createElement('canvas');
  canvas.width = sideways ? height : width;
  canvas.height = sideways ? width : height;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not draw the image');
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((turn * Math.PI) / 180);
    context.drawImage(bitmap, -width / 2, -height / 2, width, height);
    return await canvasToPng(canvas);
  } finally {
    // A photo is tens of megabytes of pixels: let them go before the next
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * The image no larger than OCR reads: a photo of tens of megapixels is let
 * go at once, rather than held while every turn is tried
 */
async function fitForOcr(bitmap: ImageBitmap): Promise<ImageBitmap> {
  const scale = MAX_OCR_SIDE / Math.max(bitmap.width, bitmap.height);
  if (scale >= 1) return bitmap;
  try {
    return await createImageBitmap(bitmap, {
      resizeWidth: Math.round(bitmap.width * scale),
      resizeHeight: Math.round(bitmap.height * scale),
      resizeQuality: 'high',
    });
  } finally {
    bitmap.close();
  }
}

/**
 * Read an image. One the browser cannot draw (a TIFF, say) is read by OCR
 * as it is, untouched.
 */
export async function readImage(file: Blob, { language, onProgress }: ReadImageOptions = {}): Promise<ImageReading> {
  let bitmap: ImageBitmap;
  try {
    // Drawn the way it is shown: a camera's mark of how to turn the photo is applied
    bitmap = await fitForOcr(await createImageBitmap(file, { imageOrientation: 'from-image' }));
  } catch {
    const result = await recognizeImage(file, {
      language,
      onProgress: (progress) => onProgress?.(`OCR: ${progress.status}`, progress.progress),
    });
    return { ...result, turned: 0 };
  }
  try {
    const { result, turned } = await readTurned((turn, share) => drawTurned(bitmap, turn, share), {
      language,
      onRendering: (done) => onProgress?.('Preparing image', done),
      onOcr: (status, done) => onProgress?.(`OCR: ${status}`, done),
    });
    return { ...result, turned };
  } finally {
    bitmap.close();
  }
}
