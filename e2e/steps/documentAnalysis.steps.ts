/**
 * Step definitions for features/document-analysis.feature
 *
 * Generates real documents (text PDFs, scanned PDFs, text images) so the app's
 * own extraction pipeline (pdf.js, Tesseract) runs, and scripts the mocked
 * local Ollama server so tests can see exactly what text reached the AI and
 * control how the AI responds.
 */

import { expect, type Page, type Route } from '@playwright/test';
import { DEFAULT_EXTRACTION, MOCK_OLLAMA_MODELS, isTestChoiceRequest } from './ai.steps';
import { writeTempFile } from './tempFiles';

const OLLAMA_CHAT_URL = '**/localhost:11434/api/chat';

/**
 * How the mocked AI answers one analysis request
 */
export type ChatReply =
  | { extraction: object }
  /** An answer as the AI wrote it, whatever its shape */
  | { content: string }
  /** An answer Ollama stopped at the length limit: `content` is all it sent */
  | { cutOff: string }
  | { status: number; error: string; headers?: Record<string, string> }
  | { abort: true };

export interface OllamaChatScript {
  /** Lab report prompts sent to the AI, in request order */
  prompts: string[];
  /** The instructions (system prompt) of each lab report request, in request order */
  systemPrompts: string[];
  /** Each request's answer limit (num_predict), in request order */
  answerLimits: number[];
  /** Each request's context size (num_ctx), in request order */
  contexts: number[];
  /** The answer shape each request asked for (format): "json" or a JSON schema, in request order */
  formats: unknown[];
  /** Highest number of analysis requests in flight at the same time */
  maxInFlight: number;
  /** Let held requests (and all later ones) be answered */
  release: () => void;
}

export interface OllamaChatOptions {
  /** Hold every request until `release()` is called */
  hold?: boolean;
  /**
   * Answer each request after this long, as a real model does. Without it,
   * requests sent at the same time rarely overlap, so maxInFlight cannot
   * show that they were.
   */
  replyDelayMs?: number;
}

/**
 * Script the AI's answers to analysis requests. Reply `n` answers request
 * `n`; the last reply answers every request after that. Registered after
 * `mockOllama`, so it takes precedence for chat completions.
 */
export async function scriptOllamaChat(
  page: Page,
  replies: ChatReply[] = [{ extraction: DEFAULT_EXTRACTION }],
  options: OllamaChatOptions = {}
): Promise<OllamaChatScript> {
  let releaseHeld: () => void = () => {};
  const released = options.hold
    ? new Promise<void>((resolve) => {
        releaseHeld = resolve;
      })
    : Promise.resolve();

  let inFlight = 0;
  const script: OllamaChatScript = {
    prompts: [],
    systemPrompts: [],
    answerLimits: [],
    contexts: [],
    formats: [],
    maxInFlight: 0,
    release: () => releaseHeld(),
  };

  await page.route(OLLAMA_CHAT_URL, async (route: Route) => {
    const index = script.prompts.length;
    const body = route.request().postDataJSON() as {
      messages: { role: string; content: string }[];
      options?: { num_predict?: number; num_ctx?: number };
      format?: unknown;
    };
    // Which test values are is asked apart from the report: mockOllama answers it
    if (isTestChoiceRequest(body)) {
      await route.fallback();
      return;
    }
    script.prompts.push(body.messages.find((m) => m.role === 'user')?.content ?? '');
    script.systemPrompts.push(body.messages.find((m) => m.role === 'system')?.content ?? '');
    script.answerLimits.push(body.options?.num_predict ?? 0);
    script.contexts.push(body.options?.num_ctx ?? 0);
    script.formats.push(body.format);

    inFlight++;
    script.maxInFlight = Math.max(script.maxInFlight, inFlight);
    await released;
    if (options.replyDelayMs) await new Promise((wait) => setTimeout(wait, options.replyDelayMs));

    const reply = replies[Math.min(index, replies.length - 1)];
    try {
      if ('abort' in reply) {
        await route.abort('connectionrefused');
      } else if ('status' in reply) {
        await route.fulfill({
          status: reply.status,
          headers: reply.headers,
          contentType: 'application/json',
          // As Ollama's OpenAI-compatible endpoint sends errors
          body: JSON.stringify({ error: { message: reply.error, type: 'api_error' } }),
        });
      } else {
        const cutOff = 'cutOff' in reply;
        const content = cutOff ? reply.cutOff : 'content' in reply ? reply.content : JSON.stringify(reply.extraction);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            model: MOCK_OLLAMA_MODELS[0],
            message: {
              role: 'assistant',
              content,
            },
            done: true,
            done_reason: cutOff ? 'length' : 'stop',
          }),
        });
      }
    } finally {
      inFlight--;
    }
  });

  return script;
}

