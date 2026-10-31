/**
 * E2E Tests for Biomarker Dictionary (features/biomarker-dictionary.feature)
 *
 * Tests the biomarker dictionary feature including:
 * - Viewing categories and biomarkers
 * - Searching biomarkers
 * - Viewing biomarker details
 * - Keyboard navigation
 */

import { test, expect } from './fixtures';
import type { Locator, Page } from '@playwright/test';
import { setupOrUnlock, unlockApp } from './steps/app.steps';
import { waitForAnimations } from './steps/timeline.steps';
import { biomarkerSelect, goToTrends } from './steps/trends.steps';
import { backButton, biomarkerDetail, goToDictionary, searchField } from './steps/dictionary.steps';
import { SEED_LAB_RESULTS, seedLabData } from './steps/data.steps';
import { storeTestValueAsEarlierVersion } from './steps/dataAtRest.steps';
import { GLUCOSE, seedMeasurements } from './steps/unitConversion.steps';

/**
 * Given I am logged into the application / And I navigate to the Biomarkers page
 */
async function openDictionary(page: Page): Promise<void> {
  await page.goto('/');
  await setupOrUnlock(page);
  await goToDictionary(page);
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

    test('should search for biomarker by its abbreviation in the plural', async ({ page }) => {
      await searchField(page).fill('WBCs');

      await expectBiomarkerListed(page.getByRole('main'), 'White Blood Cell Count (WBC)');
    });

    test('should ignore extra spaces in a search', async ({ page }) => {
      await searchField(page).fill('  white   blood cell ');

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

      // Enter opens the detail; its Back button returns focus to the item
      await page.keyboard.press('Enter');
      const detail = biomarkerDetail(page, 'White Blood Cell Count');
      await expect(detail).toBeVisible();
      await backButton(detail).focus();
      await page.keyboard.press('Enter');
      await expect(detail).toHaveCount(0);
      await expect(wbc).toBeFocused();
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

  test.describe('Related Biomarkers', () => {
    test('should list related biomarkers and open their details', async ({ page }) => {
      const detail = await viewDetail(page, 'Glucose');
      const related = detail.getByRole('region', { name: 'Related biomarkers' });
      const a1c = related.getByRole('button', { name: 'Hemoglobin A1c (HbA1c)' });
      await expect(a1c).toBeVisible();

      await a1c.click();
      const a1cDetail = biomarkerDetail(page, 'Hemoglobin A1c');
      await expect(a1cDetail).toBeVisible();
      // Relations go both ways
      await expect(
        a1cDetail
          .getByRole('region', { name: 'Related biomarkers' })
          .getByRole('button', { name: /^Glucose/ })
      ).toBeVisible();
    });
  });

  test.describe('Personal Target', () => {
    test('should show a personal target next to the standard range', async ({ page }) => {
      // Seeded through a backup restore with no page reload afterwards, so
      // this also pins that a restore shows its preferences at once.
      // Glucose is legacy ID 22 in a schema-version-1 backup
      await seedMeasurements(
        page,
        [{ day: '2024-01-15', biomarker: GLUCOSE, value: 95, unit: 'mg/dL' }],
        {
          userPreferences: {
            unitPreferences: {},
            personalTargets: { 22: { low: 70, high: 90 } },
            theme: 'system',
            dateFormat: 'MM/DD/YYYY',
          },
        }
      );
      await goToDictionary(page);

      const detail = await viewDetail(page, 'Glucose');
      await expect(detail.getByText('70 - 100 mg/dL', { exact: true })).toBeVisible();
      const target = detail.getByRole('region', { name: 'Personal target' });
      await expect(target.getByText('Your target', { exact: true })).toBeVisible();
      await expect(target.getByText('70 - 90 mg/dL', { exact: true })).toBeVisible();
    });

    test('should set a personal target from the detail', async ({ page }) => {
      const detail = await viewDetail(page, 'Glucose');
      const target = detail.getByRole('region', { name: 'Personal target' });
      await expect(target.getByText('Using standard range', { exact: true })).toBeVisible();

      await target.getByRole('button', { name: 'Edit personal target' }).click();
      const dialog = page.getByRole('dialog', { name: 'Set Personal Target for Glucose' });
      await dialog.getByLabel('Personal target low value').fill('70');
      await dialog.getByLabel('Personal target high value').fill('90');
      await dialog.getByRole('button', { name: 'Save Target' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(target.getByText('70 - 90 mg/dL', { exact: true })).toBeVisible();

      // Saved: still there in a new session
      await page.reload();
      await unlockApp(page);
      await goToDictionary(page);
      const again = await viewDetail(page, 'Glucose');
      await expect(
        again
          .getByRole('region', { name: 'Personal target' })
          .getByText('70 - 90 mg/dL', { exact: true })
      ).toBeVisible();
    });
  });

  test.describe('Back to the List', () => {
    test('should return to the search results with the search kept', async ({ page }) => {
      await searchField(page).fill('chol');
      const ldl = page.getByRole('button', { name: 'View details for LDL Cholesterol', exact: true });
      await ldl.click();
      const detail = biomarkerDetail(page, 'LDL Cholesterol');
      await expect(detail).toBeVisible();
      // The detail replaces the list
      await expect(searchField(page)).toBeHidden();

      await backButton(detail).click();

      await expect(detail).toHaveCount(0);
      await expect(searchField(page)).toHaveValue('chol');
      await expect(ldl).toBeFocused();
    });

    test('should return to the open category at the same scroll position', async ({ page }) => {
      const panel = await openCategory(page, 'Complete Blood Count');
      const item = panel.getByRole('button', {
        name: 'View details for Basophils Percentage',
        exact: true,
      });
      // Read the position only once the panel has finished expanding, or the
      // click scrolls the page again (Firefox's animation outlasts the read)
      await waitForAnimations(panel.locator('xpath=..'));
      await item.scrollIntoViewIfNeeded();
      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY).toBeGreaterThan(0);

      await item.click();
      const detail = biomarkerDetail(page, 'Basophils Percentage');
      await expect(detail).toBeVisible();
      await backButton(detail).click();

      await expect(categoryControl(page, 'Complete Blood Count')).toHaveAttribute(
        'aria-expanded',
        'true'
      );
      await expect(item).toBeFocused();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollY);
    });

    test('should return to the list, not the previous detail, after related biomarkers', async ({
      page,
    }) => {
      const detail = await viewDetail(page, 'Glucose');
      await detail
        .getByRole('region', { name: 'Related biomarkers' })
        .getByRole('button', { name: 'Hemoglobin A1c (HbA1c)' })
        .click();
      const a1c = biomarkerDetail(page, 'Hemoglobin A1c');
      await backButton(a1c).click();

      await expect(searchField(page)).toHaveValue('Glucose');
      await expect(
        page.getByRole('button', { name: 'View details for Glucose', exact: true })
      ).toBeFocused();
    });
  });

  test.describe('Your Results', () => {
    test('should summarise my results and link to the trend', async ({ page }) => {
      await seedMeasurements(page, [
        { day: '2024-01-15', biomarker: GLUCOSE, value: 95, unit: 'mg/dL', low: 70, high: 100 },
        { day: '2024-02-20', biomarker: GLUCOSE, value: 120, unit: 'mg/dL', low: 70, high: 100 },
      ]);
      await goToDictionary(page);

      const detail = await viewDetail(page, 'Glucose');
      const yours = detail.getByRole('region', { name: 'Your results' });
      await expect(yours.getByText('120 mg/dL', { exact: true })).toBeVisible();
      await expect(yours.getByText('Feb 20, 2024', { exact: true })).toBeVisible();
      await expect(yours.getByText('High', { exact: true })).toBeVisible();
      await expect(yours.getByText('2 results', { exact: true })).toBeVisible();

      await yours.getByRole('button', { name: 'View trend' }).click();
      await expect(
        page.getByRole('main').getByRole('heading', { name: 'Trends', level: 2 })
      ).toBeVisible();
      await expect(biomarkerSelect(page)).toHaveValue(/^Glucose \(/);
    });

    test('should say when I have no recorded values', async ({ page }) => {
      const detail = await viewDetail(page, 'Ferritin');
      const yours = detail.getByRole('region', { name: 'Your results' });
      await expect(
        yours.getByText('You have no recorded values for Ferritin', { exact: true })
      ).toBeVisible();
      await expect(yours.getByRole('button', { name: 'View trend' })).toHaveCount(0);
      // Reference information is still shown
      await expect(detail.getByText('Reference Range', { exact: true })).toBeVisible();
    });
  });
});

test.describe('Values filed under the wrong test by earlier versions', () => {
  // Schema version 1 backup IDs: 24 is Blood Urea Nitrogen, 60 Urine Blood
  const at = '2024-01-15T10:00:00.000Z';
  const misfiled = (id: number, biomarkerId: number, rawText: string, value: number, unit: string) => ({
    id, labResultId: 1, biomarkerId, rawText, value, unit, createdAt: at, updatedAt: at,
  });

  async function trendOptions(page: Page): Promise<string[]> {
    await goToTrends(page);
    await biomarkerSelect(page).click();
    return page.getByRole('option').allTextContents();
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
  });

  test('files values from an old backup under the test they are', async ({ page }) => {
    // Scenario: A backup from before urea and urine red cells had their own tests
    await seedLabData(page, {
      labResults: [SEED_LAB_RESULTS[0]],
      testValues: [
        misfiled(1, 24, 'Urea', 18, 'mg/dL'),
        misfiled(2, 60, 'Eritrociti (urine)', 15, 'cells/µL'),
      ],
    });

    const options = await trendOptions(page);
    expect(options).toEqual(expect.arrayContaining(['Urea (1 value)', 'Urine Red Blood Cells (1 value)']));
    expect(options.join()).not.toMatch(/Blood Urea Nitrogen|Urine Blood/);
  });

  test('refiles values an earlier version stored under the wrong test', async ({ page }) => {
    // Scenario: Values an earlier version filed under the wrong test
    await seedLabData(page, { labResults: [SEED_LAB_RESULTS[0]], testValues: [] });
    await storeTestValueAsEarlierVersion(page, {
      labResultId: 1, biomarkerKey: 'urine-blood', value: 15, unit: 'cells/µL',
    });

    await page.reload();
    await unlockApp(page);

    const options = await trendOptions(page);
    expect(options).toContain('Urine Red Blood Cells (1 value)');
    expect(options.join()).not.toMatch(/Urine Blood/);
  });
});

