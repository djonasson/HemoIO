/**
 * Step definitions for features/change-password.feature
 */

import { expect, type Locator, type Page } from '@playwright/test';
import { CREDENTIALS_KEY, openSettingsTab, storedCredentials } from './app.steps';

export const NEW_PASSWORD = 'N3w-Secure-Passw0rd!';

/**
 * Settings → Security, where the password is changed
 */
export class SecuritySettingsPage {
  readonly currentPassword: Locator;
  readonly newPassword: Locator;
  readonly confirmPassword: Locator;
  readonly submit: Locator;
  readonly success: Locator;

  constructor(private readonly page: Page) {
    this.currentPassword = page.getByLabel('Current password', { exact: true });
    this.newPassword = page.getByLabel('New password', { exact: true });
    this.confirmPassword = page.getByLabel('Confirm new password', { exact: true });
    this.submit = page.getByRole('button', { name: 'Change password' });
    this.success = page
      .getByRole('status')
      .filter({ hasText: 'Password changed. Use your new password next time you unlock HemoIO.' });
  }

  /** And I am on the Security tab of Settings */
  async open(): Promise<void> {
    await openSettingsTab(this.page, 'Security');
    await expect(this.page.getByRole('heading', { name: 'Change password' })).toBeVisible();
  }

  async fill(current: string, next: string, confirm: string = next): Promise<void> {
    await this.currentPassword.fill(current);
    await this.newPassword.fill(next);
    await this.confirmPassword.fill(confirm);
  }

  /** When I change my password (and it succeeds) */
  async change(current: string, next: string): Promise<void> {
    await this.open();
    await this.fill(current, next);
    await this.submit.click();
    await expect(this.success).toBeVisible();
  }
}

/** When I lock the application */
export async function lockApp(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Lock application' }).click();
  await expect(page.getByText('Enter your password to unlock your lab data')).toBeVisible();
}

/** Then <password> should no longer unlock HemoIO (stays on the login screen) */
export async function expectPasswordRejected(page: Page, password: string): Promise<void> {
  const field = page.getByRole('textbox', { name: 'Password', exact: true });
  await field.fill(password);
  await page.getByRole('button', { name: /unlock/i }).click();
  await expect(page.getByText('Incorrect password')).toBeVisible();
  await field.fill('');
}

/**
 * Given I set up HemoIO with an earlier version of the app
 *
 * Writes credentials in the pre-key-wrapping (v1) format, as the earlier
 * app's createStoredCredentials did: a random salt for the data key, and a
 * PBKDF2-SHA256 (100 000 iterations) verification hash with its own salt.
 * Ends on the login screen.
 */
export async function seedV1Credentials(page: Page, password: string): Promise<void> {
  await page.goto('/');
  await page.evaluate(async ({ pw, credentialsKey }) => {
    const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const verificationSalt = crypto.getRandomValues(new Uint8Array(16));
    const baseKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(pw),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const hash = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: verificationSalt, iterations: 100000, hash: 'SHA-256' },
      baseKey,
      256
    );
    localStorage.clear();
    localStorage.setItem(
      credentialsKey,
      JSON.stringify({
        salt: toBase64(salt),
        verificationSalt: toBase64(verificationSalt),
        verificationHash: toBase64(new Uint8Array(hash)),
      })
    );
  }, { pw: password, credentialsKey: CREDENTIALS_KEY });
  await page.reload();
  await expect(page.getByText('Enter your password to unlock your lab data')).toBeVisible();
}

/** The format of the stored credentials: 2, or undefined for v1 */
export async function storedCredentialsVersion(page: Page): Promise<unknown> {
  return (JSON.parse((await storedCredentials(page)) ?? '{}') as { version?: unknown }).version;
}
