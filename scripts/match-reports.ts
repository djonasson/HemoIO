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
 * With MATCH_ROWS instead, the values are read from a JSON file of printed
 * values ({ name, unit, specimenHint?, group? }, the group naming where each
 * came from), such as rows parsed from labs' public test guides. The file must
 * be outside the repository. Counts are then given per group too, and with
 * MATCH_ROWS_OUT set every value's result, with the LOINC test taken, is
 * written there as JSON (also outside the repository) for checking by hand.
 *
 * Output goes only to the terminal: never paste it into the repository.
 */
import { request } from 'node:http';
import { closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readlinkSync, realpathSync, writeSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { it } from 'vitest';
import { loadCatalog } from '@data/loinc/catalog';
import { matchLocally, type LocalMatch, type PrintedValue } from '@services/analysis/loincMatch';
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
    writeOutside(cacheFile, JSON.stringify(values, null, 2));
  }
  return values;
}

/** A path with its symbolic links resolved, as far as it exists yet: a link to nothing yet, to where it points */
function realPath(path: string, links = 0): string {
  if (existsSync(path)) return realpathSync(path);
  const link = lstatSync(path, { throwIfNoEntry: false });
  if (link?.isSymbolicLink()) {
    if (links > 40) throw new Error(`Too many symbolic links at ${path}`);
    return realPath(resolve(dirname(path), readlinkSync(path)), links + 1);
  }
  const parent = dirname(path);
  return parent === path ? path : join(realPath(parent), basename(path));
}

/**
 * Writes a file, which must lie outside the repository: checked for the
 * file itself, and opened without following a link put there since
 */
function writeOutside(path: string, text: string): void {
  if (isInside(realPath(path), realpathSync(REPOSITORY))) throw new Error(`${basename(path)} must be written outside the repository`);
  const file = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
  try {
    writeSync(file, text);
  } finally {
    closeSync(file);
  }
}

/** Whether a path is the folder or within it */
function isInside(path: string, folder: string): boolean {
  const rel = relative(folder, path);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** A path from the environment, which must lie outside the repository */
function outsideRepository(variable: string): string | undefined {
  const path = process.env[variable] && resolve(process.env[variable]);
  if (path && isInside(realPath(path), realpathSync(REPOSITORY))) throw new Error(`${variable} must be outside the repository`);
  return path;
}

/** A printed value, with the report or guide it came from */
interface SourcedValue extends PrintedValue {
  group: string;
}

/**
 * A MATCH_ROWS row as a printed value, with only its name, unit, specimen
 * hint and group: anything else a row holds (a value, a range) is never
 * read, so never written to the results file
 */
function rowValue(row: unknown, index: number, file: string): SourcedValue {
  const { name, unit, specimenHint, group } = (row ?? {}) as Record<string, unknown>;
  const isText = (field: unknown): field is string => typeof field === 'string';
  if (!isText(name) || !isText(unit)) throw new Error(`MATCH_ROWS row ${index} needs a name and a unit`);
  return {
    name,
    unit,
    ...(isText(specimenHint) && { specimenHint }),
    group: isText(group) ? group : file,
  };
}

/** The values to match: the MATCH_ROWS file's, else those of the MATCH_REPORTS PDFs */
async function valuesToMatch(): Promise<SourcedValue[]> {
  const rows = outsideRepository('MATCH_ROWS');
  if (rows) return (JSON.parse(readFileSync(rows, 'utf8')) as unknown[]).map((row, i) => rowValue(row, i, basename(rows)));
  const pdfs = (process.env.MATCH_REPORTS ?? '').split(',').filter(Boolean);
  if (pdfs.length === 0) throw new Error('Set MATCH_REPORTS to a comma-separated list of PDFs, or MATCH_ROWS to a JSON file');
  const cacheDir = outsideRepository('MATCH_REPORTS_CACHE');
  const values: SourcedValue[] = [];
  for (const pdf of pdfs) {
    for (const value of await printedValues(pdf, cacheDir)) values.push({ ...value, group: basename(pdf) });
  }
  return values;
}

it('matches the printed values of real reports locally', async () => {
  const resultsFile = outsideRepository('MATCH_ROWS_OUT');
  const catalog = await loadCatalog();
  const zero = (): Record<LocalMatch['status'], number> => ({ match: 0, ambiguous: 0, none: 0 });
  const counts = new Map<string, Record<LocalMatch['status'], number>>();
  const total = zero();
  const lines: string[] = [];
  const results: unknown[] = [];
  let group: string | undefined;
  for (const value of await valuesToMatch()) {
    if (value.group !== group) lines.push(`== ${(group = value.group)}`);
    const match = matchLocally(catalog, value);
    const count = counts.get(value.group) ?? zero();
    count[match.status]++;
    total[match.status]++;
    counts.set(value.group, count);
    const top = match.candidates
      .slice(0, 3)
      .map(({ code, name, score }) => `${code} ${name} (${score.toFixed(2)})`)
      .join(' | ');
    const code = match.status === 'match' ? ` ${match.code}` : '';
    lines.push(`${value.name} [${value.unit}] ${match.status}${code} :: ${top}`);
    const taken = match.status === 'match' ? catalog.test(match.code) : undefined;
    results.push({
      ...value,
      status: match.status,
      ...(taken && { code: taken.code, loincName: taken.name, property: taken.property, system: taken.system }),
      candidates: match.candidates.map(({ code, name, score }) => ({ code, name, score })),
    });
  }
  for (const [name, count] of counts) {
    lines.push(`${name}: match ${count.match}, ambiguous ${count.ambiguous}, none ${count.none}`);
  }
  lines.push(`match ${total.match}, ambiguous ${total.ambiguous}, none ${total.none}`);
  process.stdout.write(`${lines.join('\n')}\n`);
  if (resultsFile) writeOutside(resultsFile, JSON.stringify(results, null, 1));
});
