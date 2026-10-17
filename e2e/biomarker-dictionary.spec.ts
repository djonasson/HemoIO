/**
 * E2E Tests for Biomarker Dictionary (features/biomarker-dictionary.feature)
 *
 * Tests the biomarker dictionary feature including:
 * - Viewing categories and biomarkers
 * - Searching biomarkers
 * - Viewing biomarker details
 * - Keyboard navigation
 */

import { test, expect, type Locator, type Page } from '@playwright/test';
import { setupOrUnlock } from './steps/app.steps';
import { waitForAnimations } from './steps/timeline.steps';

/**
 * Given I am logged into the application / And I navigate to the Biomarkers page
 */
async function openDictionary(page: Page): Promise<void> {
  await page.goto('/');
  await setupOrUnlock(page);
  await page.getByRole('navigation').getByRole('button', { name: /^Biomarkers/ }).click();
  await expect(page.getByRole('heading', { name: 'Biomarker Dictionary' })).toBeVisible();
}

function searchField(page: Page): Locator {
  return page.getByRole('textbox', { name: 'Search biomarkers' });
}

/**
 * A category's accordion control; its accessible name is "<category> <count>"
 */
function categoryControl(page: Page, category: string): Locator {
  return page.getByRole('main').getByRole('button', { name: new RegExp(`^${category} \\d+$`) });
}

/**
 * Expand a category and return its panel
 */
async function openCategory(page: Page, category: string): Promise<Locator> {
  const control = categoryControl(page, category);
  await control.click();
  await expect(control).toHaveAttribute('aria-expanded', 'true');
  const panelId = await control.getAttribute('aria-controls');
  const panel = page.locator(`[id="${panelId}"]`);
  await expect(panel).toBeVisible();
  return panel;
}

/**
 * List entries, each a button named "View details for <name>"
 */
function biomarkerItems(container: Locator): Locator {
  return container.getByRole('button', { name: /^View details for / });
}

/**
 * Then I should see "<label>" — the label is either a biomarker's name or
 * the abbreviation shown next to it, e.g. "Blood Urea Nitrogen (BUN)".
 */
async function expectBiomarkerListed(container: Locator, label: string): Promise<void> {
  // Name and abbreviation render as separate elements: match either the
  // combined text ("White Blood Cell Count (WBC)") or the abbreviation alone
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
  const byFullName = biomarkerItems(container).filter({ hasText: new RegExp(`^\\s*${escaped}`) });
  const byAbbreviation = biomarkerItems(container).filter({
    has: container.page().getByText(`(${label})`, { exact: true }),
  });
  const item = byFullName.or(byAbbreviation);
  await expect(item).toHaveCount(1);
  await expect(item).toBeVisible();
}

/**
 * The detail panel for a biomarker, identified by its heading
 */
function biomarkerDetail(page: Page, name: string): Locator {
  return page
    .getByRole('main')
    .locator('.mantine-Paper-root')
    .filter({ has: page.getByRole('heading', { level: 3, name, exact: true }) });
}

async function viewDetail(page: Page, name: string): Promise<Locator> {
  await searchField(page).fill(name);
  await page.getByRole('button', { name: `View details for ${name}`, exact: true }).click();
  const detail = biomarkerDetail(page, name);
  await expect(detail).toBeVisible();
  return detail;
}

