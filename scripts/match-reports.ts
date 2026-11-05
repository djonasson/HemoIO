/**
 * Tuning runner for the local LOINC match (src/services/analysis/loincMatch.ts)
 * on real lab reports. For each value a report prints it shows the printed
 * name, the unit, the local status and the top three candidates, then the
 * counts of match, ambiguous and none. It never shows a value, a range or
 * anything else a report says about the patient.
 *
 *   MATCH_REPORTS=test-data/a.pdf,test-data/b.pdf \
 *   MATCH_REPORTS_CACHE=/path/outside/the/repo \
 *   npx vitest run --config vitest.match-reports.config.ts
 *
 * Each PDF's text is read with the app's PDF code (text PDFs only: OCR runs
 * in the browser) and its values extracted
 * by the local Ollama (OLLAMA_MODEL, else the provider's own choice). With
 * MATCH_REPORTS_CACHE set, the names, units and samples extracted (no
 * values) are kept there as JSON and read back on the next run, so tuning
 * needs Ollama once; the directory must be outside the repository.
 *
 * Output goes only to the terminal: never paste it into the repository.
 */
import { request } from 'node:http';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { it } from 'vitest';
import { loadCatalog } from '@data/loinc/catalog';
import { matchLocally, type PrintedValue } from '@services/analysis/loincMatch';
import { OllamaProvider } from '@services/ai/OllamaProvider';
import { extractTextFromPDF } from '@services/ocr/pdfExtractor';

const REPOSITORY = resolve(__dirname, '..');

/**
 * fetch over node:http: Node's fetch gives up waiting for an answer after
 * five minutes, and a large local model can think for longer
 */
function fetchWithoutHeadersTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  return new Promise((done, fail) => {
    const sent = request(url, { method: init.method ?? 'GET', headers: init.headers as Record<string, string> }, (answer) => {
      const chunks: Buffer[] = [];
      answer.on('data', (chunk: Buffer) => chunks.push(chunk));
      answer.on('end', () => done(new Response(Buffer.concat(chunks), { status: answer.statusCode })));
      answer.on('error', fail);
    });
    sent.on('error', fail);
    init.signal?.addEventListener('abort', () => sent.destroy(new Error('aborted')));
    sent.end(init.body as string | undefined);
  });
}

/** The printed names, units and samples of a report's values, with no values */
async function printedValues(pdf: string, cacheDir: string | undefined): Promise<PrintedValue[]> {
  const cacheFile = cacheDir && join(cacheDir, `${basename(pdf)}.names.json`);
  if (cacheFile && existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, 'utf8')) as PrintedValue[];

  // PDF.js runs its worker in this thread when it finds it here (Node has no workers for it)
  Object.assign(globalThis, { pdfjsWorker: await import('pdfjs-dist/legacy/build/pdf.worker.mjs') });
  const bytes = readFileSync(pdf);
  const { fullText, isScanned } = await extractTextFromPDF(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)
  );
  // OCR needs the browser's worker files: a scanned report is read in the app
  if (isScanned) throw new Error(`${basename(pdf)} is a scanned PDF; the runner reads text PDFs only`);
  globalThis.fetch = ((input: string | URL, init?: RequestInit) =>
    fetchWithoutHeadersTimeout(String(input), init)) as typeof fetch;
  const provider = new OllamaProvider({ model: process.env.OLLAMA_MODEL, timeout: 3_600_000 });
  const { biomarkers } = await provider.analyzeLabReport(fullText, { language: 'it' });
  const values = biomarkers.map(({ name, unit, specimenHint }) => ({
    name,
    unit: unit ?? '',
    ...(specimenHint && { specimenHint }),
  }));
  if (cacheFile) {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(values, null, 2));
  }
  return values;
}

/** A path with its symbolic links resolved, as far as it exists yet */
function realPath(path: string): string {
  if (existsSync(path)) return realpathSync(path);
  const parent = dirname(path);
  return parent === path ? path : join(realPath(parent), basename(path));
}

/** Whether a path is the folder or within it */
function isInside(path: string, folder: string): boolean {
  const rel = relative(folder, path);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

it('matches the printed values of real reports locally', async () => {
  const pdfs = (process.env.MATCH_REPORTS ?? '').split(',').filter(Boolean);
  if (pdfs.length === 0) throw new Error('Set MATCH_REPORTS to a comma-separated list of PDFs');
  const cacheDir = process.env.MATCH_REPORTS_CACHE && resolve(process.env.MATCH_REPORTS_CACHE);
  if (cacheDir && isInside(realPath(cacheDir), realpathSync(REPOSITORY))) {
    throw new Error('MATCH_REPORTS_CACHE must be outside the repository');
  }

  const catalog = await loadCatalog();
  const counts = { match: 0, ambiguous: 0, none: 0 };
  const lines: string[] = [];
  for (const pdf of pdfs) {
    lines.push(`== ${basename(pdf)}`);
    for (const value of await printedValues(pdf, cacheDir)) {
      const match = matchLocally(catalog, value);
      counts[match.status]++;
      const top = match.candidates
        .slice(0, 3)
        .map(({ code, name, score }) => `${code} ${name} (${score.toFixed(2)})`)
        .join(' | ');
      const code = match.status === 'match' ? ` ${match.code}` : '';
      lines.push(`${value.name} [${value.unit}] ${match.status}${code} :: ${top}`);
    }
  }
  lines.push(`match ${counts.match}, ambiguous ${counts.ambiguous}, none ${counts.none}`);
  process.stdout.write(`${lines.join('\n')}\n`);
});
