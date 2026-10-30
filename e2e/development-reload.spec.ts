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

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    devServer = await DevServerCopy.start();
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
    await watcher.expectFullReload(() => devServer.editFile('src/data/db/encryptedDb.ts'));
  });

  test('changing code that the data layer is built on reloads the page', async () => {
    await watcher.expectFullReload(() => devServer.editFile('src/utils/unitSpelling.ts'));
  });

  test('changing code that uses the data layer reloads the page', async () => {
    await watcher.expectFullReload(() => devServer.editFile('src/contexts/AuthContext.tsx'));
  });

  test('changing a screen that does not use the data layer updates in place', async () => {
    const screen = 'src/components/common/RelativeTime.tsx';
    await watcher.expectHotUpdate(screen, () => devServer.editFile(screen));
  });

  test('changing a screen that shows the test dictionary updates in place', async () => {
    const screen = 'src/components/dictionary/DictionaryView.tsx';
    await watcher.expectHotUpdate(screen, () => devServer.editFile(screen));
  });
});
