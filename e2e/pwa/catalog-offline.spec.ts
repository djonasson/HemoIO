/**
 * E2E: the LOINC test catalog is kept on the device after a first online
 * visit, so the app works offline from then on
 *
 * Runs against a production build (see the pwa projects in
 * playwright.config.ts): the dev server has no service worker.
 *
 * Gherkin: features/pwa.feature
 * Scenario: The test catalog works offline after a first online visit
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { setupOrUnlock, unlockApp } from '../steps/app.steps';
import { goToDictionary, viewDetail } from '../steps/dictionary.steps';
import { cachedPaths, waitForServiceWorker } from '../steps/serviceWorker.steps';

/** The service worker's cache for the catalog (vite.config.ts) */
const CATALOG_CACHE = 'loinc-catalog';

/** Given I unlocked the app once while online — resolves with the cached catalog files */
async function visitOnline(page: Page): Promise<string[]> {
  await page.goto('/');
  await setupOrUnlock(page);
  await waitForServiceWorker(page);
  // The catalog is fetched once the app is unlocked
  await expect.poll(() => cachedPaths(page, CATALOG_CACHE)).toHaveLength(1);
  return cachedPaths(page, CATALOG_CACHE);
}

test.describe('The test catalog works offline after a first online visit', () => {
  test.setTimeout(120000);

  test('keeps the catalog on the device', async ({ page }) => {
    const cached = await visitOnline(page);

    expect(cached[0]).toMatch(/^\/assets\/catalog\.generated-[^/]+\.json$/);
  });

  test('then loads it offline', async ({ page, context, browserName }) => {
    // Playwright's offline mode in Firefox fails every navigation, service
    // worker or not, so offline loading can only be checked in Chromium
    test.skip(browserName === 'firefox', 'Firefox offline emulation bypasses the service worker');
    await visitOnline(page);

    await context.setOffline(true);
    await page.reload();
    await unlockApp(page);

    await expect(page.getByText('Test catalog could not be loaded')).toHaveCount(0);
    await goToDictionary(page);
    const detail = await viewDetail(page, 'Glucose');
    // The code and its long name come from the catalog
    await expect(detail.getByRole('link', { name: /2345-7/ })).toBeVisible();
    await expect(detail.getByText('Glucose [Mass/volume] in Serum or Plasma', { exact: true })).toBeVisible();
  });
});
