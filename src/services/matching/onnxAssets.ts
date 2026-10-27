/**
 * The ONNX runtime files the matching model runs on, copied into the build
 * and served from it (not a CDN), so the model works offline once cached.
 * The WebGPU bundle transformers.js imports loads the asyncify build; the
 * plain WebAssembly backend loads the other.
 */
export const ONNX_ASSET_DIR = 'onnx';

export const ONNX_RUNTIME_FILES: readonly string[] = [
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
];
