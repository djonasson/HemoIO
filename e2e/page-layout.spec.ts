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
import {
  analyzeToReview,
  continueToConfirm,
  goToImport,
  loginWithOllama,
  main,
  reviewRow,
} from './steps/importWizard.steps';
import { changeTest, NOT_A_LOINC_TEST } from './steps/identification.steps';
import { analyzeReport } from './steps/unitConversion.steps';
import { expandLabResult, labResultCard } from './steps/timeline.steps';
import { removeTempFile } from './steps/tempFiles';
import { noteSeed } from './steps/userNotes.steps';
import {
  MENU_PAGES,
  NARROW_PHONE_SCREEN,
  PHONE_SCREEN,
  WIDE_SCREEN,
  expectFullWidth,
  expectNoSidewaysScroll,
  expectTableScrollsOnItsOwn,
  expectNotATabStop,
  expectShownInFull,
  leaveWindow,
  scrollBoxOf,
} from './steps/pageLayout.steps';

/** A file name with no spaces to wrap at, too long for a phone */
const LONG_FILE_NAME = 'Referto_Laboratorio_Analisi_Cliniche_Gennaio_2024.pdf';

/** The seeded lab result with two tests, one of them abnormal */
const DAY = '2024-01-15';

async function openWithResults(page: Page): Promise<void> {
  await page.goto('/');
  await setupOrUnlock(page);
  // A note on the lab result adds a badge to its summary
  await seedLabData(page, { userNotes: [noteSeed(1, { labResultId: 1 }, 'Fasting')] });
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
      await expectTableScrollsOnItsOwn(
        card.getByRole('table', { name: 'Test values' }),
        'Test values, scrollable'
      );
    });

    test('a scrollable table keeps keyboard focus when the screen widens', async ({ page }) => {
      // Scenario: A scrollable table keeps keyboard focus when the screen widens
      await page.setViewportSize(PHONE_SCREEN);
      const card = await expandLabResult(page, DAY);
      const table = card.getByRole('table', { name: 'Test values' });
      await expectTableScrollsOnItsOwn(table, 'Test values, scrollable');
      const box = scrollBoxOf(table);
      await expect(box).toBeFocused();

      await page.setViewportSize(WIDE_SCREEN);

      // Nothing left to scroll, yet the keyboard is not sent back to the page
      await expect.poll(() => box.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
      await expect(box).toBeFocused();
    });

    test('a table that fits again leaves the Tab order once the keyboard moves on', async ({
      page,
    }) => {
      // Scenario: A table that fits again leaves the Tab order once the keyboard has moved on
      await page.setViewportSize(PHONE_SCREEN);
      const card = await expandLabResult(page, DAY);
      const table = card.getByRole('table', { name: 'Test values' });
      await expectTableScrollsOnItsOwn(table, 'Test values, scrollable');
      const box = scrollBoxOf(table);

      await page.keyboard.press('Tab');
      await expect(box).not.toBeFocused();
      await expect(page.locator(':focus')).toHaveCount(1);
      await page.setViewportSize(WIDE_SCREEN);

      await expectNotATabStop(box);
    });

    test('a scrollable table keeps keyboard focus while in another window', async ({ page }) => {
      // Scenario: A scrollable table keeps keyboard focus while I am in another window
      await page.setViewportSize(PHONE_SCREEN);
      const card = await expandLabResult(page, DAY);
      const table = card.getByRole('table', { name: 'Test values' });
      await expectTableScrollsOnItsOwn(table, 'Test values, scrollable');
      const box = scrollBoxOf(table);

      const comeBack = await leaveWindow(page);
      await page.setViewportSize(WIDE_SCREEN);
      await expect.poll(() => box.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
      await comeBack();

      await expect(box).toBeFocused();
      await expect(box).toHaveAttribute('tabindex', '0');
    });

    test("a lab result's summary is readable on a phone", async ({ page }) => {
      await page.setViewportSize(NARROW_PHONE_SCREEN);

      const card = labResultCard(page, DAY);

      // Each badge's text, which a badge cuts off when squeezed
      const notesCount = card.getByLabel('1 note').getByText('1', { exact: true });
      for (const badge of [card.getByText('2 tests'), card.getByText('1 abnormal'), notesCount]) {
        await expectShownInFull(badge);
      }
    });
  });

  test.describe('import review', () => {
    let pdfPath: string;

    test.beforeEach(async ({ page }) => {
      pdfPath = createTextLabReportPdf();
      await loginWithOllama(page);
    });

    test('the import wizard uses the full width of a wide screen from its first step', async ({
      page,
    }) => {
      await page.setViewportSize(WIDE_SCREEN);

      await goToImport(page);

      await expectFullWidth(page);
    });

    test('the import wizard does not scroll sideways on a phone', async ({ page }) => {
      await page.setViewportSize(NARROW_PHONE_SCREEN);

      await goToImport(page);

      await expectNoSidewaysScroll(page);
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

  test.describe('import confirm step', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
    });

    test('a long file name wraps on a phone', async ({ page }) => {
      // Scenario: A long file name wraps on a phone
      await page.setViewportSize(NARROW_PHONE_SCREEN);
      const shownName = main(page).getByText(LONG_FILE_NAME, { exact: true });
      const expectNameInFull = async (): Promise<void> => {
        await expectNoSidewaysScroll(page);
        await expectShownInFull(shownName);
      };

      await analyzeReport(
        page,
        [{ name: 'Glicemia', value: 90, unit: 'mg/dL', confidence: 0.95 }],
        1,
        {
          fileName: LONG_FILE_NAME,
          onUploaded: async () => {
            await test.step('upload', async () => {
              await expectNameInFull();
              const remove = main(page).getByRole('button', { name: `Remove ${LONG_FILE_NAME}` });
              await remove.scrollIntoViewIfNeeded();
              await expect(remove).toBeInViewport({ ratio: 1 });
            });
          },
          onAnalyzed: () => test.step('analysis', expectNameInFull),
        }
      );
      await test.step('review', expectNameInFull);

      await changeTest(page, reviewRow(page, 'Glicemia'), NOT_A_LOINC_TEST);
      await continueToConfirm(page);
      await test.step('confirm', expectNameInFull);
    });

    test('a long file name wraps on a phone when the file has no values', async ({ page }) => {
      // Scenario: A long file name wraps on a phone when the file has no values
      await page.setViewportSize(NARROW_PHONE_SCREEN);

      await analyzeReport(page, [], 1, { fileName: LONG_FILE_NAME, toReview: false });

      await expectNoSidewaysScroll(page);
      await expectShownInFull(main(page).getByText(LONG_FILE_NAME, { exact: true }));
      await expectShownInFull(main(page).getByText(`${LONG_FILE_NAME} has no values yet`));
    });

    test('the values to import do not push a phone sideways', async ({ page }) => {
      // Scenario: The values to import scroll within their own box on a phone
      await page.setViewportSize(NARROW_PHONE_SCREEN);
      // Long words a table cannot wrap at
      await analyzeReport(page, [
        { name: 'Gamma-glutamiltransferasi', value: 25, unit: 'U/L', confidence: 0.95 },
        { name: 'Rapporto albumina/creatinina', value: 12, unit: 'mg/g', confidence: 0.95 },
        { name: 'eGFR', value: 95, unit: 'mL/min/1.73m²', confidence: 0.95 },
      ]);
      for (const name of ['Gamma-glutamiltransferasi', 'Rapporto albumina/creatinina', 'eGFR']) {
        await changeTest(page, reviewRow(page, name), NOT_A_LOINC_TEST);
      }

      await continueToConfirm(page);

      await expectNoSidewaysScroll(page);
      await expectTableScrollsOnItsOwn(
        main(page).getByRole('table'),
        'Values of lab-report.pdf, scrollable'
      );
    });
  });
});
