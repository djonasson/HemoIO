/**
 * Shared steps for getting into the application
 *
 * "Given I am logged into the application" — completes first-run setup on a
 * fresh browser profile, or unlocks an existing one.
 */

import { expect, type Page, type Route } from '@playwright/test';

export const TEST_PASSWORD = 'TestPassword123!';

/** Mirrors CREDENTIALS_STORAGE_KEY in src/data/encryption: where the password lock is kept */
export const CREDENTIALS_KEY = 'hemoio_credentials';

/** The stored password lock, as text, or null */
export function storedCredentials(page: Page): Promise<string | null> {
  return page.evaluate((name) => localStorage.getItem(name), CREDENTIALS_KEY);
}

/**
 * When I choose to set HemoIO up anew — where folders can be used, first run
 * starts with a choice between that and a folder copy; elsewhere setup starts
 * on the password step. Ends on the password step.
 */
export async function startNewSetup(page: Page): Promise<void> {
  const start = page.getByRole('button', { name: 'Set up HemoIO' });
  const passwordField = page.getByPlaceholder(/enter your password/i);
  await expect(start.or(passwordField)).toBeVisible();
  if (await start.isVisible()) await start.click();
  await expect(passwordField).toBeVisible();
}

/**
 * Complete the first-run setup wizard with local storage and no AI provider
 */
export async function completeSetup(page: Page, password: string = TEST_PASSWORD): Promise<void> {
  await startNewSetup(page);
  await page.getByPlaceholder(/enter your password/i).fill(password);
  await page.getByPlaceholder(/confirm your password/i).fill(password);
  await page.getByRole('button', { name: 'Go to next step' }).click();

  // Skip storage setup (use local)
  await page.getByRole('button', { name: 'Go to next step' }).click();

  // Skip AI setup (just proceed without configuring)
  await page.getByRole('button', { name: 'Go to next step' }).click();

  // Exact aria-label avoids matching the stepper's own "Complete" step button
  await page.getByRole('button', { name: 'Complete setup and get started' }).click();
  await expectAppReady(page);
}

/**
 * Unlock the application from the login screen
 */
export async function unlockApp(page: Page, password: string = TEST_PASSWORD): Promise<void> {
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(password);
  await page.getByRole('button', { name: /unlock/i }).click();
  await expectAppReady(page);
}

/**
 * Complete setup or unlock, whichever screen the app shows.
 *
 * Waits for one of the two screens to render before deciding, rather than
 * checking visibility immediately (which races the app's first render).
 */
export async function setupOrUnlock(page: Page, password: string = TEST_PASSWORD): Promise<void> {
  const setupScreen = page
    .getByPlaceholder(/confirm your password/i)
    .or(page.getByRole('button', { name: 'Set up HemoIO' }));
  const unlockScreen = page.getByRole('button', { name: /unlock/i });
  await expect(setupScreen.or(unlockScreen)).toBeVisible();

  if (await setupScreen.isVisible()) {
    await completeSetup(page, password);
  } else {
    await unlockApp(page, password);
  }
}

async function expectAppReady(page: Page): Promise<void> {
  await expect(page.locator('nav').getByText('Settings', { exact: true })).toBeVisible();
}

/**
 * When I open a page from the menu — on a phone the menu opens from the
 * burger button and closes itself once a page is chosen
 */
export async function openFromMenu(page: Page, name: string): Promise<void> {
  const burger = page.getByRole('button', { name: 'Toggle navigation' });
  if (await burger.isVisible()) await burger.click();
  const item = page.getByRole('navigation').getByRole('button', { name: new RegExp(`^${name}`) });
  await item.click();
  await expect(item).toHaveAttribute('aria-current', 'page');
}

/**
 * When I open the given tab of Settings — through the menu, so it works on a
 * phone too — and waits until that tab is selected
 */
export async function openSettingsTab(page: Page, tab: string | RegExp): Promise<void> {
  await openFromMenu(page, 'Settings');
  const tabButton = page.getByRole('tab', { name: tab, exact: true });
  await tabButton.click();
  await expect(tabButton).toHaveAttribute('aria-selected', 'true');
}

/** Requests for the LOINC test catalog file, in the dev server and in a build */
const TEST_CATALOG_REQUEST = /catalog\.generated/;

/**
 * Given the LOINC test catalog cannot be loaded — its file fails as it
 * would offline before it was ever downloaded. Resolves with a function
 * that lets it load again.
 */
export async function blockTestCatalog(page: Page): Promise<() => Promise<void>> {
  const abort = (route: Route): Promise<void> => route.abort('internetdisconnected');
  await page.route(TEST_CATALOG_REQUEST, abort);
  return () => page.unroute(TEST_CATALOG_REQUEST, abort);
}

/**
 * Then I should be told the test catalog could not be loaded, and offered to try again
 */
export async function expectTestCatalogError(page: Page): Promise<void> {
  const alert = page.getByRole('alert').filter({ hasText: 'Test catalog could not be loaded' });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible();
}

/** Then HemoIO should stay unlocked */
export async function expectUnlocked(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Lock application' })).toBeVisible();
  await expect(page.getByLabel('Password')).toHaveCount(0);
}
