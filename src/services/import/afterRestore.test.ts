import { describe, it, expect, vi } from 'vitest';
import { runAfterRestore } from './afterRestore';

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
