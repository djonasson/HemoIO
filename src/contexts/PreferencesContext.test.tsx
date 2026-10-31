import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { PreferencesProvider } from './PreferencesContext';
import { usePreferences } from '@hooks/usePreferences';
import type { UserPreferences } from '@/types';

type Stored = Omit<UserPreferences, 'id'>;

let stored: Stored | undefined;
const mockUpdatePreferences = vi.fn();
const mockDb = {
  getPreferences: vi.fn(async () => stored),
  updatePreferences: (...args: unknown[]) => mockUpdatePreferences(...args),
};
vi.mock('@hooks/useEncryptedDb', () => ({
  useEncryptedDb: () => ({ db: mockDb, isReady: true }),
}));

const base: Stored = {
  unitPreferences: {},
  personalTargets: {},
  theme: 'system',
  dateFormat: 'MM/DD/YYYY',
};

async function renderLoaded() {
  const hook = renderHook(() => usePreferences(), { wrapper: PreferencesProvider });
  await waitFor(() => expect(hook.result.current.isLoaded).toBe(true));
  return hook;
}

describe('PreferencesProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stored = {
      ...base,
      unitPreferences: { glucose: 'mmol/L' },
      personalTargets: { glucose: { high: 90 } },
    };
    mockUpdatePreferences.mockImplementation(
      async (update: (current: Stored | undefined) => Partial<Stored>) => {
        stored = { ...base, ...stored, ...update(stored) };
      }
    );
  });

  it('loads the stored unit preferences and personal targets', async () => {
    const { result } = await renderLoaded();
    expect(result.current.unitPreferences).toEqual({ glucose: 'mmol/L' });
    expect(result.current.personalTargets).toEqual({ glucose: { high: 90 } });
  });

  it('saves a preferred unit without touching other preferences', async () => {
    const { result } = await renderLoaded();
    await act(() => result.current.setPreferredUnit('hemoglobin', 'g/L'));

    expect(result.current.unitPreferences).toEqual({ glucose: 'mmol/L', hemoglobin: 'g/L' });
    expect(stored?.unitPreferences).toEqual({ glucose: 'mmol/L', hemoglobin: 'g/L' });
    expect(stored?.personalTargets).toEqual({ glucose: { high: 90 } });
  });

  it('sets and removes a personal target', async () => {
    const { result } = await renderLoaded();
    await act(() => result.current.setPersonalTarget('ferritin', { low: 50 }));
    expect(stored?.personalTargets).toEqual({ glucose: { high: 90 }, ferritin: { low: 50 } });

    await act(() => result.current.setPersonalTarget('glucose', null));
    expect(result.current.personalTargets).toEqual({ ferritin: { low: 50 } });
    expect(stored?.personalTargets).toEqual({ ferritin: { low: 50 } });
  });

  it('learns the names saved under a test, and forgets a removed one', async () => {
    const { result } = await renderLoaded();
    await act(() => result.current.learnAliases([{ name: 'Zorb (urine)', key: 'urine-urea', pickedByUser: true }]));

    expect(result.current.learnedAliases).toEqual({ 'zorb (urine)': 'urine-urea' });
    expect(stored?.learnedAliases).toEqual({ 'zorb (urine)': 'urine-urea' });
    expect(stored?.unitPreferences).toEqual({ glucose: 'mmol/L' });

    await act(() => result.current.removeLearnedAlias('Zorb (urine)'));
    expect(result.current.learnedAliases).toEqual({});
    expect(stored?.learnedAliases).toEqual({});
  });

  it('goes back to the previous learned names when saving fails', async () => {
    const { result } = await renderLoaded();
    mockUpdatePreferences.mockRejectedValueOnce(new Error('disk full'));

    await act(async () => {
      await expect(
        result.current.learnAliases([{ name: 'Zorb (urine)', key: 'urine-urea', pickedByUser: true }])
      ).rejects.toThrow('disk full');
    });
    expect(result.current.learnedAliases).toEqual({});
  });

  it('goes back to the previous unit when saving fails', async () => {
    const { result } = await renderLoaded();
    mockUpdatePreferences.mockRejectedValueOnce(new Error('disk full'));

    await act(async () => {
      await expect(result.current.setPreferredUnit('glucose', 'mg/dL')).rejects.toThrow(
        'disk full'
      );
    });
    expect(result.current.unitPreferences).toEqual({ glucose: 'mmol/L' });
  });

  it('goes back to the stored unit when overlapping changes all fail', async () => {
    const { result } = await renderLoaded();
    const fails: Array<(err: unknown) => void> = [];
    mockUpdatePreferences.mockImplementation(() => new Promise((_, reject) => fails.push(reject)));

    const saves: Promise<void>[] = [];
    act(() => {
      saves.push(result.current.setPreferredUnit('glucose', 'mg/dL'));
    });
    act(() => {
      saves.push(result.current.setPreferredUnit('glucose', 'mg/L'));
    });
    await act(async () => {
      fails.forEach((fail) => fail(new Error('timeout')));
      await Promise.allSettled(saves);
    });

    expect(result.current.unitPreferences).toEqual({ glucose: 'mmol/L' });
  });

  it('re-reads the stored preferences on reload', async () => {
    const { result } = await renderLoaded();
    stored = { ...base, personalTargets: { ferritin: { low: 30 } } };

    await act(() => result.current.reload());

    expect(result.current.unitPreferences).toEqual({});
    expect(result.current.personalTargets).toEqual({ ferritin: { low: 30 } });
  });

  it('throws when used outside the provider', () => {
    // React reports the render error; keep the expected error out of the output
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => usePreferences())).toThrow('PreferencesProvider');
    spy.mockRestore();
  });
});
