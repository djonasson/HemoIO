import { describe, it, expect, vi } from 'vitest';
import { afterRestoreAdvice, runAfterRestore, type AfterRestoreStep } from './afterRestore';

describe('runAfterRestore', () => {
  it('runs every step and names the ones that failed', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sync = vi.fn().mockResolvedValue(undefined);

    const failed = await runAfterRestore([
      { name: 'reloading your preferences', run: vi.fn().mockResolvedValue(undefined) },
      { name: 'applying the AI configuration', run: vi.fn().mockRejectedValue(new Error('x')) },
      { name: 'syncing to your folder', run: sync },
    ]);

    expect(failed).toEqual(['applying the AI configuration']);
    // A failed step does not stop the ones after it
    expect(sync).toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith('After restore, failed: applying the AI configuration');
    consoleError.mockRestore();
  });

  it('reports nothing when every step succeeds', async () => {
    expect(await runAfterRestore([{ name: 'a', run: async () => undefined }])).toEqual([]);
  });
});

describe('afterRestoreAdvice', () => {
  const steps: AfterRestoreStep[] = [
    { name: 'loading your preferences', run: vi.fn() },
    { name: 'showing the restored results', run: vi.fn() },
    { name: 'applying the AI configuration', run: vi.fn(), remedy: 'Check the AI configuration in Settings.' },
  ];

  it('says to reload only for what a reload reads again', () => {
    expect(afterRestoreAdvice(steps, ['applying the AI configuration'])).toBe(
      'Check the AI configuration in Settings.'
    );
  });

  it('says each remedy once', () => {
    expect(
      afterRestoreAdvice(steps, [
        'loading your preferences',
        'showing the restored results',
        'applying the AI configuration',
      ])
    ).toBe('Reload the page to see everything restored. Check the AI configuration in Settings.');
  });
});
