/**
 * Step definitions for features/biomarker-dictionary.feature, shared with
 * the features that open the Biomarkers page or a biomarker's detail
 */

import { expect, type Locator, type Page } from '@playwright/test';
import { openFromMenu } from './app.steps';

/**
 * The Biomarkers item in the main menu
 */
export function biomarkersNavItem(page: Page): Locator {
  return page.getByRole('navigation').getByRole('button', { name: /^Biomarkers/ });
}

/**
 * When I navigate to the Biomarkers page
 */
export async function goToDictionary(page: Page): Promise<void> {
  await openFromMenu(page, 'Biomarkers');
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

/**
 * The detail's button back to the biomarker list
 */
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

/**
 * When I view the detail for "<name>" — searched for, then opened from the list
 */
export async function viewDetail(page: Page, name: string): Promise<Locator> {
  await searchField(page).fill(name);
  await page.getByRole('button', { name: `View details for ${name}`, exact: true }).click();
  const detail = biomarkerDetail(page, name);
  await expect(detail).toBeVisible();
  return detail;
}
