import { test, expect } from './fixtures';

test.describe('Application', () => {
  test('loads successfully', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/HemoIO/);
  });
});
