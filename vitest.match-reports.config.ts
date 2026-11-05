/**
 * The local-matching tuning runner (scripts/match-reports.ts): reads real
 * reports, so it runs on demand, never in the default suite. See the
 * runner for how to call it.
 */
import { defineConfig } from 'vitest/config';
import path from 'path';
import base from './vitest.config';

export default defineConfig({
  ...base,
  resolve: {
    alias: [
      // PDF.js asks for its legacy build in Node
      { find: /^pdfjs-dist$/, replacement: path.resolve(__dirname, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs') },
      ...Object.entries(base.resolve?.alias ?? {}).map(([find, replacement]) => ({ find, replacement })),
    ],
  },
  test: {
    include: ['scripts/match-reports.ts'],
    environment: 'node',
    testTimeout: 3_600_000,
  },
});
