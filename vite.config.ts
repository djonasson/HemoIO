import { defineConfig } from 'vite';
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
import { UCUM_LHC_VERSION } from './packageVersions.config';
import { dataLayerReload } from './src/utils/dataLayerReload';

// OCR runs from these files offline: a missing one must fail the build, not OCR
const ocrTargets = ocrCopyTargets();
const missingOcrFiles = ocrTargets.filter((target) => !existsSync(target.src));
if (missingOcrFiles.length > 0) {
  throw new Error(`Missing OCR files: ${missingOcrFiles.map((t) => t.src).join(', ')}`);
}

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const base = command === 'build' ? '/HemoIO/' : '/';

  return {
    base,
    define: {
      __OCR_CACHE_NAME__: JSON.stringify(OCR_CACHE_NAME),
      __UCUM_LHC_VERSION__: JSON.stringify(UCUM_LHC_VERSION),
    },
    plugins: [
      // Dev server only: a data-layer change reloads the page instead of hot-updating it
      dataLayerReload(),
      react(),
      viteStaticCopy({
        // Flat into tesseract/…, without the node_modules path
        targets: ocrTargets.map((target) => ({ ...target, rename: { stripBase: true as const } })),
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
            urlPattern: /\/assets\/catalog\.generated-[^/]+\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'loinc-catalog',
              expiration: { maxEntries: 1 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        // Skip waiting and claim clients immediately for better UX
        skipWaiting: true,
        clientsClaim: true,
        // Pre-cache app shell; OCR files and the LOINC catalog are cached on first use
        globPatterns: [...OCR_PRECACHE_GLOBS],
        globIgnores: [...OCR_PRECACHE_IGNORES, 'assets/catalog.generated-*.json'],
      },
      devOptions: {
        enabled: false, // Disable in dev to avoid caching issues
      },
    }),
  ],
  build: {
    // The LOINC catalog is a JSON file of its own, not a chunk
    rollupOptions: {
      output: {
        // Libraries change less often than the app, so each group stays cached across releases
        manualChunks(id) {
          const pkg = id.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1];
          if (!pkg) return undefined;
          if (/^(react|react-dom|scheduler)$/.test(pkg)) return 'vendor-react';
          if (/^(@mantine|@floating-ui|@tabler)\//.test(pkg)) return 'vendor-mantine';
          // UCUM's unit tables (~280 kB): one library, kept apart so the app's own chunk stays small
          if (pkg === '@lhncbc/ucum-lhc') return 'vendor-ucum';
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
