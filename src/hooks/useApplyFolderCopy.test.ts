import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { notifications } from '@mantine/notifications';
import { announceDataReplaced } from '@data/db/dataReplacedEvents';
import { restoreBackup, restoreBackupIfUnchanged, type ParsedBackupData } from '@services/import';
import { useApplyFolderCopy } from './useApplyFolderCopy';

const DB = {};
const afterRestore = vi.fn();

vi.mock('./useEncryptedDb', () => ({ useEncryptedDb: () => ({ db: DB, isReady: true }) }));
vi.mock('./useAfterRestore', () => ({ useAfterRestore: () => afterRestore }));
vi.mock('@data/db/dataReplacedEvents', () => ({ announceDataReplaced: vi.fn() }));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));
vi.mock('@services/import', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@services/import')>()),
  restoreBackup: vi.fn(),
  restoreBackupIfUnchanged: vi.fn(),
}));

const COPY = { labResults: [], testValues: [], userNotes: [] } as unknown as ParsedBackupData;

describe('useApplyFolderCopy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterRestore.mockResolvedValue({ steps: [], failed: [] });
  });

  it('loads the copy, tells the other tabs, then reloads what this tab shows', async () => {
    const { result } = renderHook(() => useApplyFolderCopy());

    expect(await result.current(COPY)).toBe(true);

    expect(restoreBackup).toHaveBeenCalledWith(DB, COPY);
    expect(announceDataReplaced).toHaveBeenCalled();
    expect(afterRestore).toHaveBeenCalledWith('showing the updated results');
    expect(notifications.show).not.toHaveBeenCalled();
  });

  it('given a stamp, loads nothing when the data changed meanwhile', async () => {
    vi.mocked(restoreBackupIfUnchanged).mockResolvedValue(null);
    const { result } = renderHook(() => useApplyFolderCopy());

    expect(await result.current(COPY, 'stamp')).toBe(false);

    expect(restoreBackupIfUnchanged).toHaveBeenCalledWith(DB, COPY, 'stamp');
    expect(announceDataReplaced).not.toHaveBeenCalled();
    expect(afterRestore).not.toHaveBeenCalled();
  });

  it('says which reload failed, the copy loaded all the same', async () => {
    const steps = [{ name: 'loading your preferences', run: vi.fn() }];
    afterRestore.mockResolvedValue({ steps, failed: ['loading your preferences'] });
    const { result } = renderHook(() => useApplyFolderCopy());

    expect(await result.current(COPY)).toBe(true);

    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Updated From the Folder, With Problems',
        message: expect.stringContaining('Failed: loading your preferences.'),
      })
    );
  });
});
