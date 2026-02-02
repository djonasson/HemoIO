import { test, expect, type Page } from '@playwright/test';

// Helper to set up a user with password
async function setupUser(page: Page, password: string = 'MySecurePass123!') {
  await page.goto('/');

  // Clear any existing storage
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Complete setup wizard
  const passwordInput = page.getByPlaceholder('Enter your password');
  const confirmInput = page.getByPlaceholder('Confirm your password');

  await passwordInput.fill(password);
  await confirmInput.fill(password);

  // Navigate through all steps
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Go to next step' }).click();
  }

  // Complete setup
  await page.getByRole('button', { name: 'Complete setup and get started' }).click();

  // Wait for dashboard to appear
  await expect(page.getByRole('heading', { name: 'HemoIO', level: 3 })).toBeVisible();
}

test.describe('Authentication', () => {
  test.describe('Login Screen', () => {
    test.beforeEach(async ({ page }) => {
      await setupUser(page);
      // Lock the application
      await page.getByRole('button', { name: 'Lock application' }).click();
    });

    test('shows login screen when application is locked', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'HemoIO', level: 1 })).toBeVisible();
      await expect(page.getByText('Enter your password to unlock your lab data')).toBeVisible();
      await expect(page.getByLabel('Password')).toBeVisible();
    });

    test('unlock button is disabled when password is empty', async ({ page }) => {
      const unlockButton = page.getByRole('button', { name: 'Unlock' });
      await expect(unlockButton).toBeDisabled();
    });

    test('unlock button is enabled when password is entered', async ({ page }) => {
      const passwordInput = page.getByLabel('Password');
      await passwordInput.fill('somepassword');

      const unlockButton = page.getByRole('button', { name: 'Unlock' });
      await expect(unlockButton).toBeEnabled();
    });

    test('shows error for incorrect password', async ({ page }) => {
      const passwordInput = page.getByLabel('Password');
      await passwordInput.fill('WrongPassword!');

      const unlockButton = page.getByRole('button', { name: 'Unlock' });
      await unlockButton.click();

      await expect(page.getByText('Incorrect password')).toBeVisible();
    });

    test('unlocks with correct password', async ({ page }) => {
      const passwordInput = page.getByLabel('Password');
      await passwordInput.fill('MySecurePass123!');

      const unlockButton = page.getByRole('button', { name: 'Unlock' });
      await unlockButton.click();

      // Should be on dashboard
      await expect(page.getByRole('heading', { name: 'HemoIO', level: 3 })).toBeVisible();
      await expect(page.getByRole('navigation').getByText('Timeline')).toBeVisible();
    });

    test('password field is focused on load', async ({ page }) => {
      const passwordInput = page.getByLabel('Password');
      await expect(passwordInput).toBeFocused();
    });

    test('can toggle password visibility', async ({ page }) => {
      const passwordInput = page.getByLabel('Password');
      await passwordInput.fill('MySecurePass123!');

      // By default, password should be hidden (type="password")
      await expect(passwordInput).toHaveAttribute('type', 'password');

      // Click show password button - it's the button inside the password input wrapper
      const visibilityToggle = page.locator('button[tabindex="-1"]').first();
      await visibilityToggle.click();

      await expect(passwordInput).toHaveAttribute('type', 'text');
    });

    test('shows security information message', async ({ page }) => {
      await expect(page.getByText('Your data is encrypted locally and never leaves your device')).toBeVisible();
    });
  });

  test.describe('Lock Functionality', () => {
    test.beforeEach(async ({ page }) => {
      await setupUser(page);
    });

    test('lock button is visible in header', async ({ page }) => {
      await expect(page.getByRole('button', { name: 'Lock application' })).toBeVisible();
    });

    test('clicking lock redirects to login screen', async ({ page }) => {
      await page.getByRole('button', { name: 'Lock application' }).click();

      await expect(page.getByText('Enter your password to unlock your lab data')).toBeVisible();
    });

    test('session is cleared on lock', async ({ page }) => {
      await page.getByRole('button', { name: 'Lock application' }).click();

      // Reload page
      await page.reload();

      // Should still be on login screen (session was cleared)
      await expect(page.getByText('Enter your password to unlock your lab data')).toBeVisible();
    });
  });

  test.describe('Persisted Authentication', () => {
    test('shows login screen on return visit', async ({ page }) => {
      await setupUser(page);

      // Lock and reload
      await page.getByRole('button', { name: 'Lock application' }).click();
      await page.reload();

      // Should show login screen, not setup wizard
      await expect(page.getByText('Enter your password to unlock your lab data')).toBeVisible();
      await expect(page.getByText('Welcome to HemoIO')).not.toBeVisible();
    });

    test('stored password hash persists across sessions', async ({ page }) => {
      await setupUser(page, 'TestPassword123!');

      // Lock and navigate away
      await page.getByRole('button', { name: 'Lock application' }).click();

      // Navigate to a different page and back
      await page.goto('about:blank');
      await page.goto('/');

      // Should still be on login screen with ability to unlock
      await expect(page.getByText('Enter your password to unlock your lab data')).toBeVisible();

      // Can unlock with original password
      await page.getByLabel('Password').fill('TestPassword123!');
      await page.getByRole('button', { name: 'Unlock' }).click();

      await expect(page.getByRole('heading', { name: 'HemoIO', level: 3 })).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test.beforeEach(async ({ page }) => {
      await setupUser(page);
      await page.getByRole('button', { name: 'Lock application' }).click();
    });

    test('password field has accessible label', async ({ page }) => {
      const passwordInput = page.getByLabel('Password');
      await expect(passwordInput).toBeVisible();
    });

    test('unlock button is keyboard accessible', async ({ page }) => {
      const passwordInput = page.getByLabel('Password');
      await passwordInput.fill('MySecurePass123!');

      // Submit form with Enter key from password field
      await page.keyboard.press('Enter');

      // Should unlock
      await expect(page.getByRole('heading', { name: 'HemoIO', level: 3 })).toBeVisible();
    });

    test('error message is accessible', async ({ page }) => {
      const passwordInput = page.getByLabel('Password');
      await passwordInput.fill('wrong');

      await page.getByRole('button', { name: 'Unlock' }).click();

      // Error should have role="alert"
      await expect(page.getByRole('alert')).toContainText('Incorrect password');
    });
  });
});