/**
 * Build an extraction result as the AI would return it
 */
export function extraction(
  biomarkers: object[],
  extra: { labDate?: string; labName?: string; warnings?: string[] } = {}
): object {
  return {
    biomarkers,
    labDate: extra.labDate ?? DEFAULT_EXTRACTION.labDate,
    labName: extra.labName ?? DEFAULT_EXTRACTION.labName,
    warnings: extra.warnings ?? [],
  };
}

export const LAB_REPORT_LINES = [
  'Test Laboratory - Blood Panel Report',
  'Collection date: 15.01.2024',
  'Glucose 95 mg/dL reference 70-100',
  'Hemoglobin 14.5 g/dL reference 13.5-17.5',
];

/**
 * Assemble a PDF from object bodies, computing the cross-reference table
 */
function assemblePdf(objects: Buffer[]): Buffer {
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  let length = parts[0].length;
  const offsets: number[] = [];

  objects.forEach((obj, i) => {
    offsets.push(length);
    const chunk = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`, 'latin1'),
      obj,
      Buffer.from('\nendobj\n', 'latin1'),
    ]);
    parts.push(chunk);
    length += chunk.length;
  });

  const xref =
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`;
  parts.push(Buffer.from(xref, 'latin1'));

  return Buffer.concat(parts);
}

function streamObject(dict: string, data: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(`<< ${dict} /Length ${data.length} >>\nstream\n`, 'latin1'),
    data,
    Buffer.from('\nendstream', 'latin1'),
  ]);
}

/** A PDF page: its size in points, its content stream, and a JPEG it can draw as /Im1 */
interface PdfPageSpec {
  width: number;
  height: number;
  content: string;
  image?: { data: Buffer; width: number; height: number };
}

/** Write a PDF of `pages`, with Helvetica as /F1 */
function buildPdf(filename: string, pages: PdfPageSpec[]): string {
  // 1: catalog, 2: page tree, 3: font, then each page, its content and its image
  const objects: Buffer[] = [Buffer.alloc(0), Buffer.alloc(0)];
  // WinAnsi, so "³" and "µ" print as themselves
  objects.push(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', 'latin1'));
  const pageIds: number[] = [];
  for (const { width, height, content, image } of pages) {
    const pageId = objects.length + 1;
    const imageId = pageId + 2;
    pageIds.push(pageId);
    const xObject = image ? ` /XObject << /Im1 ${imageId} 0 R >>` : '';
    objects.push(
      Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents ${pageId + 1} 0 R /Resources << /Font << /F1 3 0 R >>${xObject} >> >>`,
        'latin1'
      )
    );
    objects.push(streamObject('', Buffer.from(content, 'latin1')));
    if (image) {
      objects.push(
        streamObject(
          `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,
          image.data
        )
      );
    }
  }
  objects[0] = Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1');
  objects[1] = Buffer.from(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    'latin1'
  );
  return writeTempFile(filename, assemblePdf(objects));
}

/** A letter-size page of lines of text */
function textPage(lines: string[]): PdfPageSpec {
  const content = ['BT', '/F1 12 Tf', '14 TL', '50 750 Td', ...lines.map((l) => `(${l}) '`), 'ET'];
  return { width: 612, height: 792, content: content.join('\n') };
}

/** A page that is only a scan: an image of the lines, the page its size */
async function scannedPage(page: Page, lines: string[], options: { sideways?: boolean } = {}): Promise<PdfPageSpec> {
  const image = await renderTextImage(page, lines, 'image/jpeg', options);
  const { width, height } = image;
  return { width, height, content: `q ${width} 0 0 ${height} 0 0 cm /Im1 Do Q`, image };
}

/**
 * Create a text PDF with one page per entry of `pages` (each a list of lines).
 * A page with no lines is blank: a valid document with no readable text.
 */
export function createTextPdf(filename: string, pages: string[][]): string {
  return buildPdf(filename, pages.map(textPage));
}

