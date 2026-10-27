/**
 * Playwright test with a page that never downloads the fallback matching
 * model: E2E runs stay fast and offline-safe, and the "model cannot load"
 * path is the one every test sees unless it serves the model itself.
 */
import { test as base, expect } from '@playwright/test';

export const MODEL_HOST_PATTERN = 'https://huggingface.co/**';

export const test = base.extend({
  page: async ({ page }, provide) => {
    await page.route(MODEL_HOST_PATTERN, (route) => route.abort());
    await provide(page);
  },
});

export { expect };
