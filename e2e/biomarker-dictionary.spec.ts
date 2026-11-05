/**
 * E2E Tests for Biomarker Dictionary (features/biomarker-dictionary.feature)
 *
 * Tests the biomarker dictionary feature including:
 * - Viewing LOINC classes and their tests
 * - Searching the tests HemoIO lists and the whole LOINC catalog
 * - Viewing biomarker details
 * - Keyboard navigation
 */

import { test, expect } from './fixtures';
import type { Locator, Page } from '@playwright/test';
import { setupOrUnlock, unlockApp } from './steps/app.steps';
import { waitForAnimations } from './steps/timeline.steps';
import {
  GLUCOSE as TREND_GLUCOSE,
  biomarkerSelect,
  goToTrends,
  referenceLink,
  seedVisits,
  selectBiomarker,
} from './steps/trends.steps';
import {
  backButton,
  biomarkerDetail,
  biomarkersNavItem,
  expectDetailPage,
  goToDictionary,
  searchField,
  viewDetail,
} from './steps/dictionary.steps';
import { GLUCOSE, seedMeasurements } from './steps/unitConversion.steps';

/**
 * Given I am logged into the application / And I navigate to the Biomarkers page
 */
async function openDictionary(page: Page): Promise<void> {
  await page.goto('/');
  await setupOrUnlock(page);
  await goToDictionary(page);
}

/** Glucose in blood (2339-0): a LOINC test HemoIO has no description of, named by LOINC's short name */
const UNDESCRIBED = { key: '2339-0', name: 'Glucose Bld-mCnc', longName: 'Glucose [Mass/volume] in Blood' };

/**
 * A LOINC class's accordion control; its accessible name is "<class> <count>"
 */
function categoryControl(page: Page, category: string): Locator {
  return page.getByRole('main').getByRole('button', { name: new RegExp(`^${category} \\d+$`) });
}

/**
 * Expand a class and return its panel
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
 * Then I should see "<name>" — one list entry of that name
 */
async function expectBiomarkerListed(container: Locator, name: string): Promise<void> {
  const item = container.getByRole('button', { name: `View details for ${name}`, exact: true });
  await expect(item).toHaveCount(1);
  await expect(item).toBeVisible();
}

