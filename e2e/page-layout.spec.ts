/**
 * E2E tests for features/page-layout.feature
 *
 * Pages use all the width beside the menu, and nothing runs off a phone's
 * screen: wide tables scroll within their own box.
 */

import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { openFromMenu, setupOrUnlock } from './steps/app.steps';
import { seedLabData } from './steps/data.steps';
import { createTextLabReportPdf } from './steps/aiModelSelection.steps';
import { analyzeToReview, loginWithOllama, main } from './steps/importWizard.steps';
import { expandLabResult, labResultCard } from './steps/timeline.steps';
import { removeTempFile } from './steps/tempFiles';
import {
  MENU_PAGES,
  PHONE_SCREEN,
  WIDE_SCREEN,
  expectFullWidth,
  expectNoSidewaysScroll,
  expectTableScrollsOnItsOwn,
  expectShownInFull,
} from './steps/pageLayout.steps';

/** The seeded lab result with two tests, one of them abnormal */
const DAY = '2024-01-15';

async function openWithResults(page: Page): Promise<void> {
  await page.goto('/');
  await setupOrUnlock(page);
  await seedLabData(page);
}

test.describe('Page Layout', () => {
  test.describe('pages from the menu', () => {
    test.beforeEach(async ({ page }) => {
      await openWithResults(page);
    });

    test('every page uses the full width of a wide screen', async ({ page }) => {
      await page.setViewportSize(WIDE_SCREEN);
      for (const name of MENU_PAGES) {
        await openFromMenu(page, name);
        await test.step(name, () => expectFullWidth(page));
      }
    });

    test('no page scrolls sideways on a phone', async ({ page }) => {
      await page.setViewportSize(PHONE_SCREEN);
      for (const name of MENU_PAGES) {
        await openFromMenu(page, name);
        await test.step(name, () => expectNoSidewaysScroll(page));
      }
    });

    test('a wide table scrolls within its own box on a phone', async ({ page }) => {
      await page.setViewportSize(PHONE_SCREEN);

      const card = await expandLabResult(page, DAY);

      await expectNoSidewaysScroll(page);
      await expectTableScrollsOnItsOwn(card.getByRole('table', { name: 'Test values' }));
    });

    test("a lab result's summary is readable on a phone", async ({ page }) => {
      await page.setViewportSize(PHONE_SCREEN);

      const card = labResultCard(page, DAY);

      for (const badge of [card.getByText('2 tests'), card.getByText('1 abnormal')]) {
        await expectShownInFull(badge);
      }
    });
  });

  test.describe('import review', () => {
    let pdfPath: string;

    test.beforeEach(async ({ page }) => {
      await loginWithOllama(page);
      pdfPath = createTextLabReportPdf();
    });

    test.afterEach(() => {
      removeTempFile(pdfPath);
    });

    test('the import review uses the full width of a wide screen', async ({ page }) => {
      await page.setViewportSize(WIDE_SCREEN);

      await analyzeToReview(page, pdfPath);

      await expectFullWidth(page);
    });

    test('the lab date and name are readable on a phone', async ({ page }) => {
      await page.setViewportSize(PHONE_SCREEN);

      await analyzeToReview(page, pdfPath);

      await expectNoSidewaysScroll(page);
      // One above the other, each as wide as the other
      await expect
        .poll(async () => {
          const date = await main(page).getByRole('textbox', { name: 'Lab Date' }).boundingBox();
          const name = await main(page).getByRole('textbox', { name: 'Lab Name' }).boundingBox();
          return {
            stacked: name!.y > date!.y + date!.height,
            sameWidth: Math.abs(name!.width - date!.width) < 1,
          };
        })
        .toEqual({ stacked: true, sameWidth: true });
    });
  });
});
