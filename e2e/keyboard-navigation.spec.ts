import { test, expect, type Page } from '@playwright/test';

// Helper to clear localStorage before each test
async function clearStorage(page: Page) {
  await page.evaluate(() => localStorage.clear());
}

// Helper to complete password step
async function completePasswordStep(page: Page) {
  await page.getByPlaceholder('Enter your password').fill('MySecurePass123!');
  await page.getByPlaceholder('Confirm your password').fill('MySecurePass123!');
}

test.describe('Keyboard Navigation', () => {
  test.describe('Setup Wizard Enter Key Submission', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await clearStorage(page);
      await page.reload();
      // Wait for wizard to be visible
      await expect(page.getByRole('heading', { name: 'Welcome to HemoIO' })).toBeVisible();
    });

    test('Enter key submits password step when valid', async ({ page }) => {
      await completePasswordStep(page);

      // Press Enter while in confirm password field
      await page.keyboard.press('Enter');

      // Should advance to storage step
      await expect(page.getByText('Choose where to store your encrypted lab data')).toBeVisible();
    });

    test('Enter key does not submit password step when invalid', async ({ page }) => {
      // Type weak password
      await page.getByPlaceholder('Enter your password').fill('weak');
      await page.getByPlaceholder('Confirm your password').fill('weak');

      // Press Enter
      await page.keyboard.press('Enter');

      // Should stay on password step
      await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
      await expect(page.getByText('Choose where to store')).not.toBeVisible();
    });

    test('Enter key submits storage step (non-input page)', async ({ page }) => {
      // Complete password step
      await completePasswordStep(page);
      await page.getByRole('button', { name: 'Go to next step' }).click();

      // Now on storage step
      await expect(page.getByText('Choose where to store')).toBeVisible();

      // Press Enter - should advance without text input
      await page.keyboard.press('Enter');

      // Should be on AI config step
      await expect(page.getByText('HemoIO uses AI to automatically extract values')).toBeVisible();
    });

    test('Enter key submits AI configuration step', async ({ page }) => {
      // Complete password step
      await completePasswordStep(page);
      await page.getByRole('button', { name: 'Go to next step' }).click();

      // Skip storage step
      await page.getByRole('button', { name: 'Go to next step' }).click();

      // Now on AI config step
      await expect(page.getByText('HemoIO uses AI to automatically extract values')).toBeVisible();

      // Press Enter - should advance
      await page.keyboard.press('Enter');

      // Should be on completion step
      await expect(page.getByRole('heading', { name: "You're all set!" })).toBeVisible();
    });

    test('Enter key completes setup on final step', async ({ page }) => {
      // Navigate to final step
      await completePasswordStep(page);
      await page.getByRole('button', { name: 'Go to next step' }).click();
      await page.getByRole('button', { name: 'Go to next step' }).click();
      await page.getByRole('button', { name: 'Go to next step' }).click();

      // On completion step
      await expect(page.getByRole('heading', { name: "You're all set!" })).toBeVisible();

      // Press Enter
      await page.keyboard.press('Enter');

      // Should be on dashboard
      await expect(page.getByRole('navigation').getByText('Timeline')).toBeVisible();
    });
  });

  test.describe('Login Screen Enter Key', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await clearStorage(page);
      await page.reload();

      // Complete setup first
      await completePasswordStep(page);
      await page.getByRole('button', { name: 'Go to next step' }).click();
      await page.getByRole('button', { name: 'Go to next step' }).click();
      await page.getByRole('button', { name: 'Go to next step' }).click();
      await page.getByRole('button', { name: 'Complete setup and get started' }).click();

      // Wait for dashboard, then "lock" the app by reloading
      await expect(page.getByRole('navigation').getByText('Timeline')).toBeVisible();
      await page.reload();
    });

    test('Enter key submits login form', async ({ page }) => {
      // Should see login screen
      await expect(page.getByPlaceholder('Enter your password')).toBeVisible();

      // Type password and press Enter
      await page.getByPlaceholder('Enter your password').fill('MySecurePass123!');
      await page.keyboard.press('Enter');

      // Should be logged in and see dashboard
      await expect(page.getByRole('navigation').getByText('Timeline')).toBeVisible();
    });
  });

  test.describe('Tab Navigation', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await clearStorage(page);
      await page.reload();
    });

    test('Tab moves focus through interactive elements', async ({ page }) => {
      // Password input should be initially focused
      const passwordInput = page.getByPlaceholder('Enter your password');
      await expect(passwordInput).toBeFocused();

      // Tab to confirm password
      await page.keyboard.press('Tab');
      // May go through visibility toggle first, so press Tab again if needed
      const confirmInput = page.getByPlaceholder('Confirm your password');

      // Press Tab until we reach confirm input (may have visibility toggle in between)
      let attempts = 0;
      while (!(await confirmInput.evaluate((el) => el === document.activeElement)) && attempts < 5) {
        await page.keyboard.press('Tab');
        attempts++;
      }
      await expect(confirmInput).toBeFocused();
    });

    test('Tab eventually reaches Next button', async ({ page }) => {
      await completePasswordStep(page);

      const nextButton = page.getByRole('button', { name: 'Go to next step' });

      // Tab until we reach the Next button
      let attempts = 0;
      while (!(await nextButton.evaluate((el) => el === document.activeElement)) && attempts < 20) {
        await page.keyboard.press('Tab');
        attempts++;
      }

      await expect(nextButton).toBeFocused();

      // Enter should submit
      await page.keyboard.press('Enter');
      await expect(page.getByText('Choose where to store')).toBeVisible();
    });
  });

  test.describe('Escape Key for Modals', () => {
    test.beforeEach(async ({ page }) => {
      // Complete setup and login
      await page.goto('/');
      await clearStorage(page);
      await page.reload();
      await completePasswordStep(page);
      await page.getByRole('button', { name: 'Go to next step' }).click();
      await page.getByRole('button', { name: 'Go to next step' }).click();
      await page.getByRole('button', { name: 'Go to next step' }).click();
      await page.getByRole('button', { name: 'Complete setup and get started' }).click();
      await expect(page.getByRole('navigation').getByText('Timeline')).toBeVisible();
    });

    test('Escape closes settings modal', async ({ page }) => {
      // Open settings
      await page.getByRole('button', { name: /settings/i }).click();

      // Modal should be open
      await expect(page.getByRole('dialog')).toBeVisible();

      // Press Escape
      await page.keyboard.press('Escape');

      // Modal should be closed
      await expect(page.getByRole('dialog')).not.toBeVisible();
    });
  });
});
