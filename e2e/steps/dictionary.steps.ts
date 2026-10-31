/**
 * Step definitions for features/biomarker-dictionary.feature, shared with
 * the features that open the Biomarkers page or a biomarker's detail
 */

import { expect, type Locator, type Page } from '@playwright/test';

function biomarkersNavItem(page: Page): Locator {
  return page.getByRole('navigation').getByRole('button', { name: /^Biomarkers/ });
}

/**
 * When I navigate to the Biomarkers page
 */
export async function goToDictionary(page: Page): Promise<void> {
  await biomarkersNavItem(page).click();
  await expect(page.getByRole('heading', { name: 'Biomarker Dictionary' })).toBeVisible();
}

/**
 * The biomarker list's search field
 */
export function searchField(page: Page): Locator {
  return page.getByRole('textbox', { name: 'Search biomarkers' });
}

/**
 * The detail panel for a biomarker, identified by its heading
 */
export function biomarkerDetail(page: Page, name: string): Locator {
  return page
    .getByRole('main')
    .locator('.mantine-Paper-root')
    .filter({ has: page.getByRole('heading', { level: 3, name, exact: true }) });
}

export function backButton(detail: Locator): Locator {
  return detail.getByRole('button', { name: 'Back to biomarker list' });
}

/**
 * Then I should see the Biomarkers page showing the detail for "<name>"
 */
export async function expectDetailPage(page: Page, name: string): Promise<Locator> {
  await expect(biomarkersNavItem(page)).toHaveAttribute('aria-current', 'page');
  const detail = biomarkerDetail(page, name);
  await expect(detail).toBeVisible();
  return detail;
}
