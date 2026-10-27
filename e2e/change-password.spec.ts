/**
 * E2E tests for features/change-password.feature
 */

import { test, expect } from './fixtures';
import { TEST_PASSWORD, setupOrUnlock, unlockApp } from './steps/app.steps';
import { seedLabData } from './steps/data.steps';
import { goToNotes, noteCards, noteSeed, seedNotesData } from './steps/userNotes.steps';
import { configureAnthropic, mockAnthropicApi } from './steps/aiModelSelection.steps';
import {
  NEW_PASSWORD,
  SecuritySettingsPage,
  expectPasswordRejected,
  lockApp,
  seedV1Credentials,
  storedCredentialsVersion,
} from './steps/changePassword.steps';

test.describe('Change password', () => {
  test('changing the password', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    const security = new SecuritySettingsPage(page);
    await security.open();

    await security.fill(TEST_PASSWORD, NEW_PASSWORD);
    await security.submit.click();

    await expect(security.success).toBeVisible();
    await expect(security.currentPassword).toHaveValue('');
    await expect(security.newPassword).toHaveValue('');
    await expect(security.confirmPassword).toHaveValue('');
    await lockApp(page);
    await expectPasswordRejected(page, TEST_PASSWORD);
    await unlockApp(page, NEW_PASSWORD);
  });

  test('my data stays readable after the change', async ({ page }) => {
    await mockAnthropicApi(page);
    await page.goto('/');
    await setupOrUnlock(page);
    await seedNotesData(page, [noteSeed(1, { labResultId: 1 }, 'Fasted for twelve hours')]);
    await configureAnthropic(page);

    await new SecuritySettingsPage(page).change(TEST_PASSWORD, NEW_PASSWORD);
    await lockApp(page);
    await unlockApp(page, NEW_PASSWORD);

    await page.locator('nav').getByText('Timeline', { exact: true }).click();
    await expect(page.getByText('Quest Diagnostics')).toBeVisible();
    const notes = await goToNotes(page);
    await expect(noteCards(notes).filter({ hasText: 'Fasted for twelve hours' })).toBeVisible();
    await page.locator('nav').getByText('Settings', { exact: true }).click();
    await page.getByRole('tab', { name: 'AI Configuration' }).click();
    await expect(page.getByText('••••••••0000')).toBeVisible();
  });

  test('the current password is wrong', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    const security = new SecuritySettingsPage(page);
    await security.open();

    await security.fill('Not-My-Passw0rd!', NEW_PASSWORD);
    await security.submit.click();

    await expect(page.getByText('Current password is incorrect')).toBeVisible();
    await expect(security.currentPassword).toBeFocused();
    await expect(security.newPassword).toHaveValue(NEW_PASSWORD);
    await expect(security.confirmPassword).toHaveValue(NEW_PASSWORD);
    await lockApp(page);
    await unlockApp(page, TEST_PASSWORD);
  });

  test('the confirmation does not match', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    const security = new SecuritySettingsPage(page);
    await security.open();

    await security.fill(TEST_PASSWORD, NEW_PASSWORD, `${NEW_PASSWORD}x`);

    await expect(page.getByText('Passwords do not match')).toBeVisible();
    await expect(security.submit).toBeDisabled();
  });

  test('the new password is too weak', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    const security = new SecuritySettingsPage(page);
    await security.open();

    await security.fill(TEST_PASSWORD, 'weak');

    await expect(page.getByText('Password strength: Weak')).toBeVisible();
    await expect(page.getByText('At least 8 characters')).toBeVisible();
    await expect(security.submit).toBeDisabled();
  });

  test('the new password is the same as the current one', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    const security = new SecuritySettingsPage(page);
    await security.open();

    await security.fill(TEST_PASSWORD, TEST_PASSWORD);

    await expect(
      page.getByText('New password must be different from your current password')
    ).toBeVisible();
    await expect(security.submit).toBeDisabled();
  });

  test('a user who set up HemoIO before password changes existed', async ({ page }) => {
    await seedV1Credentials(page, TEST_PASSWORD);
    await unlockApp(page, TEST_PASSWORD);
    // Encrypted with the v1 key, as the earlier app would have stored it
    await seedLabData(page);

    await new SecuritySettingsPage(page).change(TEST_PASSWORD, NEW_PASSWORD);
    expect(await storedCredentialsVersion(page)).toBe(2);
    await lockApp(page);
    await expectPasswordRejected(page, TEST_PASSWORD);
    await unlockApp(page, NEW_PASSWORD);

    await page.locator('nav').getByText('Timeline', { exact: true }).click();
    await expect(page.getByText('Quest Diagnostics')).toBeVisible();
  });

  test('changing the password with the keyboard only', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    const security = new SecuritySettingsPage(page);
    await security.open();

    // From the Security tab, Tab moves into the panel and on to the first field
    for (
      let i = 0;
      i < 10 && !(await security.currentPassword.evaluate((el) => el === document.activeElement));
      i++
    ) {
      await page.keyboard.press('Tab');
    }
    await expect(security.currentPassword).toBeFocused();
    await page.keyboard.type(TEST_PASSWORD);
    await page.keyboard.press('Tab');
    await expect(security.newPassword).toBeFocused();
    await page.keyboard.type(NEW_PASSWORD);
    await page.keyboard.press('Tab');
    await expect(security.confirmPassword).toBeFocused();
    await page.keyboard.type(NEW_PASSWORD);
    await page.keyboard.press('Enter');

    await expect(security.success).toBeVisible();
  });

  test('backups are not affected', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);

    await new SecuritySettingsPage(page).open();

    await expect(
      page.getByText(
        'Changing your password does not affect existing backup files, which use their own backup password.',
        { exact: false }
      )
    ).toBeVisible();
  });
});
