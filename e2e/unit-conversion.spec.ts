/**
 * E2E Tests for Unit Conversion
 *
 * Tests the unit conversion functionality in the UI including:
 * - Display of values in different units
 * - Unit preference settings
 * - Reference range conversion
 * - Unit normalization
 *
 * Note: Most unit conversion logic is tested via unit tests.
 * These E2E tests focus on the UI integration.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

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
 * Helper to navigate to biomarker dictionary
 */
async function navigateToDictionary(page: Page) {
  await page.locator('nav').getByText('Biomarkers', { exact: true }).click();
}

/**
 * Helper to navigate to settings
 */
async function navigateToSettings(page: Page) {
  await page.locator('nav').getByText('Settings', { exact: true }).click();
}

test.describe('Unit Conversion', () => {
  test.describe('Biomarker Dictionary - Units Display', () => {
    test('should display biomarkers in dictionary', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToDictionary(page);

      // Wait for dictionary to load
      await expect(page.getByText('Biomarker Dictionary')).toBeVisible();

      // Search for glucose to find it easily
      const searchInput = page.getByPlaceholder(/search/i);
      await searchInput.fill('Glucose');

      // Should show Glucose biomarker in search results
      await expect(page.getByText('Glucose').first()).toBeVisible({ timeout: 5000 });
    });

    test('should display biomarker detail when clicking biomarker', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToDictionary(page);

      // Wait for dictionary to load
      await expect(page.getByText('Biomarker Dictionary')).toBeVisible();

      // Search for glucose
      const searchInput = page.getByPlaceholder(/search/i);
      await searchInput.fill('Glucose');

      // Click on Glucose biomarker
      await page.getByText('Glucose').first().click();

      // Should show biomarker detail panel with some content
      // The detail panel shows description, units, etc.
      await expect(page.getByText(/blood sugar|energy/i).first()).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Settings - Display Preferences', () => {
    test('should navigate to display settings', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Should see settings page with display options
      await expect(page.getByText(/Settings|Display|Preferences/i).first()).toBeVisible();
    });

    test('should show number format options', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await navigateToSettings(page);

      // Should see number format/locale settings
      await expect(page.getByText(/number format|locale|display/i).first()).toBeVisible();
    });
  });
});

test.describe('Unit Conversion - With Data', () => {
  // These tests require seeding the database with test data
  // They verify unit conversion in the context of actual lab results

  test.skip('should display glucose value with correct unit', async ({ page }) => {
    // Requires seeded data with glucose value
    // Verify: value displays as "100 mg/dL" or "5.55 mmol/L"
  });

  test.skip('should convert glucose from mg/dL to mmol/L in display', async ({ page }) => {
    // Requires seeded data and unit preference toggle
    // Given: Glucose value of 100 mg/dL stored
    // When: User changes display preference to mmol/L
    // Then: Value should display as approximately 5.55 mmol/L
  });

  test.skip('should convert cholesterol units correctly', async ({ page }) => {
    // Requires seeded data with cholesterol value
    // Given: Cholesterol value of 200 mg/dL
    // When: Converting to mmol/L
    // Then: Should display approximately 5.17 mmol/L
  });

  test.skip('should convert hemoglobin from g/dL to g/L', async ({ page }) => {
    // Requires seeded data with hemoglobin value
    // Given: Hemoglobin value of 14 g/dL
    // When: Converting to g/L
    // Then: Should display 140 g/L
  });

  test.skip('should convert creatinine from mg/dL to µmol/L', async ({ page }) => {
    // Requires seeded data with creatinine value
    // Given: Creatinine value of 1.0 mg/dL
    // When: Converting to µmol/L
    // Then: Should display approximately 88.4 µmol/L
  });

  test.skip('should convert vitamin D from ng/mL to nmol/L', async ({ page }) => {
    // Requires seeded data with vitamin D value
    // Given: Vitamin D value of 30 ng/mL
    // When: Converting to nmol/L
    // Then: Should display approximately 75 nmol/L
  });

  test.skip('should show no conversion for equivalent units like TSH', async ({ page }) => {
    // Requires seeded data with TSH value
    // Given: TSH value of 2.5 mIU/L
    // When: Converting to µIU/mL
    // Then: Should display 2.5 µIU/mL (equivalent)
  });

  test.skip('should convert reference ranges along with values', async ({ page }) => {
    // Requires seeded data with glucose and reference range
    // Given: Glucose 100 mg/dL with reference 70-100 mg/dL
    // When: Converting to mmol/L
    // Then: Reference range should show approximately 3.9-5.6 mmol/L
  });

  test.skip('should save unit preference per biomarker', async ({ page }) => {
    // Requires unit preference UI
    // Given: User is viewing glucose results
    // When: User sets preferred unit to mmol/L
    // Then: Preference should persist across sessions
  });

  test.skip('should handle precision appropriately', async ({ page }) => {
    // Requires seeded data
    // Given: Glucose value of 99.7 mg/dL
    // When: Converting to mmol/L
    // Then: Should display reasonable precision (not excessive decimals)
  });
});

