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
vi.mock('@hooks/useEncryptedDb', () => ({
  useEncryptedDb: () => ({ db: mockDb, isReady: true }),
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

  it('keeps dismissals in memory only', async () => {
    const { result } = renderHook(() => useAlertState(), { wrapper: AlertStateProvider });
    await waitFor(() => expect(result.current.acknowledgedThrough.glucose).toBeDefined());
    act(() => result.current.dismiss('out_of_range_glucose_1'));
    expect(result.current.dismissedIds.has('out_of_range_glucose_1')).toBe(true);
    expect(mockUpdatePreferences).not.toHaveBeenCalled();
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
});
