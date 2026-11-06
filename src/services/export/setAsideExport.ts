/**
 * The sealed file of records HemoIO cannot open
 *
 * The rows go in exactly as stored: their readable IDs and links, and their
 * ciphertext. Nothing is decrypted, so the file says no more than the
 * browser's storage does, and it is not a backup: a restore refuses it.
 */

import type { SetAsideRow } from '@data/db';

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
