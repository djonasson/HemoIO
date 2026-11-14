/**
 * E2E tests for features/page-errors.feature: a page that fails says what
 * went wrong instead of leaving a white screen. The dev server lets a test
 * make a page fail (src/components/layout/testPageFailure.ts).
 */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openFromMenu, setupOrUnlock } from './steps/app.steps';

/** Given the page of `view` fails while it is shown */
async function makeFail(page: Page, view: string | undefined): Promise<void> {
  await page.evaluate((failing) => {
    window.__hemoioFailingView = failing;
  }, view);
}

const failure = (page: Page) => page.getByRole('alert').filter({ hasText: 'This page could not be shown' });

test.describe('A page that fails', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
  });

  test('shows what went wrong, and the menu still works', async ({ page }) => {
    // Scenario: A page that fails shows what went wrong, and the menu still works
    await makeFail(page, 'trends');
    await openFromMenu(page, 'Trends');
    await expect(failure(page)).toBeVisible();
    await expect(failure(page)).toContainText('The trends page was made to fail by a test');
    await openFromMenu(page, 'Timeline');
    await expect(failure(page)).toHaveCount(0);
    await expect(page.getByRole('main').getByText(/No Lab Results Yet/i)).toBeVisible();
  });

  test('tries the failed page anew', async ({ page }) => {
    // Scenario: "Try again" tries the failed page anew
    await makeFail(page, 'trends');
    await openFromMenu(page, 'Trends');
    await expect(failure(page)).toBeVisible();
    await makeFail(page, undefined);
    await failure(page).getByRole('button', { name: 'Try again' }).click();
    await expect(failure(page)).toHaveCount(0);
    await expect(page.getByText('Import lab results to see trends and analytics.')).toBeVisible();
  });

  test('says reloading locks HemoIO', async ({ page }) => {
    // Scenario: Reloading from a failed page says it locks HemoIO
    await makeFail(page, 'trends');
    await openFromMenu(page, 'Trends');
    await expect(failure(page).getByRole('button', { name: 'Reload HemoIO' })).toBeVisible();
    await expect(failure(page)).toContainText('Reloading locks HemoIO until you enter your password again.');
  });

  test('gives details I can copy to report the problem', async ({ page }) => {
    // Scenario: A failed page gives details I can copy to report the problem
    // Scenario: The details never hold my health data
    await page.evaluate(() => {
      const copied = window as unknown as { __copied: string[] };
      copied.__copied = [];
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: async (text: string) => void copied.__copied.push(text) },
        configurable: true,
      });
    });
    await makeFail(page, 'trends');
    await openFromMenu(page, 'Trends');
    await failure(page).getByText('Technical details').click();
    const details = failure(page).getByLabel('Technical details');
    await expect(details).toBeVisible();
    await expect(details).toContainText('Error: The trends page was made to fail by a test');
    // Where in the code: a script address with its line and column
    await expect(details).toContainText(/Where:\n.*:\d+:\d+/);
    await expect(details).toContainText(`Browser: ${await page.evaluate(() => navigator.userAgent)}`);

    await failure(page).getByRole('button', { name: 'Copy details' }).click();
    await expect(failure(page).getByRole('button', { name: 'Details copied' })).toBeVisible();
    const copied = await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
    expect(copied).toEqual([await details.textContent()]);
  });
});
