import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import {
  blockTestCatalog,
  expectTestCatalogError,
  setupOrUnlock,
} from './steps/app.steps';
import { SEED_TEST_VALUES, seedLabData } from './steps/data.steps';
import {
  readStoredData,
  storedFieldNames,
} from './steps/dataAtRest.steps';
import { noteSeed } from './steps/userNotes.steps';

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

  test.describe('The test catalog', () => {
    test.beforeEach(async ({ page }) => {
      await setupUser(page, 'TestPassword123!');
      // A new page load: the catalog loaded at setup is gone from memory
      await page.reload();
      await expect(page.getByText('Enter your password to unlock your lab data')).toBeVisible();
    });

    test('says so when the test catalog cannot be loaded after unlocking', async ({ page }) => {
      // Scenario: The test catalog cannot be loaded after unlocking
      await blockTestCatalog(page);
      await page.getByLabel('Password').fill('TestPassword123!');
      await page.getByRole('button', { name: 'Unlock' }).click();

      await expectTestCatalogError(page);
      await expect(page.locator('nav').getByText('Settings', { exact: true })).toHaveCount(0);
    });

    test('loads the test catalog when I try again', async ({ page }) => {
      // Scenario: Trying again loads the test catalog
      const unblock = await blockTestCatalog(page);
      await page.getByLabel('Password').fill('TestPassword123!');
      await page.getByRole('button', { name: 'Unlock' }).click();
      await expectTestCatalogError(page);

      await unblock();
      await page.getByRole('button', { name: 'Try again' }).click();

      await expect(page.locator('nav').getByText('Settings', { exact: true })).toBeVisible();
      await expect(page.getByRole('alert').filter({ hasText: 'Test catalog could not be loaded' })).toHaveCount(0);
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

test.describe('Data at rest', () => {
  // Restored from a schema version 4 backup: 2345-7 is Glucose (LOINC)
  const backup = {
    testValues: [
      ...SEED_TEST_VALUES,
      {
        id: 4, labResultId: 2, biomarkerKey: 'unknown:zorblatin', rawText: 'Zorblatin', value: 3, unit: 'U/L',
        createdAt: '2024-02-20T14:30:00.000Z', updatedAt: '2024-02-20T14:30:00.000Z',
      },
    ],
    userNotes: [noteSeed(1, { biomarkerKey: '2345-7' }, 'Fasting sample', ['diabetes'])],
    userPreferences: {
      unitPreferences: { '2345-7': 'mmol/L' },
      personalTargets: { '2345-7': { low: 70, high: 90 } },
      acknowledgedAlerts: { '2345-7': '2024-01-15T10:00:00.000Z' },
      theme: 'system',
      dateFormat: 'MM/DD/YYYY',
    },
  };
  // Biomarker names and keys, units, lab names, tags and dates
  const READABLE = /glucose|hemoglobin|zorblatin|diabetes|mmol|mg\/dL|U\/L|Quest|LabCorp|2024-/i;
  const SEALED = {
    labResults: ['encrypted', 'id'],
    testValues: ['encrypted', 'id', 'labResultId'],
    userNotes: ['encrypted', 'id'],
    userPreferences: ['encrypted', 'id'],
  };

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    await seedLabData(page, backup);
  });

  test('stores nothing about the tests readable, only IDs and links', async ({ page }) => {
    // Scenario: Which tests were done cannot be read without the password
    expect(await storedFieldNames(page)).toMatchObject(SEALED);
    expect(await readStoredData(page)).not.toMatch(READABLE);
  });
});
