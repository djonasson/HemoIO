/**
 * E2E Tests for Biomarker Dictionary
 *
 * Tests the biomarker dictionary feature including:
 * - Viewing categories and biomarkers
 * - Searching biomarkers
 * - Viewing biomarker details
 * - Keyboard navigation
 */

import { test, expect, type Page } from '@playwright/test';

// Test data constants
const TEST_PASSWORD = 'TestPassword123!';

/**
 * Helper to complete first-run setup
 */
async function completeSetup(page: Page, password: string = TEST_PASSWORD) {
  await page.getByPlaceholder(/enter your password/i).fill(password);
  await page.getByPlaceholder(/confirm your password/i).fill(password);
  await page.getByRole('button', { name: 'Go to next step' }).click();
  await page.getByRole('button', { name: 'Go to next step' }).click();
  await page.getByRole('button', { name: 'Go to next step' }).click();
  await page.getByRole('button', { name: 'Complete setup and get started' }).click();
}

/**
 * Helper to unlock the application
 */
async function unlockApp(page: Page, password: string = TEST_PASSWORD) {
  await page.getByRole('textbox', { name: /password/i }).fill(password);
  await page.getByRole('button', { name: /unlock/i }).click();
}

/**
 * Helper to detect if app needs setup or just unlock
 */
async function isSetupNeeded(page: Page): Promise<boolean> {
  const hasSetupStepper = await page
    .locator('.mantine-Stepper-root')
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  const hasSetupText = await page
    .getByText(/set up your password|create.*password/i)
    .isVisible({ timeout: 500 })
    .catch(() => false);
  return hasSetupStepper || hasSetupText;
}

/**
 * Helper to setup or unlock as needed
 */
async function setupOrUnlock(page: Page, password: string = TEST_PASSWORD) {
  const needsSetup = await isSetupNeeded(page);
  if (needsSetup) {
    await completeSetup(page, password);
  } else {
    await unlockApp(page, password);
  }
}

/**
 * Helper to navigate to biomarkers page
 */
async function navigateToBiomarkers(page: Page) {
  await page.locator('nav').getByText('Biomarkers', { exact: true }).click();
}

