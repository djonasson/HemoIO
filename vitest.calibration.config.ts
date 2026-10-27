/**
 * Calibration of the matching model: downloads the model, so it runs on
 * demand (npx vitest run --config vitest.calibration.config.ts), never in
 * the default suite
 */
import { defineConfig } from 'vitest/config';
import base from './vitest.config';

export default defineConfig({
  ...base,
  test: {
    include: ['src/**/*.calibration.ts'],
    environment: 'node',
    testTimeout: 600_000,
  },
});
