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
    // Scenario: Opening the failed page again tries it anew
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
});
