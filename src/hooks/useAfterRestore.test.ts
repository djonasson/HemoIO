import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAfterRestore } from './useAfterRestore';

const refresh = vi.fn();
const reloadPreferences = vi.fn();
const reloadAlertState = vi.fn();

vi.mock('./useLabResults', () => ({ useLabResults: () => ({ refresh }) }));
vi.mock('./usePreferences', () => ({ usePreferences: () => ({ reload: reloadPreferences }) }));
vi.mock('./useAlertState', () => ({ useAlertState: () => ({ reload: reloadAlertState }) }));

describe('useAfterRestore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refresh.mockResolvedValue(undefined);
    reloadPreferences.mockResolvedValue(undefined);
    reloadAlertState.mockResolvedValue(undefined);
  });

  it('reloads preferences, acknowledgements, any extra step, then the results, in that order', async () => {
    const order: string[] = [];
    reloadPreferences.mockImplementation(async () => void order.push('preferences'));
    reloadAlertState.mockImplementation(async () => void order.push('acknowledgements'));
    refresh.mockImplementation(async () => void order.push('results'));
    const { result } = renderHook(() => useAfterRestore());

    const run = await result.current('showing the restored results', [
      { name: 'applying the AI configuration', run: async () => void order.push('ai') },
    ]);

    expect(order).toEqual(['preferences', 'acknowledgements', 'ai', 'results']);
    expect(run.failed).toEqual([]);
    expect(run.steps.map((step) => step.name).at(-1)).toBe('showing the restored results');
  });

  it('runs every step, and names those that failed, logging no detail', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    reloadAlertState.mockRejectedValue(new Error('acknowledgement for glucose'));
    const { result } = renderHook(() => useAfterRestore());

    const run = await result.current('showing the updated results');

    expect(run.failed).toEqual(['loading your alert acknowledgements']);
    expect(refresh).toHaveBeenCalled();
    expect(JSON.stringify(error.mock.calls)).not.toContain('glucose');
    error.mockRestore();
  });
});
