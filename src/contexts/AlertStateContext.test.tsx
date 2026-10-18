import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AlertStateProvider } from './AlertStateContext';
import { useAlertState } from '@hooks/useAlertState';

const mockGetPreferences = vi.fn();
const mockSavePreferences = vi.fn();
const mockDb = {
  getPreferences: (...args: unknown[]) => mockGetPreferences(...args),
  savePreferences: (...args: unknown[]) => mockSavePreferences(...args),
};
vi.mock('@hooks/useEncryptedDb', () => ({ useEncryptedDb: () => ({ db: mockDb, isReady: true }) }));

const basePrefs = { unitPreferences: {}, personalTargets: {}, theme: 'system', dateFormat: 'MM/DD/YYYY' };

describe('AlertStateProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPreferences.mockResolvedValue({ ...basePrefs, acknowledgedAlerts: { glucose: '2024-03-10T10:00:00.000Z' } });
    mockSavePreferences.mockResolvedValue(1);
  });

  it('loads persisted acknowledgements', async () => {
    const { result } = renderHook(() => useAlertState(), { wrapper: AlertStateProvider });
    await waitFor(() =>
      expect(result.current.acknowledgedThrough.glucose).toEqual(new Date('2024-03-10T10:00:00.000Z'))
    );
  });

  it('persists an acknowledgement and shares it with every consumer', async () => {
    const { result } = renderHook(
      () => ({ alertsView: useAlertState(), navBadge: useAlertState() }),
      { wrapper: AlertStateProvider }
    );
    await waitFor(() => expect(result.current.navBadge.acknowledgedThrough.glucose).toBeDefined());

    await act(async () => {
      await result.current.alertsView.acknowledge('hemoglobin', new Date('2024-05-01T10:00:00.000Z'));
    });

    expect(result.current.navBadge.acknowledgedThrough.hemoglobin).toEqual(new Date('2024-05-01T10:00:00.000Z'));
    expect(mockSavePreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        acknowledgedAlerts: {
          glucose: '2024-03-10T10:00:00.000Z',
          hemoglobin: '2024-05-01T10:00:00.000Z',
        },
      })
    );
  });

  it('keeps dismissals in memory only', async () => {
    const { result } = renderHook(() => useAlertState(), { wrapper: AlertStateProvider });
    await waitFor(() => expect(result.current.acknowledgedThrough.glucose).toBeDefined());
    act(() => result.current.dismiss('out_of_range_glucose_1'));
    expect(result.current.dismissedIds.has('out_of_range_glucose_1')).toBe(true);
    expect(mockSavePreferences).not.toHaveBeenCalled();
  });
});