test.describe('Biomarker Dictionary', () => {
  test.describe('Navigation', () => {
    test('should display biomarker dictionary when navigating to Biomarkers', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToBiomarkers(page);

      // Should see the Biomarker Dictionary title
      await expect(page.getByRole('heading', { name: 'Biomarker Dictionary' })).toBeVisible();
    });

    test('should display search field', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToBiomarkers(page);

      // Should see the search input
      await expect(page.locator('input[aria-label="Search biomarkers"]')).toBeVisible();
    });
  });

  test.describe('Browsing by Category', () => {
    test('should display biomarker categories', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToBiomarkers(page);

      // Should see category accordion items
      await expect(page.getByText('Complete Blood Count')).toBeVisible();
      await expect(page.getByText('Metabolic Panel')).toBeVisible();
      await expect(page.getByText('Lipid Panel')).toBeVisible();
    });

    test('should expand category to show biomarkers', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToBiomarkers(page);

      // Click on Complete Blood Count category
      await page.getByText('Complete Blood Count').click();

      // Should see biomarkers in that category
      await expect(page.getByText('Hemoglobin').first()).toBeVisible();
    });

    test('should expand Metabolic Panel category', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToBiomarkers(page);

      // Click on Metabolic Panel category
      await page.getByText('Metabolic Panel').click();

      // Should see biomarkers in that category
      await expect(page.getByText('Glucose').first()).toBeVisible();
      await expect(page.getByText('Creatinine').first()).toBeVisible();
    });

    test('should expand Lipid Panel category', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToBiomarkers(page);

      // Click on Lipid Panel category
      await page.getByText('Lipid Panel').click();

      // Should see biomarkers in that category
      await expect(page.getByText('Total Cholesterol').first()).toBeVisible();
    });
  });

  test.describe('Searching', () => {
    test('should search for biomarker by name', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToBiomarkers(page);

      // Type in search field
      await page.locator('input[aria-label="Search biomarkers"]').fill('glucose');

      // Should see search results
      await expect(page.getByText(/\d+ results? found/)).toBeVisible();
      await expect(page.getByText('Glucose').first()).toBeVisible();
    });

    test('should search for biomarker by abbreviation', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToBiomarkers(page);

      // Type abbreviation in search field
      await page.locator('input[aria-label="Search biomarkers"]').fill('WBC');

      // Should see White Blood Cells in results
      await expect(page.getByText(/White Blood Cells|WBC/i).first()).toBeVisible();
    });

    test('should show no results message for invalid search', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToBiomarkers(page);

      // Type invalid search term
      await page.locator('input[aria-label="Search biomarkers"]').fill('xyz123');

      // Should see no results message
      await expect(page.getByText(/No biomarkers found/i)).toBeVisible();
    });

    test('should clear search and return to category view', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToBiomarkers(page);

      // Search for something
      const searchInput = page.locator('input[aria-label="Search biomarkers"]');
      await searchInput.fill('glucose');

      // Verify search results are shown
      await expect(page.getByText(/\d+ results? found/)).toBeVisible();

      // Clear search
      await searchInput.clear();

      // Should see categories again
      await expect(page.getByText('Complete Blood Count')).toBeVisible();
    });
  });

  test.describe('Viewing Details', () => {
    test('should show biomarker details when clicking on a biomarker', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToBiomarkers(page);

      // Search for glucose to find it easily
      await page.locator('input[aria-label="Search biomarkers"]').fill('glucose');
      await page.getByText('Glucose').first().click();

      // Should show details panel (depends on implementation)
      // Look for unit or reference range info
      await expect(page.getByText(/mg\/dL|mmol\/L/).first()).toBeVisible({ timeout: 5000 });
    });

    test('should show category badge on biomarker', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToBiomarkers(page);

      // Expand a category
      await page.getByText('Metabolic Panel').click();

      // Should see biomarkers with unit badges
      await expect(page.locator('.mantine-Badge-root').first()).toBeVisible();
    });

    test('should show specimen type in biomarker details', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToBiomarkers(page);

      // Search for glucose (which has specimenType: 'serum')
      await page.locator('input[aria-label="Search biomarkers"]').fill('glucose');
      await page.getByText('Glucose').first().click();

      // Should show specimen type in details
      await expect(page.getByText(/Specimen:\s*Serum/i)).toBeVisible({ timeout: 5000 });
    });

    test('should show LOINC code with link in biomarker details', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToBiomarkers(page);

      // Search for glucose (which has loincCode: '2345-7')
      await page.locator('input[aria-label="Search biomarkers"]').fill('glucose');
      await page.getByText('Glucose').first().click();

      // Should show LOINC code
      await expect(page.getByText('2345-7')).toBeVisible({ timeout: 5000 });

      // LOINC code should be a link to loinc.org
      const loincLink = page.getByRole('link', { name: /2345-7/i });
      await expect(loincLink).toHaveAttribute('href', 'https://loinc.org/2345-7');
      await expect(loincLink).toHaveAttribute('target', '_blank');
    });

    test('should show specimen type for whole blood biomarkers', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToBiomarkers(page);

      // Search for hemoglobin (which has specimenType: 'whole-blood')
      await page.locator('input[aria-label="Search biomarkers"]').fill('hemoglobin');
      await page.getByText('Hemoglobin').first().click();

      // Should show "Whole Blood" as specimen type
      await expect(page.getByText(/Specimen:\s*Whole Blood/i)).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Accessibility', () => {
    test('should be keyboard navigable', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToBiomarkers(page);

      // Focus the search input directly
      const searchInput = page.locator('input[aria-label="Search biomarkers"]');
      await searchInput.focus();

      // Search input should be focused
      await expect(searchInput).toBeFocused();

      // Should be able to type in it
      await page.keyboard.type('glucose');
      await expect(searchInput).toHaveValue('glucose');
    });

    test('search input should have accessible label', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToBiomarkers(page);

      // Search input should have aria-label
      const searchInput = page.locator('input[aria-label="Search biomarkers"]');
      await expect(searchInput).toBeVisible();
      await expect(searchInput).toHaveAttribute('aria-label', 'Search biomarkers');
    });

    test('categories should be expandable with keyboard', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToBiomarkers(page);

      // Focus the first accordion button directly and press Enter
      const firstAccordionButton = page.locator('.mantine-Accordion-control').first();
      await firstAccordionButton.focus();
      await page.keyboard.press('Enter');

      // Should see biomarkers in expanded category
      await expect(page.getByText('Hemoglobin').first()).toBeVisible({ timeout: 5000 });
    });
  });
});