/** A piece of text placed on the page: at (x, y) from the bottom left, in points */
export interface PlacedText {
  text: string;
  x: number;
  y: number;
  /** Font size, 12 by default */
  size?: number;
  /** Printed upwards along the page, as a note in a margin */
  sideways?: boolean;
}

/**
 * Create a one-page text PDF that stores its pieces of text in the order
 * given, wherever each is placed, as a PDF made from a table often does
 */
export function createPlacedTextPdf(filename: string, pieces: PlacedText[]): string {
  const content = pieces.map(({ text, x, y, size = 12, sideways }) => {
    const matrix = sideways ? [0, 1, -1, 0, x, y] : [1, 0, 0, 1, x, y];
    return `BT /F1 ${size} Tf ${matrix.join(' ')} Tm (${text}) Tj ET`;
  });
  return buildPdf(filename, [{ width: 612, height: 792, content: content.join('\n') }]);
}

/**
 * Render lines of text to an image in the browser, as a photo or scan of a
 * printed report would look. Returns the encoded image bytes.
 */
export async function renderTextImage(
  page: Page,
  lines: string[],
  mimeType: 'image/png' | 'image/jpeg',
  { sideways = false }: { sideways?: boolean } = {}
): Promise<{ data: Buffer; width: number; height: number }> {
  const result = await page.evaluate(
    ({ lines, mimeType, sideways }) => {
      const width = 1400;
      const height = 120 + lines.length * 70;
      const canvas = document.createElement('canvas');
      // Sideways: the report turned a quarter clockwise, as a page fed into a scanner the wrong way
      canvas.width = sideways ? height : width;
      canvas.height = sideways ? width : height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (sideways) {
        ctx.translate(height, 0);
        ctx.rotate(Math.PI / 2);
      }
      ctx.fillStyle = '#000000';
      ctx.font = '40px Arial, Helvetica, sans-serif';
      lines.forEach((line, i) => ctx.fillText(line, 60, 100 + i * 70));
      return {
        dataUrl: canvas.toDataURL(mimeType, 0.95),
        width: canvas.width,
        height: canvas.height,
      };
    },
    { lines, mimeType, sideways }
  );

  return {
    data: Buffer.from(result.dataUrl.split(',')[1], 'base64'),
    width: result.width,
    height: result.height,
  };
}

/**
 * Create a photo-like image of a lab report
 */
export async function createTextImage(
  page: Page,
  filename: string,
  lines: string[] = LAB_REPORT_LINES
): Promise<string> {
  const mimeType = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const image = await renderTextImage(page, lines, mimeType);
  return writeTempFile(filename, image.data);
}

/**
 * Create a scanned PDF: a single page that is just an image of the report,
 * with no embedded text
 */
export async function createScannedPdf(
  page: Page,
  filename: string,
  lines: string[] = LAB_REPORT_LINES,
  options: { sideways?: boolean } = {}
): Promise<string> {
  return buildPdf(filename, [await scannedPage(page, lines, options)]);
}

/** Create a PDF of a typed page, then a scanned one */
export async function createTypedAndScannedPdf(
  page: Page,
  filename: string,
  typedLines: string[],
  scannedLines: string[]
): Promise<string> {
  return buildPdf(filename, [textPage(typedLines), await scannedPage(page, scannedLines)]);
}

/**
 * Record every short text the page renders from now on, so transient
 * progress messages (which may be replaced within milliseconds) can be
 * asserted after the fact.
 */
export async function recordRenderedTexts(page: Page): Promise<void> {
  await page.evaluate(() => {
    const store = window as unknown as { __renderedTexts: string[] };
    store.__renderedTexts = [];
    const record = (text: string | null) => {
      const trimmed = text?.trim();
      if (trimmed && trimmed.length < 500) store.__renderedTexts.push(trimmed);
    };
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') record(mutation.target.textContent);
        mutation.addedNodes.forEach((node) => record(node.textContent));
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}

/**
 * Texts rendered since `recordRenderedTexts`
 */
export async function renderedTexts(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __renderedTexts?: string[] }).__renderedTexts ?? []
  );
}

/**
 * Then the processing stage "<stage>" was shown at some point
 */
export async function expectStageShown(page: Page, stage: string | RegExp): Promise<void> {
  await expect
    .poll(async () => (await renderedTexts(page)).some((t) =>
      typeof stage === 'string' ? t === stage : stage.test(t)
    ), { message: `processing stage ${String(stage)} was shown` })
    .toBe(true);
}
