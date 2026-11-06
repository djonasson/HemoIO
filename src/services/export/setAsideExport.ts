/**
 * The sealed file of records HemoIO cannot open
 *
 * The rows go in exactly as stored: their readable IDs and links, and their
 * ciphertext. Nothing is decrypted, so the file says no more than the
 * browser's storage does, and it is not a backup: a restore refuses it.
 */

import { downloadJson } from './jsonExport';
import type { SetAsideRow } from '@data/db';

/**
 * The file's format name. Each record is `{ table, row }`: `table` is the
 * store the row came from, and `row` is the row exactly as IndexedDB held it.
 * Only its IDs and links are readable (`id`; `labResultId` for test values;
 * `labResultId` and `testValueId` for notes). `row.encrypted` is base64 of a
 * 12-byte AES-GCM IV followed by the ciphertext, sealed with the data key of
 * the setup that saved the row: a random key the password only wraps. The
 * file carries no lock, so the old password alone does not open it; that
 * setup's lock (its wrapped key) is needed too. It decrypts to UTF-8 JSON of
 * the record's other fields, padded with trailing spaces to a multiple of 256
 * bytes, with dates as `{ "$date": milliseconds | null }` and NaN or
 * ±Infinity as `{ "$number": "NaN" }`.
 */
export const SET_ASIDE_FILE_FORMAT = 'hemoio-unreadable-records';

const SET_ASIDE_FILE_VERSION = 1;

/** The file's JSON: each row with the table it was stored in */
export function buildSetAsideFile(rows: SetAsideRow[], savedAt: Date): string {
  return JSON.stringify(
    {
      format: SET_ASIDE_FILE_FORMAT,
      version: SET_ASIDE_FILE_VERSION,
      savedAt: savedAt.toISOString(),
      records: rows.map(({ table, row }) => ({ table, row })),
    },
    null,
    2
  );
}

/** 'hemoio-unreadable-records-YYYY-MM-DD.json', the day as the user sees it */
export function setAsideFileName(savedAt: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const day = `${savedAt.getFullYear()}-${pad(savedAt.getMonth() + 1)}-${pad(savedAt.getDate())}`;
  return `${SET_ASIDE_FILE_FORMAT}-${day}.json`;
}

/**
 * How saving the file went: written through the save picker, cancelled in
 * it, handed to the browser as a download, which says nothing of whether
 * the file was kept, or nothing to save once the content was gathered
 */
export type SealedFileSave = 'written' | 'cancelled' | 'downloaded' | 'nothing';

/**
 * Save the sealed file, through the save picker where the browser has one.
 *
 * The picker opens first and the content is gathered after: gathering can
 * take long enough for the click's user activation to expire, and the picker
 * needs it. Should the picker still refuse for that reason (SecurityError),
 * the file is downloaded instead. A write that fails is aborted, so no empty
 * or partial file is left where the user chose.
 *
 * @param content - The file's content, or null when there is nothing to save
 */
export async function saveSealedFile(
  fileName: string,
  content: () => Promise<string | null>
): Promise<SealedFileSave> {
  const download = async (): Promise<SealedFileSave> => {
    const text = await content();
    if (text === null) return 'nothing';
    downloadJson(text, fileName);
    return 'downloaded';
  };
  if (typeof window.showSaveFilePicker !== 'function') return download();
  let handle: FileSystemFileHandle;
  try {
    handle = await window.showSaveFilePicker({
      suggestedName: fileName,
      types: [{ description: 'HemoIO sealed records', accept: { 'application/json': ['.json'] } }],
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    if (err instanceof DOMException && err.name === 'SecurityError') return download();
    throw err;
  }
  const text = await content();
  if (text === null) return 'nothing';
  const writable = await handle.createWritable();
  try {
    await writable.write(text);
    await writable.close();
  } catch (err) {
    // Fails too if the stream is already closed; the write's error is the one to report
    await writable.abort().catch(() => undefined);
    throw err;
  }
  return 'written';
}
