import { test, expect, type Page } from '@playwright/test';

// Helper to clear localStorage before each test
async function clearStorage(page: Page) {
  await page.evaluate(() => localStorage.clear());
}

test.describe('First-Run Setup Wizard', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage to simulate fresh install
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
  });

  test('new user sees setup wizard on first launch', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Welcome to HemoIO' })).toBeVisible();
    await expect(page.getByText("Let's set up your secure lab results tracker")).toBeVisible();
  });

  test('setup wizard shows all steps', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Step 1: Security/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Step 2: Storage/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Step 3: AI Setup/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Step 4: Complete/i })).toBeVisible();
  });

  test('password requirements are displayed', async ({ page }) => {
    await expect(page.getByText('At least 8 characters')).toBeVisible();
    await expect(page.getByText('At least one uppercase letter')).toBeVisible();
    await expect(page.getByText('At least one lowercase letter')).toBeVisible();
    await expect(page.getByText('At least one number')).toBeVisible();
    await expect(page.getByText('At least one special character')).toBeVisible();
  });

  test('next button is disabled with weak password', async ({ page }) => {
    const passwordInput = page.getByPlaceholder('Enter your password');
    const confirmInput = page.getByPlaceholder('Confirm your password');
    const nextButton = page.getByRole('button', { name: 'Go to next step' });

    // Type a weak password
    await passwordInput.fill('weak');
    await confirmInput.fill('weak');

    await expect(nextButton).toBeDisabled();
  });

  test('shows error when passwords do not match', async ({ page }) => {
    const passwordInput = page.getByPlaceholder('Enter your password');
    const confirmInput = page.getByPlaceholder('Confirm your password');

    await passwordInput.fill('MySecurePass123!');
    await confirmInput.fill('DifferentPass456!');

    await expect(page.getByText('Passwords do not match')).toBeVisible();
  });

  test('password strength indicator shows strong for valid password', async ({ page }) => {
    const passwordInput = page.getByPlaceholder('Enter your password');

    await passwordInput.fill('MySecurePass123!');

    await expect(page.getByText('Password strength:')).toBeVisible();
    await expect(page.getByText(/Strong/)).toBeVisible();
  });

  test('can proceed to storage step with valid password', async ({ page }) => {
    const passwordInput = page.getByPlaceholder('Enter your password');
    const confirmInput = page.getByPlaceholder('Confirm your password');
    const nextButton = page.getByRole('button', { name: 'Go to next step' });

    await passwordInput.fill('MySecurePass123!');
    await confirmInput.fill('MySecurePass123!');

    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    // Should be on storage step
    await expect(page.getByText('Choose where to store your encrypted lab data')).toBeVisible();
    await expect(page.getByText('Local Storage')).toBeVisible();
  });

  test('local storage is selected by default', async ({ page }) => {
    // Navigate to storage step
    const passwordInput = page.getByPlaceholder('Enter your password');
    const confirmInput = page.getByPlaceholder('Confirm your password');
    const nextButton = page.getByRole('button', { name: 'Go to next step' });

    await passwordInput.fill('MySecurePass123!');
    await confirmInput.fill('MySecurePass123!');
    await nextButton.click();

    // Local storage should be checked
    const localStorageRadio = page.getByRole('radio', { name: /Local Storage/i });
    await expect(localStorageRadio).toBeChecked();
  });

  test('cloud storage options are disabled', async ({ page }) => {
    // Navigate to storage step
    const passwordInput = page.getByPlaceholder('Enter your password');
    const confirmInput = page.getByPlaceholder('Confirm your password');
    const nextButton = page.getByRole('button', { name: 'Go to next step' });

    await passwordInput.fill('MySecurePass123!');
    await confirmInput.fill('MySecurePass123!');
    await nextButton.click();

    await expect(page.getByText('Coming soon').first()).toBeVisible();
  });

  test('can navigate through all steps and complete setup', async ({ page }) => {
    // Step 1: Password
    const passwordInput = page.getByPlaceholder('Enter your password');
    const confirmInput = page.getByPlaceholder('Confirm your password');
    let nextButton = page.getByRole('button', { name: 'Go to next step' });

    await passwordInput.fill('MySecurePass123!');
    await confirmInput.fill('MySecurePass123!');
    await nextButton.click();

    // Step 2: Storage
    await expect(page.getByText('Choose where to store your encrypted lab data')).toBeVisible();
    nextButton = page.getByRole('button', { name: 'Go to next step' });
    await nextButton.click();

    // Step 3: AI Configuration
    await expect(page.getByText('HemoIO uses AI to automatically extract values')).toBeVisible();
    nextButton = page.getByRole('button', { name: 'Go to next step' });
    await nextButton.click();

    // Step 4: Completion
    await expect(page.getByRole('heading', { name: "You're all set!" })).toBeVisible();
    await expect(page.getByText('Password Protection')).toBeVisible();
    await expect(page.getByText('Local Storage')).toBeVisible();
    await expect(page.getByText('AI not configured')).toBeVisible();

    // Complete setup
    const getStartedButton = page.getByRole('button', { name: 'Complete setup and get started' });
    await getStartedButton.click();

    // Should be on dashboard
    await expect(page.getByRole('heading', { name: 'HemoIO', level: 3 })).toBeVisible();
    await expect(page.getByRole('navigation').getByText('Timeline')).toBeVisible();
  });

  test('back button returns to previous step', async ({ page }) => {
    // Navigate to storage step
    const passwordInput = page.getByPlaceholder('Enter your password');
    const confirmInput = page.getByPlaceholder('Confirm your password');
    const nextButton = page.getByRole('button', { name: 'Go to next step' });

    await passwordInput.fill('MySecurePass123!');
    await confirmInput.fill('MySecurePass123!');
    await nextButton.click();

    // Click back
    const backButton = page.getByRole('button', { name: 'Go to previous step' });
    await backButton.click();

    // Should be back on password step with password fields visible
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
  });

  test('setup is accessible via keyboard navigation', async ({ page }) => {
    // Tab to password field (should be auto-focused)
    const passwordInput = page.getByPlaceholder('Enter your password');
    await expect(passwordInput).toBeFocused();

    // Type password
    await passwordInput.fill('MySecurePass123!');

    // Tab to confirm password field and fill it
    const confirmInput = page.getByPlaceholder('Confirm your password');
    await confirmInput.click();
    await confirmInput.fill('MySecurePass123!');

    // Click next button with keyboard - focus and press
    const nextButton = page.getByRole('button', { name: 'Go to next step' });
    await nextButton.focus();
    await page.keyboard.press('Enter');

    // Should be on storage step
    await expect(page.getByText('Choose where to store your encrypted lab data')).toBeVisible();
  });
});
