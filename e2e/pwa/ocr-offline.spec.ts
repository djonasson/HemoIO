/**
 * E2E: the service worker downloads the OCR files on first use
 *
 * Runs against a production build (see the pwa projects in
 * playwright.config.ts): the dev server has no service worker.
 *
 * Gherkin: features/document-analysis.feature
 * Scenario: OCR files are downloaded only when OCR is first used
 */

import { test, expect, type Page } from '@playwright/test';
import { unlockApp } from '../steps/app.steps';
import { createTextImage } from '../steps/documentAnalysis.steps';
import {
  goToImport,
  loginWithOllama,
  startAnalysis,
  uploadFiles,
} from '../steps/importWizard.steps';
import { removeTempFile } from '../steps/tempFiles';

/** Wait until the service worker controls the page */
async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    while (!navigator.serviceWorker.controller) await new Promise((r) => setTimeout(r, 100));
  });
}

/** The OCR files the service worker has cached, by path */
function cachedOcrFiles(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const paths: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) {
        const path = new URL(request.url).pathname;
        if (path.includes('/tesseract/')) paths.push(path);
      }
    }
    return paths.sort();
  });
}

async function analyzeScan(page: Page): Promise<void> {
  await goToImport(page);
  const image = await createTextImage(page, 'scan.png');
  try {
    await uploadFiles(page, image);
    await startAnalysis(page);
    await expect(page.getByRole('alert', { name: 'Analysis Complete' })).toBeVisible({
      timeout: 90000,
    });
  } finally {
    removeTempFile(image);
  }
}

test.describe('OCR files are downloaded only when OCR is first used', () => {
  test.setTimeout(240000);

  async function useOcrOnce(page: Page): Promise<string[]> {
    await loginWithOllama(page);
    await waitForServiceWorker(page);

    // Installed: the OCR files are not downloaded
    expect(await cachedOcrFiles(page)).toEqual([]);

    await analyzeScan(page);
    return cachedOcrFiles(page);
  }

  test('caches the files OCR loads the first time it is used', async ({ page }) => {
    const cached = await useOcrOnce(page);

    // The worker, the one core this browser uses, and the languages
    expect(cached).toEqual(
      expect.arrayContaining([
        '/tesseract/lang/eng.traineddata.gz',
        '/tesseract/lang/ita.traineddata.gz',
        '/tesseract/worker.min.js',
      ])
    );
    expect(cached.filter((path) => path.startsWith('/tesseract/core/'))).toHaveLength(1);
  });

  test('then works offline', async ({ page, context, browserName }) => {
    // Playwright's offline mode in Firefox fails every navigation, service
    // worker or not, so offline loading can only be checked in Chromium
    test.skip(browserName === 'firefox', 'Firefox offline emulation bypasses the service worker');
    await useOcrOnce(page);

    await context.setOffline(true);
    await page.reload();
    await unlockApp(page);
    await analyzeScan(page);
  });
});