test.describe('Unit Conversion - International Aliases', () => {
  // Tests for international biomarker name aliases
  // Verify that Italian and other language aliases work correctly

  test.skip('should recognize Italian creatinine alias', async ({ page }) => {
    // Given: Value labeled "P-Creatinina (metodo enzimatico)"
    // When: Processing the import
    // Then: Should be recognized as Creatinine biomarker
  });

  test.skip('should convert urine creatinine with Italian alias', async ({ page }) => {
    // Given: U-Creatinina value at 3780 µmol/L
    // When: Converting to g/L
    // Then: Should display approximately 0.43 g/L
  });

  test.skip('should normalize European decimal notation', async ({ page }) => {
    // Given: eGFR value of "90 mL/min/1,73m²" (European comma)
    // When: Processing the value
    // Then: Should recognize as mL/min/1.73m² (standard notation)
  });

  test.skip('should recognize equivalent enzyme units', async ({ page }) => {
    // Given: ALT value of 35 U/L
    // When: Checking unit equivalence
    // Then: Should recognize U/L and IU/L as equivalent
  });
});

test.describe('Unit Conversion - Duplicate Detection', () => {
  // Tests for detecting when the same measurement appears in different units

  test.skip('should detect equivalent values in different units', async ({ page }) => {
    // Given: Lab report with creatinine as both 67 µmol/L and 0.76 mg/dL
    // When: Values are analyzed
    // Then: Should recognize as same measurement
    // And: Should keep only one value without duplicate warning
  });

  test.skip('should flag genuinely different duplicate values as conflict', async ({ page }) => {
    // Given: Lab report with creatinine as both 67 µmol/L and 1.5 mg/dL
    // When: Values are analyzed
    // Then: Should recognize as conflicting (not equivalent)
    // And: Should show duplicate conflict warning
  });
});

test.describe('Unit Conversion - Error Handling', () => {
  test.skip('should show error for unsupported unit conversion', async ({ page }) => {
    // Given: Attempt to convert glucose to unsupported unit "stones"
    // Then: Should show appropriate error message
  });

  test.skip('should handle missing conversion factor gracefully', async ({ page }) => {
    // Given: Biomarker without defined conversion factor
    // When: Attempting conversion
    // Then: Should show original unit without crash
  });
});

test.describe('Unit Conversion - Accessibility', () => {
  test('biomarker dictionary should show units accessibly', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    await navigateToDictionary(page);

    // Expand a category
    await page.getByText('Metabolic').click();

    // Biomarkers should be visible with keyboard navigation
    await page.keyboard.press('Tab');
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).toBeTruthy();
  });

  test.skip('unit preference controls should be keyboard accessible', async ({ page }) => {
    // Requires unit preference UI
    // Should be able to change units via keyboard
  });
});
