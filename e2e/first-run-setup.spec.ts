import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { completeSetup, TEST_PASSWORD } from './steps/app.steps';
import { readStoredRows } from './steps/dataAtRest.steps';
import {
  existingDataStep,
  goToCompletionStep,
  keepExistingDataAside,
  recordStorageWrites,
  seedDataWithoutLock,
  storageKeysWritten,
} from './steps/setup.steps';
import { setAsideBanner, setAsideRowCount } from './steps/unreadableRecords.steps';

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

test.describe('First-run setup: tabs and existing data', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);
    await page.reload();
  });

  test('setting up in two tabs at once makes one setup', async ({ page, context }) => {
    // Scenario: Setting up in two tabs makes one setup
    const other = await context.newPage();
    for (const tab of [page, other]) {
      await recordStorageWrites(tab);
      await tab.goto('/');
      await goToCompletionStep(tab, TEST_PASSWORD);
    }

    await Promise.all(
      [page, other].map((tab) => tab.getByRole('button', { name: 'Complete setup and get started' }).click())
    );

    // Both tabs open with the one lock: the second unlocked with it
    for (const tab of [page, other]) {
      await expect(tab.locator('nav').getByText('Settings', { exact: true })).toBeVisible();
    }
    const writes = [...(await storageKeysWritten(page)), ...(await storageKeysWritten(other))];
    expect(writes.filter((key) => key === 'hemoio_credentials')).toHaveLength(1);
    // The tab that came second says its choices were not saved
    const toldNotSaved = (tab: Page) =>
      tab
        .getByRole('alert')
        .filter({ hasText: 'HemoIO was set up in another tab. The choices made here were not saved' })
        .count();
    await expect
      .poll(async () => (await Promise.all([page, other].map(toldNotSaved))).sort())
      .toEqual([0, 1]);
  });

  test('the tab whose password does not open the first setup is told to unlock', async ({ page, context }) => {
    // Scenario: The tab whose password does not open the first setup is told to unlock
    const other = await context.newPage();
    await other.goto('/');
    const tabs = [
      { tab: page, password: TEST_PASSWORD },
      { tab: other, password: 'OtherPassword456!' },
    ];
    for (const { tab, password } of tabs) {
      await goToCompletionStep(tab, password);
    }

    await Promise.all(
      tabs.map(({ tab }) => tab.getByRole('button', { name: 'Complete setup and get started' }).click())
    );

    // Whichever tab set up first opens; the other shows the login screen and says why
    const told = (tab: Page) =>
      tab.getByRole('alert').filter({ hasText: 'HemoIO was set up in another tab. Unlock with that password.' });
    const loginOrApp = (tab: Page) =>
      tab
        .locator('nav')
        .getByText('Settings', { exact: true })
        .or(tab.getByRole('textbox', { name: 'Password', exact: true }));
    for (const { tab } of tabs) await expect(loginOrApp(tab)).toBeVisible();
    const toldTabs = [];
    for (const { tab } of tabs) {
      if (await tab.getByRole('textbox', { name: 'Password', exact: true }).isVisible()) {
        await expect(told(tab)).toBeVisible();
        toldTabs.push(tab);
      }
    }
    expect(toldTabs).toHaveLength(1);
  });

  test('a tab still on setup leaves it once another tab has finished', async ({ page, context }) => {
    // Scenario: A tab still on setup leaves it once another tab has finished
    const other = await context.newPage();
    await other.goto('/');
    await other.getByPlaceholder(/enter your password/i).fill('OtherPassword456!');

    await completeSetup(page);

    // No reload: the other tab hears that the credentials were saved
    await expect(other.getByRole('textbox', { name: 'Password', exact: true })).toBeVisible();
    await expect(other.getByRole('heading', { name: 'Welcome to HemoIO' })).toHaveCount(0);
    await expect(
      other.getByRole('alert').filter({
        hasText: 'HemoIO was set up in another tab. Unlock with that password. The choices made here were not saved',
      })
    ).toBeVisible();
  });

  test('setup tells me when this browser already holds data', async ({ page }) => {
    // Scenario: Setup tells me when this browser already holds data
    await seedDataWithoutLock(page);

    const step = existingDataStep(page);
    await expect(step.getByRole('heading', { name: 'This browser already holds HemoIO data' })).toBeVisible();
    await expect(step).toContainText(
      "It was saved by an earlier setup whose password lock is gone, so this setup can't open it."
    );
    // Before anything else: the password step is not shown yet
    await expect(page.getByPlaceholder(/enter your password/i)).toHaveCount(0);
    await expect(step.getByRole('button', { name: 'Keep it aside and set up anew' })).toBeFocused();
  });

  test('I can keep the existing data aside and set up anew', async ({ page }) => {
    // Scenario: I can keep the existing data aside and set up anew
    const stored = await seedDataWithoutLock(page);

    await keepExistingDataAside(page);
    await completeSetup(page);

    await expect(setAsideBanner(page)).toContainText(`${stored} stored records can't be opened`);
    expect(await setAsideRowCount(page)).toBe(stored);
  });

  test('I can clear the existing data, after confirming', async ({ page }) => {
    // Scenario: I can clear the existing data, after confirming
    await seedDataWithoutLock(page);
    const step = existingDataStep(page);

    await step.getByRole('button', { name: 'Clear it and set up anew…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Clear the data in this browser?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect((await readStoredRows(page)).labResults).toHaveLength(1);

    await step.getByRole('button', { name: 'Clear it and set up anew…' }).click();
    await dialog.getByRole('button', { name: 'Clear and set up anew' }).click();

    // On to the first step of setup, with every table empty
    await expect(page.getByPlaceholder(/enter your password/i)).toBeVisible();
    const rows = await readStoredRows(page);
    expect(Object.values(rows).every((table) => table.length === 0)).toBe(true);

    await completeSetup(page);
    await expect(setAsideBanner(page)).toHaveCount(0);
    expect(await setAsideRowCount(page)).toBe(0);
  });

  test('pressing Get Started twice sets up once', async ({ page }) => {
    // Scenario: Pressing Get Started twice sets up once
    await recordStorageWrites(page);
    await page.reload();
    await goToCompletionStep(page, TEST_PASSWORD);

    await page.getByRole('button', { name: 'Complete setup and get started' }).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    await expect(page.locator('nav').getByText('Settings', { exact: true })).toBeVisible();
    const credentialWrites = (await storageKeysWritten(page)).filter((key) => key === 'hemoio_credentials');
    expect(credentialWrites).toHaveLength(1);
  });
});
