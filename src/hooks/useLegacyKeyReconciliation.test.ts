import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useLegacyKeyReconciliation } from './useLegacyKeyReconciliation';
import { useEncryptedDb } from './useEncryptedDb';

vi.mock('./useEncryptedDb', () => ({ useEncryptedDb: vi.fn() }));

const reconcileLegacyUnknownKeys = vi.fn();
const mockDb = { reconcileLegacyUnknownKeys };

describe('useLegacyKeyReconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useEncryptedDb).mockReturnValue({ db: mockDb as never, isReady: true });
  });

  it('reconciles stored data once after unlock, then reports done', async () => {
    reconcileLegacyUnknownKeys.mockResolvedValue(2);

    const { result, rerender } = renderHook(() => useLegacyKeyReconciliation());

    expect(result.current.isReconciling).toBe(true);
    await waitFor(() => expect(result.current.isReconciling).toBe(false));
    rerender();
    expect(reconcileLegacyUnknownKeys).toHaveBeenCalledTimes(1);
  });

  it('does not block the app when reconciliation fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    reconcileLegacyUnknownKeys.mockRejectedValue(new Error('decrypt failed'));

    const { result } = renderHook(() => useLegacyKeyReconciliation());

    await waitFor(() => expect(result.current.isReconciling).toBe(false));
    expect(consoleError).toHaveBeenCalledWith('Failed to reconcile legacy biomarker keys');
  });

  it('waits while the database is locked', () => {
    vi.mocked(useEncryptedDb).mockReturnValue({ db: null, isReady: false });

    const { result } = renderHook(() => useLegacyKeyReconciliation());

    expect(result.current.isReconciling).toBe(true);
    expect(reconcileLegacyUnknownKeys).not.toHaveBeenCalled();
  });
});
