import { describe, it, expect, vi } from 'vitest';
import { fixtureCatalog } from '@/test/loincFixture';
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

describe('namedTests', () => {
  it("names each test HemoIO describes by its LOINC code, with HemoIO's name and LOINC's", async () => {
    const { namedTests } = await import('./index');
    const glucose = namedTests(fixtureCatalog()).find((test) => test.key === '2345-7');
    expect(glucose?.names[0]).toBe('Glucose');
    expect(glucose?.names.length).toBeGreaterThan(1);
  });
});