test.describe('Biomarker Dictionary', () => {
  test.beforeEach(async ({ page }) => {
    await openDictionary(page);
  });

  test.describe('Navigation', () => {
    test('should display biomarker dictionary when navigating to Biomarkers', async ({ page }) => {
      await expect(
        page.getByRole('navigation').getByRole('button', { name: /^Biomarkers/ })
      ).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('main').getByRole('heading', { name: 'Biomarker Dictionary', level: 2 })).toBeVisible();
    });

    test('should display search field', async ({ page }) => {
      await expect(searchField(page)).toBeVisible();
      await expect(searchField(page)).toBeEditable();
      await expect(searchField(page)).toHaveValue('');
    });
  });

  test.describe('Browsing by Category', () => {
    test('should display biomarker categories', async ({ page }) => {
      for (const category of [
        'Complete Blood Count',
        'Metabolic Panel',
        'Lipid Panel',
        'Thyroid Function',
        'Iron Studies',
        'Vitamins',
      ]) {
        await expect(categoryControl(page, category)).toBeVisible();
      }
    });

    test('should expand category to show biomarkers', async ({ page }) => {
      const panel = await openCategory(page, 'Complete Blood Count');

      await expect(biomarkerItems(panel).first()).toBeVisible();
      for (const name of [
        'White Blood Cell Count (WBC)',
        'Red Blood Cell Count (RBC)',
        'Hemoglobin',
        'Hematocrit',
        'Platelet Count (PLT)',
      ]) {
        await expectBiomarkerListed(panel, name);
      }
    });

    test('should expand Metabolic Panel category', async ({ page }) => {
      const panel = await openCategory(page, 'Metabolic Panel');

      for (const name of ['Glucose', 'Creatinine', 'BUN', 'Sodium', 'Potassium']) {
        await expectBiomarkerListed(panel, name);
      }
      // Only metabolic biomarkers are listed
      await expect(panel.getByRole('button', { name: 'View details for Hemoglobin', exact: true })).toHaveCount(0);
    });

    test('should expand Lipid Panel category', async ({ page }) => {
      const panel = await openCategory(page, 'Lipid Panel');

      for (const name of ['Total Cholesterol', 'LDL Cholesterol', 'HDL Cholesterol', 'Triglycerides']) {
        await expectBiomarkerListed(panel, name);
      }
    });
  });

  test.describe('Searching', () => {
    test('should search for biomarker by name', async ({ page }) => {
      await searchField(page).fill('glucose');

      const results = biomarkerItems(page.getByRole('main'));
      await expect(page.getByRole('button', { name: 'View details for Glucose', exact: true })).toBeVisible();

      // Results are filtered: the count matches the list, and every entry
      // mentions the search term
      const count = await results.count();
      await expect(page.getByText(`${count} result${count === 1 ? '' : 's'} found`, { exact: true })).toBeVisible();
      for (const item of await results.all()) {
        await expect(item).toContainText(/gluc/i);
      }
      await expect(page.getByRole('button', { name: 'View details for Hemoglobin', exact: true })).toHaveCount(0);
      await expect(categoryControl(page, 'Complete Blood Count')).toHaveCount(0);
    });

    test('should search for biomarker by abbreviation', async ({ page }) => {
      await searchField(page).fill('WBC');

      await expectBiomarkerListed(page.getByRole('main'), 'White Blood Cell Count (WBC)');
    });

    test('should show no results message for invalid search', async ({ page }) => {
      await searchField(page).fill('xyz123');

      await expect(page.getByText('0 results found', { exact: true })).toBeVisible();
      await expect(page.getByText('No biomarkers found matching "xyz123"', { exact: true })).toBeVisible();
      await expect(biomarkerItems(page.getByRole('main'))).toHaveCount(0);
    });

    test('should clear search and return to category view', async ({ page }) => {
      await searchField(page).fill('glucose');
      await expect(page.getByText(/^\d+ results? found$/)).toBeVisible();
      await expect(categoryControl(page, 'Complete Blood Count')).toHaveCount(0);

      await searchField(page).clear();

      await expect(page.getByText(/^\d+ results? found$/)).toHaveCount(0);
      for (const category of ['Complete Blood Count', 'Metabolic Panel', 'Lipid Panel']) {
        await expect(categoryControl(page, category)).toBeVisible();
      }
    });
  });

  test.describe('Viewing Details', () => {
    test('should show biomarker details when clicking on a biomarker', async ({ page }) => {
      const detail = await viewDetail(page, 'Glucose');

      // Name, standard reference range, units and description
      await expect(detail.getByRole('heading', { level: 3 })).toHaveText('Glucose');
      await expect(detail.getByText('Reference Range', { exact: true })).toBeVisible();
      await expect(detail.getByText('70 - 100 mg/dL', { exact: true })).toBeVisible();
      await expect(detail.getByText('Units', { exact: true })).toBeVisible();
      await expect(detail.getByText('mg/dL', { exact: true })).toBeVisible();
      await expect(detail.getByText('Description', { exact: true })).toBeVisible();
      await expect(
        detail.getByText('Blood sugar level, primary energy source for cells.', { exact: true })
      ).toBeVisible();
    });

    test('should show category badge on biomarker', async ({ page }) => {
      const detail = await viewDetail(page, 'Glucose');
      await expect(detail.getByText('Metabolic Panel', { exact: true })).toBeVisible();
    });

    test('should show what high and low values may indicate', async ({ page }) => {
      const detail = await viewDetail(page, 'Glucose');

      await expect(detail.getByText('What Abnormal Values May Indicate', { exact: true })).toBeVisible();
      const high = detail.getByRole('alert').filter({ hasText: 'High Values' });
      await expect(high).toContainText('May indicate diabetes or prediabetes');
      const low = detail.getByRole('alert').filter({ hasText: 'Low Values' });
      await expect(low).toContainText('May indicate hypoglycemia');
    });

    test('should show specimen type in biomarker details', async ({ page }) => {
      const detail = await viewDetail(page, 'Glucose');
      await expect(detail.getByText('Specimen: Serum', { exact: true })).toBeVisible();
    });

    test('should show LOINC code with link in biomarker details', async ({ page }) => {
      const detail = await viewDetail(page, 'Glucose');

      const loincLink = detail.getByRole('link', { name: '2345-7' });
      await expect(loincLink).toBeVisible();
      await expect(loincLink).toHaveAttribute('href', 'https://loinc.org/2345-7');
      await expect(loincLink).toHaveAttribute('target', '_blank');
      await expect(loincLink).toHaveAttribute('rel', /noopener/);
    });

    test('should show specimen type for whole blood biomarkers', async ({ page }) => {
      const detail = await viewDetail(page, 'Hemoglobin');
      await expect(detail.getByText('Specimen: Whole Blood', { exact: true })).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('should be keyboard navigable', async ({ page }) => {
      // Tab from the search field reaches the category controls
      await searchField(page).focus();
      await page.keyboard.press('Tab');
      const cbc = categoryControl(page, 'Complete Blood Count');
      await expect(cbc).toBeFocused();

      // Enter expands the category; Tab moves into its biomarkers
      await page.keyboard.press('Enter');
      await expect(cbc).toHaveAttribute('aria-expanded', 'true');
      // Items inside the collapsing panel cannot take focus until it has opened
      const panel = page.locator(`[id="${await cbc.getAttribute('aria-controls')}"]`);
      await waitForAnimations(panel.locator('xpath=..'));
      await page.keyboard.press('Tab');
      const wbc = page.getByRole('button', { name: 'View details for White Blood Cell Count', exact: true });
      await expect(wbc).toBeFocused();

      // Enter opens the detail; its close button is reachable too
      await page.keyboard.press('Enter');
      const detail = biomarkerDetail(page, 'White Blood Cell Count');
      await expect(detail).toBeVisible();
      const close = detail.getByRole('button', { name: 'Close biomarker detail' });
      await close.focus();
      await page.keyboard.press('Enter');
      await expect(detail).toHaveCount(0);
    });

    test('search input should have accessible label', async ({ page }) => {
      // Located by its accessible name, which screen readers announce
      await expect(searchField(page)).toBeVisible();
      await expect(searchField(page)).toHaveAccessibleName('Search biomarkers');
    });

    test('categories should be expandable with keyboard', async ({ page }) => {
      const control = categoryControl(page, 'Complete Blood Count');
      await expect(control).toHaveAttribute('aria-expanded', 'false');

      await control.focus();
      await page.keyboard.press('Enter');

      await expect(control).toHaveAttribute('aria-expanded', 'true');
      await expect(
        page.getByRole('button', { name: 'View details for Hemoglobin', exact: true })
      ).toBeVisible();
    });
  });
});
