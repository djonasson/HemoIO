import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { existsSync } from 'fs';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { ocrCopyTargets } from './src/services/ocr/ocrAssets';

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
    plugins: [
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
        ],
        // Skip waiting and claim clients immediately for better UX
        skipWaiting: true,
        clientsClaim: true,
        // Pre-cache app shell
        // The OCR worker, cores and language data are precached for offline OCR
        // .mjs: the PDF.js worker, without which no PDF opens offline
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,woff,woff2}', 'tesseract/**/*'],
        // OCR cores and language data are a few MB each
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: {
        enabled: false, // Disable in dev to avoid caching issues
      },
    }),
  ],
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
