import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AlertStateProvider } from './AlertStateContext';
import { useAlertState } from '@hooks/useAlertState';
import type { UserPreferences } from '@/types';

type Stored = Omit<UserPreferences, 'id'>;

const basePrefs: Stored = {
  unitPreferences: {},
  personalTargets: {},
  theme: 'system',
  dateFormat: 'MM/DD/YYYY',
};

let stored: Stored | undefined;
const mockUpdatePreferences = vi.fn();
const mockDb = {
  getPreferences: vi.fn(async () => stored),
  updatePreferences: (...args: unknown[]) => mockUpdatePreferences(...args),
};
let session: { db: typeof mockDb | null; isReady: boolean } = { db: mockDb, isReady: true };
vi.mock('@hooks/useEncryptedDb', () => ({
  useEncryptedDb: () => session,
}));

/** Applies an update to the stored record, as EncryptedDb.updatePreferences does */
async function applyUpdate(update: (current: Stored | undefined) => Partial<Stored>) {
  stored = { ...basePrefs, ...stored, ...update(stored) };
}

describe('AlertStateProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stored = { ...basePrefs, acknowledgedAlerts: { glucose: '2024-03-10T10:00:00.000Z' } };
    mockUpdatePreferences.mockImplementation(applyUpdate);
    session = { db: mockDb, isReady: true };
  });

  it('reloads acknowledgements a restore replaced', async () => {
    const { result } = renderHook(() => useAlertState(), { wrapper: AlertStateProvider });
    await waitFor(() => expect(result.current.acknowledgedThrough.glucose).toBeDefined());

    stored = { ...basePrefs, acknowledgedAlerts: { hemoglobin: '2024-09-01T00:00:00.000Z' } };
    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.acknowledgedThrough).toEqual({
      hemoglobin: new Date('2024-09-01T00:00:00.000Z'),
    });
  });

  it('forgets acknowledgements held in memory when the app locks', async () => {
    const { result, rerender } = renderHook(() => useAlertState(), {
      wrapper: AlertStateProvider,
    });
    await waitFor(() => expect(result.current.acknowledgedThrough.glucose).toBeDefined());

    session = { db: null, isReady: false };
    rerender();

    expect(result.current.acknowledgedThrough).toEqual({});
  });

  it('never moves an acknowledgement back to an earlier date', async () => {
    const { result } = renderHook(() => useAlertState(), { wrapper: AlertStateProvider });
    await waitFor(() => expect(result.current.acknowledgedThrough.glucose).toBeDefined());

    await act(async () => {
      await result.current.acknowledge('glucose', new Date('2024-01-01T00:00:00.000Z'));
    });

    expect(result.current.acknowledgedThrough.glucose).toEqual(
      new Date('2024-03-10T10:00:00.000Z')
    );
    expect(stored?.acknowledgedAlerts?.glucose).toBe('2024-03-10T10:00:00.000Z');
  });

  it('loads persisted acknowledgements', async () => {
    const { result } = renderHook(() => useAlertState(), { wrapper: AlertStateProvider });
    await waitFor(() =>
      expect(result.current.acknowledgedThrough.glucose).toEqual(
        new Date('2024-03-10T10:00:00.000Z')
      )
    );
  });

  it('persists an acknowledgement and shares it with every consumer', async () => {
    const { result } = renderHook(
      () => ({ alertsView: useAlertState(), navBadge: useAlertState() }),
      { wrapper: AlertStateProvider }
    );
    await waitFor(() => expect(result.current.navBadge.acknowledgedThrough.glucose).toBeDefined());

    await act(async () => {
      await result.current.alertsView.acknowledge(
        'hemoglobin',
        new Date('2024-05-01T10:00:00.000Z')
      );
    });

    expect(result.current.navBadge.acknowledgedThrough.hemoglobin).toEqual(
      new Date('2024-05-01T10:00:00.000Z')
    );
    expect(stored?.acknowledgedAlerts).toEqual({
      glucose: '2024-03-10T10:00:00.000Z',
      hemoglobin: '2024-05-01T10:00:00.000Z',
    });
  });

  it('keeps dismissals in memory only, per test through a date', async () => {
    const { result } = renderHook(() => useAlertState(), { wrapper: AlertStateProvider });
    await waitFor(() => expect(result.current.acknowledgedThrough.glucose).toBeDefined());
    act(() => result.current.dismiss('glucose', new Date('2024-03-10T10:00:00Z')));
    expect(result.current.dismissedThrough.glucose).toEqual(new Date('2024-03-10T10:00:00Z'));
    expect(mockUpdatePreferences).not.toHaveBeenCalled();
  });

  it('never moves a dismissal back to an earlier date', async () => {
    const { result } = renderHook(() => useAlertState(), { wrapper: AlertStateProvider });
    await waitFor(() => expect(result.current.acknowledgedThrough.glucose).toBeDefined());
    act(() => result.current.dismiss('glucose', new Date('2024-03-10T10:00:00Z')));
    act(() => result.current.dismiss('glucose', new Date('2024-01-15T10:00:00Z')));
    expect(result.current.dismissedThrough.glucose).toEqual(new Date('2024-03-10T10:00:00Z'));
  });

  it('keeps both of two acknowledgements made in quick succession', async () => {
    stored = { ...basePrefs };
    mockUpdatePreferences.mockImplementation(
      async (update: (current: Stored | undefined) => Partial<Stored>) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        await applyUpdate(update);
      }
    );
    const { result } = renderHook(() => useAlertState(), { wrapper: AlertStateProvider });
    await waitFor(() => expect(mockDb.getPreferences).toHaveBeenCalled());

    await act(async () => {
      await Promise.all([
        result.current.acknowledge('glucose', new Date('2024-03-10T10:00:00.000Z')),
        result.current.acknowledge('hemoglobin', new Date('2024-04-10T10:00:00.000Z')),
      ]);
    });

    expect(stored?.acknowledgedAlerts).toEqual({
      glucose: '2024-03-10T10:00:00.000Z',
      hemoglobin: '2024-04-10T10:00:00.000Z',
    });
  });

  it('undoes an acknowledgement that could not be saved and reports the failure', async () => {
    mockUpdatePreferences.mockRejectedValueOnce(new Error('quota'));
    const { result } = renderHook(() => useAlertState(), { wrapper: AlertStateProvider });
    await waitFor(() => expect(result.current.acknowledgedThrough.glucose).toBeDefined());

    let error: unknown;
    await act(async () => {
      await result.current
        .acknowledge('hemoglobin', new Date('2024-05-01T10:00:00.000Z'))
        .catch((e) => {
          error = e;
        });
    });

    expect(error).toBeInstanceOf(Error);
    expect(result.current.acknowledgedThrough.hemoglobin).toBeUndefined();
    expect(result.current.acknowledgedThrough.glucose).toBeDefined();
  });

  it('forgets dismissals when the stored state is read again, e.g. after a restore', async () => {
    const { result } = renderHook(() => useAlertState(), { wrapper: AlertStateProvider });
    await waitFor(() => expect(result.current.acknowledgedThrough.glucose).toBeDefined());
    act(() => result.current.dismiss('glucose', new Date('2024-03-10T10:00:00Z')));

    await act(() => result.current.reload());

    expect(result.current.dismissedThrough).toEqual({});
  });

  it('goes back to the stored acknowledgement when overlapping ones all fail', async () => {
    const { result } = renderHook(() => useAlertState(), { wrapper: AlertStateProvider });
    await waitFor(() => expect(result.current.acknowledgedThrough.glucose).toBeDefined());
    const fails: Array<(err: unknown) => void> = [];
    mockUpdatePreferences.mockImplementation(() => new Promise((_, reject) => fails.push(reject)));

    const saves: Promise<void>[] = [];
    act(() => {
      saves.push(result.current.acknowledge('glucose', new Date('2024-04-01T10:00:00.000Z')));
    });
    act(() => {
      saves.push(result.current.acknowledge('glucose', new Date('2024-05-01T10:00:00.000Z')));
    });
    await act(async () => {
      fails.forEach((fail) => fail(new Error('timeout')));
      await Promise.allSettled(saves);
    });

    expect(result.current.acknowledgedThrough.glucose?.toISOString()).toBe(
      '2024-03-10T10:00:00.000Z'
    );
  });
});
