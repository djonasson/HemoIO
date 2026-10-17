/**
 * Shared steps for getting into the application
 *
 * "Given I am logged into the application" — completes first-run setup on a
 * fresh browser profile, or unlocks an existing one.
 */

import { expect, type Page } from '@playwright/test';

export const TEST_PASSWORD = 'TestPassword123!';

/**
 * Complete the first-run setup wizard with local storage and no AI provider
 */
export async function completeSetup(page: Page, password: string = TEST_PASSWORD): Promise<void> {
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
  const setupScreen = page.getByPlaceholder(/confirm your password/i);
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
