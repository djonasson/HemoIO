import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const base = command === 'build' ? '/HemoIO/' : '/';

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.svg'],
        manifest: {
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
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Cache strategies for different resources
        runtimeCaching: [
          {
            // Cache PDF.js worker
            urlPattern: /pdfjs-dist.*worker/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdfjs-worker',
              expiration: {
                maxEntries: 5,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          {
            // Cache Tesseract.js worker and language files
            urlPattern: /tesseract.*worker|tesseract.*lang-data/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesseract-assets',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
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
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
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
