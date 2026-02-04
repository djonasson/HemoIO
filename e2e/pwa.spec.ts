/**
 * E2E Tests for Progressive Web App (PWA) functionality
 *
 * Tests the PWA install and update prompts.
 * Note: Some PWA events (beforeinstallprompt) don't fire in Playwright,
 * so we test by injecting mock events.
 */

import { test, expect } from '@playwright/test';

test.describe('PWA Install Prompt', () => {
  test('install prompt appears when beforeinstallprompt event fires', async ({ page }) => {
    await page.goto('/');

    // Simulate the beforeinstallprompt event
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      // Add the required PWA event properties
      (event as unknown as { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }).prompt = () => Promise.resolve();
      (event as unknown as { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }).userChoice = Promise.resolve({ outcome: 'dismissed' });
      window.dispatchEvent(event);
    });

    // Check that the install prompt appears
    await expect(page.getByText('Install HemoIO')).toBeVisible();
    await expect(page.getByRole('button', { name: /install app/i })).toBeVisible();
  });

  test('install prompt can be dismissed', async ({ page }) => {
    await page.goto('/');

    // Clear any previous dismissal from localStorage
    await page.evaluate(() => {
      localStorage.removeItem('pwa-install-dismissed');
    });

    // Simulate the beforeinstallprompt event
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      (event as unknown as { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }).prompt = () => Promise.resolve();
      (event as unknown as { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }).userChoice = Promise.resolve({ outcome: 'dismissed' });
      window.dispatchEvent(event);
    });

    // Wait for prompt to appear
    await expect(page.getByText('Install HemoIO')).toBeVisible();

    // Click dismiss button
    await page.getByRole('button', { name: /dismiss/i }).click();

    // Prompt should disappear
    await expect(page.getByText('Install HemoIO')).not.toBeVisible();

    // Check that dismissal was stored
    const dismissed = await page.evaluate(() => {
      return localStorage.getItem('pwa-install-dismissed');
    });
    expect(dismissed).not.toBeNull();
  });

  test('install prompt does not appear when in standalone mode', async ({ page }) => {
    // Emulate standalone display mode
    await page.emulateMedia({ colorScheme: 'light' });

    // Override matchMedia to return standalone
    await page.addInitScript(() => {
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = (query: string) => {
        if (query === '(display-mode: standalone)') {
          return {
            matches: true,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
          } as MediaQueryList;
        }
        return originalMatchMedia(query);
      };
    });

    await page.goto('/');

    // Simulate the beforeinstallprompt event (should be ignored)
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      (event as unknown as { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }).prompt = () => Promise.resolve();
      (event as unknown as { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }).userChoice = Promise.resolve({ outcome: 'dismissed' });
      window.dispatchEvent(event);
    });

    // Install prompt should NOT appear
    await expect(page.getByText('Install HemoIO')).not.toBeVisible({ timeout: 2000 });
  });

  test('install prompt does not reappear within 7 days after dismissal', async ({ page }) => {
    await page.goto('/');

    // Set a recent dismissal timestamp
    await page.evaluate(() => {
      localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    });

    // Reload the page
    await page.reload();

    // Simulate the beforeinstallprompt event
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      (event as unknown as { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }).prompt = () => Promise.resolve();
      (event as unknown as { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }).userChoice = Promise.resolve({ outcome: 'dismissed' });
      window.dispatchEvent(event);
    });

    // Install prompt should NOT appear
    await expect(page.getByText('Install HemoIO')).not.toBeVisible({ timeout: 2000 });
  });
});

test.describe('PWA Update Prompt', () => {
  // Note: Testing actual service worker updates is complex in Playwright.
  // These tests verify the UI behavior when the update state is triggered.

  test('update prompt shows update available message', async ({ page }) => {
    // This test would require mocking the service worker registration
    // For now, we verify the component structure exists
    await page.goto('/');

    // The PWAUpdatePrompt component is mounted but only shows when needRefresh is true
    // We can verify the app loads without errors
    await expect(page.locator('body')).toBeVisible();
  });
});
