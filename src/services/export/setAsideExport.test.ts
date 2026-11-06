/**
 * Tests for the sealed file of records HemoIO cannot open
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadJson } from './jsonExport';
import { buildSetAsideFile, saveSealedFile, setAsideFileName, SET_ASIDE_FILE_FORMAT } from './setAsideExport';
import type { SetAsideRow } from '@data/db';

vi.mock('./jsonExport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./jsonExport')>()),
  downloadJson: vi.fn(),
}));

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

  it('file name uses the local date and time, so two saves in a day do not share a name', () => {
    // Late in the evening, local time: the UTC date may already be the next day
    const savedAt = new Date(2026, 0, 5, 23, 59);

    expect(setAsideFileName(savedAt)).toBe('hemoio-unreadable-records-2026-01-05-2359.json');
    expect(setAsideFileName(new Date(2026, 0, 5, 7, 4))).toBe('hemoio-unreadable-records-2026-01-05-0704.json');
  });

  describe('saveSealedFile', () => {
    afterEach(() => {
      vi.clearAllMocks();
      // jsdom has no save picker; the tests that need one add it
      delete (window as Partial<Window>).showSaveFilePicker;
    });

    it('writes the file through the save picker where there is one', async () => {
      const written: string[] = [];
      const writable = {
        write: vi.fn(async (data: string) => void written.push(data)),
        close: vi.fn(async () => undefined),
      };
      const picker = vi.fn(async () => ({ createWritable: async () => writable }));
      window.showSaveFilePicker = picker as unknown as Window['showSaveFilePicker'];

      expect(await saveSealedFile('hemoio-unreadable-records-2026-11-06.json', '{"sealed":true}')).toBe('written');

      expect(picker).toHaveBeenCalledWith(
        expect.objectContaining({ suggestedName: 'hemoio-unreadable-records-2026-11-06.json' })
      );
      expect(written).toEqual(['{"sealed":true}']);
      expect(writable.close).toHaveBeenCalled();
      expect(downloadJson).not.toHaveBeenCalled();
    });

    it('says when the save picker was cancelled', async () => {
      window.showSaveFilePicker = vi.fn(async () => {
        throw new DOMException('The user aborted a request.', 'AbortError');
      }) as unknown as Window['showSaveFilePicker'];

      expect(await saveSealedFile('f.json', '{}')).toBe('cancelled');
      expect(downloadJson).not.toHaveBeenCalled();
    });

    it('downloads the file where there is no save picker', async () => {
      expect(await saveSealedFile('f.json', '{}')).toBe('downloaded');
      expect(downloadJson).toHaveBeenCalledWith('{}', 'f.json');
    });

    it('downloads the file when the save picker refuses for lack of a recent click', async () => {
      window.showSaveFilePicker = vi.fn(async () => {
        throw new DOMException('Must be handling a user gesture.', 'SecurityError');
      }) as unknown as Window['showSaveFilePicker'];

      expect(await saveSealedFile('f.json', '{}')).toBe('downloaded');
      expect(downloadJson).toHaveBeenCalledWith('{}', 'f.json');
    });

    it('aborts a failed write, so no empty or partial file is left', async () => {
      const writable = {
        write: vi.fn(async () => {
          throw new DOMException('Disk full', 'QuotaExceededError');
        }),
        close: vi.fn(async () => undefined),
        abort: vi.fn(async () => undefined),
      };
      window.showSaveFilePicker = vi.fn(async () => ({
        createWritable: async () => writable,
      })) as unknown as Window['showSaveFilePicker'];

      await expect(saveSealedFile('f.json', '{}')).rejects.toThrow('Disk full');
      expect(writable.abort).toHaveBeenCalled();
      expect(writable.close).not.toHaveBeenCalled();
    });

  });
});
