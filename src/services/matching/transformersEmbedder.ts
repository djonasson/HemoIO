/**
 * The embedding model in the browser. Imported only when first needed, so
 * transformers.js and the model stay out of the app's start-up. The model
 * is downloaded once and kept in the browser's cache for offline use.
 */
import { ONNX_ASSET_DIR } from './onnxAssets';
import type { Embedder } from './similarNames';

/**
 * @param revision - The model repository's commit: pinned, so a later push
 *   to the repository never reaches users unreviewed
 */
export async function loadTransformersEmbedder(model: string, revision: string): Promise<Embedder> {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.allowLocalModels = false;
  // Kept in the browser's cache for offline use (Node caches on disk)
  env.useBrowserCache = typeof caches !== 'undefined';
  // In the browser the runtime comes from the app's own files (Node has its own)
  const wasm = env.backends.onnx.wasm;
  if (wasm) wasm.wasmPaths = `${import.meta.env.BASE_URL}${ONNX_ASSET_DIR}/`;
  const extract = await pipeline('feature-extraction', model, { dtype: 'q8', revision });
  return {
    async embed(texts) {
      const output = await extract(texts, { pooling: 'mean', normalize: true });
      return output.tolist() as number[][];
    },
  };
}
