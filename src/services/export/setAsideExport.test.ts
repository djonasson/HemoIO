/**
 * Tests for the sealed file of records HemoIO cannot open
 */

import { describe, it, expect } from 'vitest';
import { buildSetAsideFile, setAsideFileName, SET_ASIDE_FILE_FORMAT } from './setAsideExport';
import type { SetAsideRow } from '@data/db';

describe('setAsideExport', () => {
  it('the file holds the rows as stored and no plaintext', () => {
    const rows: SetAsideRow[] = [
      { id: 7, table: 'labResults', row: { id: 1000, encrypted: 'c2VhbGVkLTE=' }, savedToFile: 0 },
      {
        id: 8,
        table: 'testValues',
        row: { id: 1001, labResultId: 1000, encrypted: 'c2VhbGVkLTI=' },
        savedToFile: 1,
      },
    ];
    const savedAt = new Date('2026-11-06T09:30:00.000Z');

    const file = JSON.parse(buildSetAsideFile(rows, savedAt));

    expect(file).toEqual({
      format: SET_ASIDE_FILE_FORMAT,
      version: 1,
      savedAt: '2026-11-06T09:30:00.000Z',
      records: [
        { table: 'labResults', row: { id: 1000, encrypted: 'c2VhbGVkLTE=' } },
        { table: 'testValues', row: { id: 1001, labResultId: 1000, encrypted: 'c2VhbGVkLTI=' } },
      ],
    });
  });

  it('file name uses the local date', () => {
    // Late in the evening, local time: the UTC date may already be the next day
    const savedAt = new Date(2026, 0, 5, 23, 59);

    expect(setAsideFileName(savedAt)).toBe('hemoio-unreadable-records-2026-01-05.json');
  });
});
