import { test, expect } from '@playwright/test';

test.describe('Application', () => {
  test('loads successfully', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/HemoIO/);
  });
});
