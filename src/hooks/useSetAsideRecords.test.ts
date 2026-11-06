/**
 * Tests for useSetAsideRecords
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { notifications } from '@mantine/notifications';
import { notifySetAsideChanged } from '@data/db/setAsideEvents';
import { saveSealedFile } from '@services/export';
import { useSetAsideRecords } from './useSetAsideRecords';
import type { SetAsideRow } from '@data/db';

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn(), hide: vi.fn() },
}));

vi.mock('@services/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@services/export')>()),
  saveSealedFile: vi.fn(),
}));

const session = vi.hoisted(() => ({
  isReady: true,
  key: {} as CryptoKey,
}));

const mockDb = {
  countSetAside: vi.fn(),
  exportSetAside: vi.fn(),
  markSetAsideSaved: vi.fn(),
  deleteSetAside: vi.fn(),
  setAsideIds: vi.fn(),
};

vi.mock('@contexts/useAuth', () => ({
  useAuth: () => ({ encryptionKey: session.isReady ? session.key : null }),
}));

vi.mock('./useEncryptedDb', () => ({
  useEncryptedDb: () => ({ db: session.isReady ? mockDb : null, isReady: session.isReady }),
}));

describe('useSetAsideRecords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.isReady = true;
    // A new session for each test
    session.key = {} as CryptoKey;
    mockDb.countSetAside.mockResolvedValue({ total: 0, unsaved: 0 });
    mockDb.markSetAsideSaved.mockResolvedValue(undefined);
    mockDb.deleteSetAside.mockResolvedValue(0);
    // As the save picker does: the content is gathered once a file was chosen
    vi.mocked(saveSealedFile).mockImplementation(async (_fileName, content) =>
      (await content()) === null ? 'nothing' : 'written'
    );
  });

  it('refreshes when set-aside rows change', async () => {
    mockDb.countSetAside.mockResolvedValueOnce({ total: 3, unsaved: 3 });
    const { result } = renderHook(() => useSetAsideRecords());
    await waitFor(() => expect(result.current.summary).toEqual({ total: 3, unsaved: 3 }));

    mockDb.countSetAside.mockResolvedValueOnce({ total: 3, unsaved: 0 });
    act(() => notifySetAsideChanged());

    await waitFor(() => expect(result.current.summary).toEqual({ total: 3, unsaved: 0 }));
  });

  const rows: SetAsideRow[] = [
    { id: 4, table: 'labResults', row: { id: 1000, encrypted: 'x' }, savedToFile: 0 },
    { id: 5, table: 'testValues', row: { id: 1000, labResultId: 1000, encrypted: 'y' }, savedToFile: 0 },
  ];

  it('download marks the rows saved once the save picker wrote the file', async () => {
    mockDb.exportSetAside.mockResolvedValue(rows);
    const { result } = renderHook(() => useSetAsideRecords());

    expect(await act(() => result.current.download())).toEqual({ outcome: 'saved' });

    const [fileName, content] = vi.mocked(saveSealedFile).mock.calls[0];
    expect(JSON.parse((await content())!).records).toHaveLength(2);
    expect(fileName).toMatch(/^hemoio-unreadable-records-\d{4}-\d{2}-\d{2}\.json$/);
    expect(mockDb.markSetAsideSaved).toHaveBeenCalledWith([4, 5]);
  });

  it('says when the file was written but its rows could not be marked saved', async () => {
    mockDb.exportSetAside.mockResolvedValue(rows);
    mockDb.markSetAsideSaved.mockRejectedValue(new Error('write failed'));
    const { result } = renderHook(() => useSetAsideRecords());

    expect(await act(() => result.current.download())).toEqual({ outcome: 'unrecorded' });
  });

  it('saves nothing when no rows are set aside by the time the file is chosen', async () => {
    mockDb.exportSetAside.mockResolvedValue([]);
    const { result } = renderHook(() => useSetAsideRecords());

    expect(await act(() => result.current.download())).toEqual({ outcome: 'nothing' });
    expect(mockDb.markSetAsideSaved).not.toHaveBeenCalled();
  });

  it('a cancelled save picker leaves the rows unsaved', async () => {
    mockDb.exportSetAside.mockResolvedValue(rows);
    vi.mocked(saveSealedFile).mockResolvedValue('cancelled');
    const { result } = renderHook(() => useSetAsideRecords());

    expect(await act(() => result.current.download())).toEqual({ outcome: 'cancelled' });
    expect(mockDb.markSetAsideSaved).not.toHaveBeenCalled();
  });

  it('a plain download marks the rows saved only once I confirm', async () => {
    mockDb.exportSetAside.mockResolvedValue(rows);
    vi.mocked(saveSealedFile).mockImplementation(async (_fileName, content) => {
      await content();
      return 'downloaded';
    });
    const { result } = renderHook(() => useSetAsideRecords());

    expect(await act(() => result.current.download())).toEqual({ outcome: 'unconfirmed', ids: [4, 5] });
    expect(mockDb.markSetAsideSaved).not.toHaveBeenCalled();

    await act(() => result.current.confirmSaved([4, 5]));
    expect(mockDb.markSetAsideSaved).toHaveBeenCalledWith([4, 5]);
  });

  it('deletes only the rows of the snapshot', async () => {
    mockDb.setAsideIds.mockResolvedValue([4, 5]);
    const { result } = renderHook(() => useSetAsideRecords());

    const ids = await act(() => result.current.snapshot());
    await act(() => result.current.remove(ids));

    expect(mockDb.deleteSetAside).toHaveBeenCalledWith([4, 5]);
  });

  it('counts once for every hook of the session', async () => {
    renderHook(() => {
      useSetAsideRecords();
      useSetAsideRecords();
      return useSetAsideRecords();
    });
    await waitFor(() => expect(mockDb.countSetAside).toHaveBeenCalledTimes(1));

    act(() => notifySetAsideChanged());

    await waitFor(() => expect(mockDb.countSetAside).toHaveBeenCalledTimes(2));
    // Give any other count a chance to start
    await act(() => Promise.resolve());
    expect(mockDb.countSetAside).toHaveBeenCalledTimes(2);
  });

  it('summary is empty while locked', () => {
    session.isReady = false;

    const { result } = renderHook(() => useSetAsideRecords());

    expect(result.current.summary).toEqual({ total: 0, unsaved: 0 });
    expect(mockDb.countSetAside).not.toHaveBeenCalled();
  });

  it('tells once per session when preferences were moved aside', async () => {
    renderHook(() => useSetAsideRecords());
    await waitFor(() => expect(mockDb.countSetAside).toHaveBeenCalled());

    // Other tables moved aside say nothing
    act(() => notifySetAsideChanged({ movedAside: ['labResults'] }));
    expect(notifications.show).not.toHaveBeenCalled();

    act(() => notifySetAsideChanged({ movedAside: ['userPreferences'] }));
    act(() => notifySetAsideChanged({ movedAside: ['userPreferences'] }));

    expect(notifications.show).toHaveBeenCalledTimes(1);
    expect(notifications.show).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Earlier preferences kept aside',
        message:
          "Your saved preferences couldn't be opened, so HemoIO kept them aside and saved your change.",
        // Told once: it stays until dismissed
        autoClose: false,
      })
    );
    // One count to start, and one for each change
    await waitFor(() => expect(mockDb.countSetAside).toHaveBeenCalledTimes(4));
  });
});