test.describe('Biomarker Dictionary', () => {
  test.beforeEach(async ({ page }) => {
    await openDictionary(page);
  });

  test.describe('Navigation', () => {
    test('should display biomarker dictionary when navigating to Biomarkers', async ({ page }) => {
      await expect(biomarkersNavItem(page)).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('main').getByRole('heading', { name: 'Biomarker Dictionary', level: 2 })).toBeVisible();
    });

    test('should display search field', async ({ page }) => {
      await expect(searchField(page)).toBeVisible();
      await expect(searchField(page)).toBeEditable();
      await expect(searchField(page)).toHaveValue('');
    });
  });

  test.describe('Browsing by LOINC class', () => {
    test('should display the LOINC classes', async ({ page }) => {
      // Scenario: View biomarker groups by LOINC class
      for (const category of ['Chemistry', 'Hematology', 'Urinalysis', 'Fertility']) {
        await expect(categoryControl(page, category)).toBeVisible();
      }
    });

    test('should expand Hematology to show its tests', async ({ page }) => {
      // Scenario: Browse the biomarkers of a class
      const panel = await openCategory(page, 'Hematology');

      await expect(biomarkerItems(panel).first()).toBeVisible();
      for (const name of [
        'White Blood Cell Count',
        'Red Blood Cell Count',
        'Hemoglobin',
        'Hematocrit',
        'Platelet Count',
      ]) {
        await expectBiomarkerListed(panel, name);
      }
      await expect(panel.getByRole('button', { name: 'View details for Glucose', exact: true })).toHaveCount(0);
    });

    test('should expand Chemistry', async ({ page }) => {
      // Scenario: Browse chemistry biomarkers
      const panel = await openCategory(page, 'Chemistry');

      for (const name of ['Glucose', 'Creatinine', 'Blood Urea Nitrogen', 'Sodium', 'Total Cholesterol']) {
        await expectBiomarkerListed(panel, name);
      }
      await expect(panel.getByRole('button', { name: 'View details for Hemoglobin', exact: true })).toHaveCount(0);
    });

    test('lists the tests I have values for beside the tests HemoIO describes', async ({ page }) => {
      // Scenario: The list shows the tests HemoIO describes and the tests I have values for
      await seedMeasurements(page, [
        { day: '2024-01-15', biomarker: { key: UNDESCRIBED.key, name: 'Glicemia' }, value: 90, unit: 'mg/dL' },
      ]);
      await goToDictionary(page);

      const panel = await openCategory(page, 'Chemistry');
      await expectBiomarkerListed(panel, 'Glucose');
      const item = panel.getByRole('button', { name: `View details for ${UNDESCRIBED.name}`, exact: true });
      await expect(item).toBeVisible();
      // No description: LOINC's long name in its place
      await expect(item).toContainText(UNDESCRIBED.longName);
    });
  });

  test.describe('Searching', () => {
    test('should search for biomarker by name', async ({ page }) => {
      // Scenario: Search for a biomarker by name
      await searchField(page).fill('glucose');

      const results = biomarkerItems(page.getByRole('main'));
      // HemoIO's own test first, then the catalog's
      await expect(results.first()).toHaveAccessibleName('View details for Glucose');
      const count = await results.count();
      await expect(page.getByText(`${count} result${count === 1 ? '' : 's'} found`, { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'View details for Hemoglobin', exact: true })).toHaveCount(0);
      await expect(categoryControl(page, 'Chemistry')).toHaveCount(0);
    });

    test('should search for biomarker by abbreviation', async ({ page }) => {
      // Scenario: Search for a biomarker by abbreviation
      await searchField(page).fill('WBC');

      await expectBiomarkerListed(page.getByRole('main'), 'White Blood Cell Count');
    });

    test('finds a test of the whole LOINC catalog, named by LOINC', async ({ page }) => {
      // Scenario: Search finds tests across the whole LOINC catalog
      await searchField(page).fill('glucose blood');

      await expectBiomarkerListed(page.getByRole('main'), UNDESCRIBED.name);
    });

    test('should ignore extra spaces in a search', async ({ page }) => {
      // Scenario: Extra spaces in a search do not change the results
      await searchField(page).fill('  white   blood cell ');

      await expectBiomarkerListed(page.getByRole('main'), 'White Blood Cell Count');
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
      await expect(categoryControl(page, 'Chemistry')).toHaveCount(0);

      await searchField(page).clear();

      await expect(page.getByText(/^\d+ results? found$/)).toHaveCount(0);
      for (const category of ['Chemistry', 'Hematology', 'Urinalysis']) {
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

    test("should show the test's LOINC class", async ({ page }) => {
      const detail = await viewDetail(page, 'Glucose');
      await expect(detail.getByText('Chemistry', { exact: true })).toBeVisible();
    });

    test('should show what high and low values may indicate', async ({ page }) => {
      const detail = await viewDetail(page, 'Glucose');

      await expect(detail.getByText('What Abnormal Values May Indicate', { exact: true })).toBeVisible();
      const high = detail.getByRole('alert').filter({ hasText: 'High Values' });
      await expect(high).toContainText('May indicate diabetes or prediabetes');
      const low = detail.getByRole('alert').filter({ hasText: 'Low Values' });
      await expect(low).toContainText('May indicate hypoglycemia');
    });

    test('should show the sample in biomarker details', async ({ page }) => {
      // Scenario: User sees the sample in biomarker details
      const detail = await viewDetail(page, 'Glucose');
      await expect(detail.getByText('Sample: Serum/Plasma', { exact: true })).toBeVisible();
    });

    test('should show LOINC code with link in biomarker details', async ({ page }) => {
      // Scenario: User sees LOINC code in biomarker details
      const detail = await viewDetail(page, 'Glucose');

      const loincLink = detail.getByRole('link', { name: '2345-7' });
      await expect(loincLink).toBeVisible();
      await expect(loincLink).toHaveAttribute('href', 'https://loinc.org/2345-7');
      await expect(loincLink).toHaveAttribute('target', '_blank');
      await expect(loincLink).toHaveAttribute('rel', /noopener/);
      await expect(detail.getByText('Glucose [Mass/volume] in Serum or Plasma')).toBeVisible();
    });

    test('shows a test HemoIO has no description of by its LOINC names', async ({ page }) => {
      // Scenario: A test HemoIO has no description of
      const detail = await viewDetail(page, UNDESCRIBED.name);

      await expect(detail.getByRole('link', { name: UNDESCRIBED.key })).toBeVisible();
      await expect(detail.getByText(UNDESCRIBED.longName, { exact: true })).toBeVisible();
      await expect(detail.getByText('No description yet', { exact: true })).toBeVisible();
      await expect(detail.getByText('Reference Range', { exact: true })).toHaveCount(0);
    });

    test('lists the other LOINC codes of the test', async ({ page }) => {
      // Scenario: View the other LOINC codes of the test
      const detail = await viewDetail(page, 'Glucose');
      const codes = detail.getByRole('region', { name: 'Other LOINC codes' });

      await expect(
        codes.getByText('Glucose [Moles/volume] in Serum or Plasma · 14749-6', { exact: true })
      ).toBeVisible();
    });

    test('should show the sample of whole blood tests', async ({ page }) => {
      const detail = await viewDetail(page, 'Hemoglobin');
      await expect(detail.getByText('Sample: Whole Blood', { exact: true })).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('should be keyboard navigable', async ({ page }) => {
      // Tab from the search field reaches the class controls, Chemistry first
      await searchField(page).focus();
      await page.keyboard.press('Tab');
      const chemistry = categoryControl(page, 'Chemistry');
      await expect(chemistry).toBeFocused();

      // Enter expands the class; Tab moves into its tests
      await page.keyboard.press('Enter');
      await expect(chemistry).toHaveAttribute('aria-expanded', 'true');
      // Items inside the collapsing panel cannot take focus until it has opened
      const panel = page.locator(`[id="${await chemistry.getAttribute('aria-controls')}"]`);
      await waitForAnimations(panel.locator('xpath=..'));
      await page.keyboard.press('Tab');
      const first = biomarkerItems(panel).first();
      await expect(first).toBeFocused();
      const name = (await first.getAttribute('aria-label'))!.replace('View details for ', '');

      // Enter opens the detail; its Back button returns focus to the item
      await page.keyboard.press('Enter');
      const detail = biomarkerDetail(page, name);
      await expect(detail).toBeVisible();
      await backButton(detail).focus();
      await page.keyboard.press('Enter');
      await expect(detail).toHaveCount(0);
      await expect(first).toBeFocused();
    });

    test('search input should have accessible label', async ({ page }) => {
      // Located by its accessible name, which screen readers announce
      await expect(searchField(page)).toBeVisible();
      await expect(searchField(page)).toHaveAccessibleName('Search biomarkers');
    });

    test('categories should be expandable with keyboard', async ({ page }) => {
      const control = categoryControl(page, 'Hematology');
      await expect(control).toHaveAttribute('aria-expanded', 'false');

      await control.focus();
      await page.keyboard.press('Enter');

      await expect(control).toHaveAttribute('aria-expanded', 'true');
      await expect(
        page.getByRole('button', { name: 'View details for Hemoglobin', exact: true })
      ).toBeVisible();
    });
  });

  test.describe('Personal Target', () => {
    test('should show a personal target next to the standard range', async ({ page }) => {
      // Seeded through a backup restore with no page reload afterwards, so
      // this also pins that a restore shows its preferences at once.
      await seedMeasurements(
        page,
        [{ day: '2024-01-15', biomarker: GLUCOSE, value: 95, unit: 'mg/dL' }],
        {
          userPreferences: {
            unitPreferences: {},
            personalTargets: { '2345-7': { low: 70, high: 90 } },
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
      const panel = await openCategory(page, 'Hematology');
      const item = panel.getByRole('button', {
        name: 'View details for White Blood Cell Count',
        exact: true,
      });
      // Read the position only once the panel has finished expanding, or the
      // click scrolls the page again (Firefox's animation outlasts the read)
      await waitForAnimations(panel.locator('xpath=..'));
      await item.scrollIntoViewIfNeeded();
      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY).toBeGreaterThan(0);

      await item.click();
      const detail = biomarkerDetail(page, 'White Blood Cell Count');
      await expect(detail).toBeVisible();
      await backButton(detail).click();

      await expect(categoryControl(page, 'Hematology')).toHaveAttribute(
        'aria-expanded',
        'true'
      );
      await expect(item).toBeFocused();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollY);
    });

    test('shows the list when Biomarkers is chosen in the menu', async ({ page }) => {
      const detail = await viewDetail(page, 'LDL Cholesterol');

      await goToDictionary(page);

      await expect(detail).toHaveCount(0);
      await expect(searchField(page)).toBeVisible();
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

test.describe('A biomarker page opened from another page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    await seedVisits(page, [
      { date: '2024-01-15', values: [{ biomarker: TREND_GLUCOSE, value: 92 }] },
      { date: '2024-03-15', values: [{ biomarker: TREND_GLUCOSE, value: 110 }] },
    ]);
    await goToTrends(page);
    await selectBiomarker(page, 'Glucose');
  });

  test('starts at the top, with its back button in view', async ({ page }) => {
    const link = referenceLink(page, 'Glucose');
    const header = (await page.getByRole('banner').boundingBox())!;
    const scrollRoom = () =>
      page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    // Scrolled a little: further, the shorter page in between scrolls back by
    // itself. Both pages are tall enough to keep it, so only the app resets it.
    await expect.poll(scrollRoom).toBeGreaterThan(120);
    await page.mouse.wheel(0, 120);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(60);

    await link.click();

    const detail = await expectDetailPage(page, 'Glucose');
    await expect.poll(scrollRoom).toBeGreaterThan(120);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    const back = (await backButton(detail).boundingBox())!;
    expect(back.y).toBeGreaterThanOrEqual(header.y + header.height);
  });

  test('Back shows the list from the top, with its search focused', async ({ page }) => {
    await referenceLink(page, 'Glucose').click();
    const detail = await expectDetailPage(page, 'Glucose');

    await backButton(detail).click();

    await expect(searchField(page)).toBeFocused();
    await expect(searchField(page)).toHaveValue('');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });
});

