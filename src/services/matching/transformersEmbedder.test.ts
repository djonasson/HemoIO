import { describe, it, expect, vi } from 'vitest';

const pipeline = vi.fn(async () => async () => ({ tolist: () => [[1, 0]] }));
vi.mock('@huggingface/transformers', () => ({
  pipeline,
  env: { backends: { onnx: {} } },
}));

describe('loadTransformersEmbedder', () => {
  it('loads the matching model at its pinned revision, never the moving main branch', async () => {
    const { loadTransformersEmbedder } = await import('./transformersEmbedder');
    const { MATCHING_MODEL, MATCHING_MODEL_REVISION } = await import('./index');

    await loadTransformersEmbedder(MATCHING_MODEL, MATCHING_MODEL_REVISION);

    expect(MATCHING_MODEL_REVISION).toMatch(/^[0-9a-f]{40}$/);
    expect(pipeline).toHaveBeenCalledWith(
      'feature-extraction',
      MATCHING_MODEL,
      expect.objectContaining({ revision: MATCHING_MODEL_REVISION })
    );
  });
});
