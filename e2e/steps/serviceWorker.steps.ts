/**
 * Steps for the pwa specs, which run against a production build with its
 * service worker (see the pwa projects in playwright.config.ts)
 */

import type { Page } from '@playwright/test';

/** Wait until the service worker controls the page */
export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    while (!navigator.serviceWorker.controller) await new Promise((r) => setTimeout(r, 100));
  });
}

/** The paths of the files the service worker has cached at run time, sorted */
export function cachedPaths(page: Page, cacheName: string): Promise<string[]> {
  return page.evaluate(async (name) => {
    if (!(await caches.has(name))) return [];
    const requests = await (await caches.open(name)).keys();
    return requests.map((request) => new URL(request.url).pathname).sort();
  }, cacheName);
}
