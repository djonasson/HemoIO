import { describe, it, expect, vi } from 'vitest';
import type { Embedder } from './similarNames';

const loadTransformersEmbedder = vi.fn<() => Promise<Embedder>>();
vi.mock('./transformersEmbedder', () => ({ loadTransformersEmbedder }));

describe('getSimilarNameMatcher', () => {
  it('loads the model once, and again on the next use after a failed load', async () => {
    const { getSimilarNameMatcher } = await import('./index');
    const embedder: Embedder = { embed: async (texts) => texts.map(() => [1]) };
    loadTransformersEmbedder.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(embedder);
    const onLoading = vi.fn();

    await expect(getSimilarNameMatcher(onLoading)).rejects.toThrow('offline');
    const matcher = await getSimilarNameMatcher(onLoading);
    expect(await getSimilarNameMatcher(onLoading)).toBe(matcher);

    expect(loadTransformersEmbedder).toHaveBeenCalledTimes(2);
    expect(onLoading).toHaveBeenCalledTimes(2);
  });
});
