/**
 * E2E tests for features/pull-to-refresh.feature: pulling the page down
 * refreshes from the folder in place, never reloading (a reload locks
 * HemoIO).
 */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { TEST_PASSWORD, expectUnlocked, openFromMenu, setupOrUnlock } from './steps/app.steps';
import { SEED_LAB_RESULTS, seedLabData } from './steps/data.steps';
import { FOLDER_COPY, TEST_FOLDER_NAME, TestFolder, storeDataInFolder, syncAttempts, useTestFolder } from './steps/folderSync.steps';
import { ancestryOfFolderCopy, saveCopyAsAnotherComputer } from './steps/otherComputer.steps';

test.use({ hasTouch: true });

const OTHER_RESULT = {
  id: 3,
  date: '2024-03-12T09:00:00.000Z',
  labName: 'Other Device Clinic',
  createdAt: '2024-03-12T09:00:00.000Z',
  updatedAt: '2024-03-12T09:00:00.000Z',
};

/** When I pull the page down by `distance` pixels, from its top, with one finger */
async function pullDown(page: Page, distance: number): Promise<void> {
  await page.evaluate((pulled) => {
    const point = (clientY: number) => new Touch({ identifier: 1, target: document.body, clientX: 200, clientY });
    window.dispatchEvent(new TouchEvent('touchstart', { touches: [point(100)] }));
    window.dispatchEvent(new TouchEvent('touchmove', { touches: [point(100 + pulled / 2)] }));
    window.dispatchEvent(new TouchEvent('touchmove', { touches: [point(100 + pulled)] }));
    window.dispatchEvent(new TouchEvent('touchend', { touches: [] }));
  }, distance);
}

test.describe('Pulling down', () => {
  test('never reloads the page', async ({ page }) => {
    // Scenario: Pulling down never reloads the page
    await page.goto('/');
    await setupOrUnlock(page);
    // The browser's own pull-to-reload is off
    for (const element of ['html', 'body']) {
      await expect(page.locator(element)).toHaveCSS('overscroll-behavior-y', 'contain');
    }
    const loaded = await page.evaluate(() => performance.timeOrigin);
    await pullDown(page, 200);
    await expectUnlocked(page);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(loaded);
    // No folder copy: nothing to refresh from
    await expect(page.getByRole('button', { name: 'Refresh from folder' })).toHaveCount(0);
  });
});

test.describe('Pulling down with a folder copy', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Folder storage needs the File System Access API, which only Chromium has'
  );

  /** Background: unlocked, the seeded lab results synced to a folder */
  test.beforeEach(async ({ page }) => {
    // The test's own clock: the periodic sync never runs on its own
    await page.clock.install();
    await useTestFolder(page);
    const folder = new TestFolder(page);
    await page.goto('/');
    await setupOrUnlock(page);
    await seedLabData(page);
    await storeDataInFolder(page);
    await expect.poll(() => folder.read(FOLDER_COPY)).not.toBeNull();
    await openFromMenu(page, 'Timeline');
  });

  test('syncs with the folder', async ({ page }) => {
    // Scenario: Pulling down with a folder copy syncs with the folder
    await saveCopyAsAnotherComputer(page, {
      password: TEST_PASSWORD,
      data: { labResults: [...SEED_LAB_RESULTS, OTHER_RESULT] },
      folderName: TEST_FOLDER_NAME,
      ancestors: await ancestryOfFolderCopy(page, TEST_PASSWORD),
    });
    const before = await syncAttempts(page);
    await pullDown(page, 200);
    await expect.poll(() => syncAttempts(page)).toBeGreaterThan(before);
    await expect(page.getByText('Other Device Clinic')).toBeVisible();
    await expectUnlocked(page);
  });

  test('a short pull does nothing', async ({ page }) => {
    // Scenario: A short pull, or one from further down the page, does nothing
    // Every time HemoIO says it is refreshing
    await page.evaluate(() => {
      const win = window as unknown as { __refreshes: number };
      win.__refreshes = 0;
      let saying = false;
      new MutationObserver(() => {
        const now = document.body.innerText.includes('Refreshing from the folder…');
        if (now && !saying) win.__refreshes += 1;
        saying = now;
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    const refreshes = () => page.evaluate(() => (window as unknown as { __refreshes: number }).__refreshes);
    await pullDown(page, 40);
    // Then a full pull: its refresh is the only one
    await pullDown(page, 200);
    await expect.poll(refreshes).toBe(1);
    await expect(page.getByRole('button', { name: 'Refresh from folder' })).toBeEnabled();
    expect(await refreshes()).toBe(1);
  });

  test('refreshes from the header with the keyboard', async ({ page }) => {
    // Scenario: Refreshing from the folder with the keyboard
    const before = await syncAttempts(page);
    const refresh = page.getByRole('button', { name: 'Refresh from folder' });
    await refresh.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => syncAttempts(page)).toBeGreaterThan(before);
    await expectUnlocked(page);
  });
});
