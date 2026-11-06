/**
 * Tests for useSetAsideRecords
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { notifications } from '@mantine/notifications';
import { notifySetAsideChanged } from '@data/db/setAsideEvents';
import { downloadJson } from '@services/export';
import { useSetAsideRecords } from './useSetAsideRecords';
import type { SetAsideRow } from '@data/db';

vi.mock('@mantine/notifications', () => ({
  notifications: { show: vi.fn(), hide: vi.fn() },
}));

vi.mock('@services/export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@services/export')>()),
  downloadJson: vi.fn(),
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
  });

  it('refreshes when set-aside rows change', async () => {
    mockDb.countSetAside.mockResolvedValueOnce({ total: 3, unsaved: 3 });
    const { result } = renderHook(() => useSetAsideRecords());
    await waitFor(() => expect(result.current.summary).toEqual({ total: 3, unsaved: 3 }));

    mockDb.countSetAside.mockResolvedValueOnce({ total: 3, unsaved: 0 });
    act(() => notifySetAsideChanged());

    await waitFor(() => expect(result.current.summary).toEqual({ total: 3, unsaved: 0 }));
  });

  it('download marks the rows saved', async () => {
    const rows: SetAsideRow[] = [
      { id: 4, table: 'labResults', row: { id: 1000, encrypted: 'x' }, savedToFile: 0 },
      { id: 5, table: 'testValues', row: { id: 1000, labResultId: 1000, encrypted: 'y' }, savedToFile: 0 },
    ];
    mockDb.exportSetAside.mockResolvedValue(rows);
    const { result } = renderHook(() => useSetAsideRecords());

    await act(() => result.current.download());

    expect(downloadJson).toHaveBeenCalledTimes(1);
    const [content, fileName] = vi.mocked(downloadJson).mock.calls[0];
    expect(JSON.parse(content).records).toHaveLength(2);
    expect(fileName).toMatch(/^hemoio-unreadable-records-\d{4}-\d{2}-\d{2}\.json$/);
    expect(mockDb.markSetAsideSaved).toHaveBeenCalledWith([4, 5]);
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
      })
    );
    await waitFor(() => expect(mockDb.countSetAside).toHaveBeenCalledTimes(4));
  });
});
