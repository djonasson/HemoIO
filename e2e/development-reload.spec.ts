/**
 * Feature: Development reload for data code (features/development-reload.feature)
 *
 * Runs against its own dev server on a copy of the project; see
 * steps/devServer.steps.ts for why.
 */

import { test } from './fixtures';
import { DevServerCopy, ReloadWatcherPage } from './steps/devServer.steps';

// The reload is decided by the dev server, not the browser: one browser is enough
test.skip(({ browserName }) => browserName !== 'chromium', 'The dev server decides; Chromium only');

// One server for the scenarios, so they take turns editing its files
test.describe.configure({ mode: 'serial' });

test.describe('Development reload for data code', () => {
  let devServer: DevServerCopy;
  let watcher: ReloadWatcherPage;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    devServer = await DevServerCopy.start();
    // The copy starts with no optimised dependencies: the first visit waits
    // for them, so the scenarios after it run on a settled server
    const page = await browser.newPage();
    await page.goto(devServer.url, { waitUntil: 'networkidle', timeout: 150_000 });
    await page.close();
  });

  test.afterAll(async () => {
    await devServer?.stop();
  });

  test.beforeEach(async ({ page }) => {
    // Given the development server is running
    // And the application is open in a browser tab
    watcher = new ReloadWatcherPage(page);
    await watcher.open(devServer.url);
  });

  test('changing the database code reloads the page', async () => {
    await watcher.expectFullReload(devServer, 'src/data/db/encryptedDb.ts');
  });

  test('changing code that the data layer is built on reloads the page', async () => {
    await watcher.expectFullReload(devServer, 'src/utils/unitSpelling.ts');
  });

  test('changing code that uses the data layer reloads the page', async () => {
    await watcher.expectFullReload(devServer, 'src/contexts/AuthContext.tsx');
  });

  test('changing a screen that does not use the data layer updates in place', async () => {
    await watcher.expectHotUpdate(devServer, 'src/components/common/RelativeTime.tsx');
  });

  test('changing a screen that shows the test dictionary updates in place', async () => {
    await watcher.expectHotUpdate(devServer, 'src/components/dictionary/BiomarkerDictionary.tsx');
  });
});
