import { createLogger, defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { existsSync } from 'fs';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import {
  OCR_PRECACHE_GLOBS,
  OCR_PRECACHE_IGNORES,
  ocrCopyTargets,
  ocrRuntimeCaching,
} from './src/services/ocr/ocrAssets';
import { OCR_CACHE_NAME } from './ocrCache.config';
import { ONNX_ASSET_DIR, ONNX_RUNTIME_FILES } from './src/services/matching/onnxAssets';
import { dataLayerReload } from './src/utils/dataLayerReload';

// OCR runs from these files offline: a missing one must fail the build, not OCR
const ocrTargets = ocrCopyTargets();
const missingOcrFiles = ocrTargets.filter((target) => !existsSync(target.src));
if (missingOcrFiles.length > 0) {
  throw new Error(`Missing OCR files: ${missingOcrFiles.map((t) => t.src).join(', ')}`);
}

/** Above this a JS chunk gets Vite's size warning (see build.chunkSizeWarningLimit) */
const CHUNK_SIZE_WARNING_KB = 600;
/** The LOINC catalog: data, 13 MB on purpose, loaded on its own after unlock */
const CATALOG_CHUNK = /catalog\.generated-[^/]+\.js$/;

/**
 * Vite's chunk size warning names no chunk, so it cannot leave one out. This
 * notes whether the catalog is the only chunk over the limit, and the logger
 * below drops the warning only then: any other large chunk still warns.
 */
let onlyCatalogTooLarge = false;
function catalogChunkSize(): Plugin {
  return {
    name: 'catalog-chunk-size',
    apply: 'build',
    generateBundle(_options, bundle) {
      const large = Object.values(bundle).filter(
        (file) => file.type === 'chunk' && Buffer.byteLength(file.code) / 1000 > CHUNK_SIZE_WARNING_KB
      );
      onlyCatalogTooLarge = large.length > 0 && large.every((file) => CATALOG_CHUNK.test(file.fileName));
    },
  };
}
const logger = createLogger();
const warn = logger.warn.bind(logger);
logger.warn = (message, options) => {
  if (onlyCatalogTooLarge && message.includes('Some chunks are larger than')) return;
  warn(message, options);
};

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const base = command === 'build' ? '/HemoIO/' : '/';

  return {
    base,
    customLogger: logger,
    define: {
      __OCR_CACHE_NAME__: JSON.stringify(OCR_CACHE_NAME),
    },
    plugins: [
      // Dev server only: a data-layer change reloads the page instead of hot-updating it
      dataLayerReload(),
      catalogChunkSize(),
      react(),
      viteStaticCopy({
        // Flat into tesseract/…, without the node_modules path
        targets: [
          ...ocrTargets.map((target) => ({ ...target, rename: { stripBase: true as const } })),
          // The ONNX runtime the matching model runs on, served by the app itself
          ...ONNX_RUNTIME_FILES.map((file) => ({
            src: `node_modules/onnxruntime-web/dist/${file}`,
            dest: ONNX_ASSET_DIR,
            rename: { stripBase: true as const },
          })),
        ],
      }),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          id: base,
          name: 'HemoIO - Lab Results Tracker',
          short_name: 'HemoIO',
          description: 'Personal lab results analysis and tracking. Keep your health data private and secure.',
          theme_color: '#228be6',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait',
          scope: base,
          start_url: base,
          categories: ['health', 'medical', 'lifestyle'],
          icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Cache strategies for different resources
        runtimeCaching: [
          {
            // Cache fonts
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
          ocrRuntimeCaching(OCR_CACHE_NAME),
          {
            // The LOINC catalog (13 MB) is loaded after unlock, then offline;
            // its file name changes with its content, so old ones expire
            urlPattern: /\/assets\/catalog\.generated-[^/]+\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'loinc-catalog',
              expiration: { maxEntries: 1 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Downloaded the first time the matching model is needed, then offline
            urlPattern: new RegExp(`/${ONNX_ASSET_DIR}/`),
            handler: 'CacheFirst',
            options: { cacheName: 'onnx-runtime', cacheableResponse: { statuses: [0, 200] } },
          },
        ],
        // Skip waiting and claim clients immediately for better UX
        skipWaiting: true,
        clientsClaim: true,
        // Pre-cache app shell; OCR files and the LOINC catalog are cached on first use
        globPatterns: [...OCR_PRECACHE_GLOBS],
        globIgnores: [...OCR_PRECACHE_IGNORES, `${ONNX_ASSET_DIR}/**`, 'assets/catalog.generated-*.js'],
      },
      devOptions: {
        enabled: false, // Disable in dev to avoid caching issues
      },
    }),
  ],
  optimizeDeps: {
    // Loaded only when the matching model is first needed: pre-bundled at
    // start, so the dev server does not reload the page when it is
    include: ['@huggingface/transformers'],
  },
  build: {
    // transformers.js (~580 kB) is one library, loaded only when the matching
    // model is first needed; every chunk the app starts with stays under 500 kB.
    // The LOINC catalog alone is let through (catalogChunkSize above).
    chunkSizeWarningLimit: CHUNK_SIZE_WARNING_KB,
    rollupOptions: {
      output: {
        // Libraries change less often than the app, so each group stays cached across releases
        manualChunks(id) {
          const pkg = id.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1];
          if (!pkg) return undefined;
          if (/^(react|react-dom|scheduler)$/.test(pkg)) return 'vendor-react';
          if (/^(@mantine|@floating-ui|@tabler)\//.test(pkg)) return 'vendor-mantine';
          // Recharts and the libraries it is built on
          const charts =
            /^(recharts|@reduxjs\/toolkit|react-redux|immer|es-toolkit|d3-.+|decimal\.js-light|victory-vendor)$/;
          return charts.test(pkg) ? 'vendor-charts' : undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@contexts': path.resolve(__dirname, './src/contexts'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@services': path.resolve(__dirname, './src/services'),
      '@data': path.resolve(__dirname, './src/data'),
      '@types': path.resolve(__dirname, './src/types'),
      '@utils': path.resolve(__dirname, './src/utils'),
    },
  },
};
});
