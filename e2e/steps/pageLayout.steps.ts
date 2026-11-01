/**
 * Step definitions for features/page-layout.feature
 */

import { expect, type Locator, type Page } from '@playwright/test';

export const WIDE_SCREEN = { width: 1920, height: 1000 };
export const PHONE_SCREEN = { width: 390, height: 844 };

/** The pages the main menu opens, by the start of their menu label */
export const MENU_PAGES = ['Timeline', 'Import', 'Trends', 'Alerts', 'Notes', 'Biomarkers', 'Settings'];

/**
 * When I open a page from the menu — on a phone the menu opens from the
 * burger button and closes itself once a page is chosen
 */
export async function openFromMenu(page: Page, name: string): Promise<void> {
  const burger = page.getByRole('button', { name: 'Toggle navigation' });
  if (await burger.isVisible()) await burger.click();
  const item = page.getByRole('navigation').getByRole('button', { name: new RegExp(`^${name}`) });
  await item.click();
  await expect(item).toHaveAttribute('aria-current', 'page');
}

/**
 * The width of the main area inside its padding, and of its widest block
 */
async function mainWidths(page: Page): Promise<{ available: number; used: number }> {
  return page.getByRole('main').evaluate((main) => {
    const style = getComputedStyle(main);
    const available =
      main.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const used = Math.max(
      ...Array.from(main.children).map((child) => child.getBoundingClientRect().width)
    );
    return { available, used };
  });
}

/**
 * Then its content should fill the width beside the menu
 */
export async function expectFullWidth(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const { available, used } = await mainWidths(page);
      return available - used;
    })
    .toBeLessThan(1);
}

/**
 * Then the page should not scroll sideways
 */
export async function expectNoSidewaysScroll(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    )
    .toBeLessThanOrEqual(0);
}

/**
 * Whether an element's content is wider than the element itself, so it is
 * cut off or must be scrolled to be seen
 */
function isWiderThanShown(locator: Locator): Promise<boolean> {
  return locator.evaluate((el) => el.scrollWidth > el.clientWidth);
}

/**
 * Then it should be shown in full — once the layout has settled
 */
export async function expectShownInFull(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  await expect.poll(() => isWiderThanShown(locator)).toBe(false);
}

/**
 * Then I should be able to scroll the table of its values sideways — the
 * table's own scroll box is narrower than the table
 */
export async function expectTableScrollsOnItsOwn(table: Locator): Promise<void> {
  const box = table.locator('xpath=ancestor::*[contains(@class, "mantine-ScrollArea-viewport")][1]');
  await expect(box).toHaveCount(1);
  await expect.poll(() => isWiderThanShown(box)).toBe(true);
}
