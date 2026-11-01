/**
 * Step definitions for features/page-layout.feature
 */

import { expect, type Locator, type Page } from '@playwright/test';

export const WIDE_SCREEN = { width: 1920, height: 1000 };
export const PHONE_SCREEN = { width: 390, height: 844 };
/** The narrowest width pages must reflow to (WCAG 1.4.10) */
export const NARROW_PHONE_SCREEN = { width: 320, height: 640 };

/** The pages the main menu opens, by the start of their menu label */
export const MENU_PAGES = ['Timeline', 'Import', 'Trends', 'Alerts', 'Notes', 'Biomarkers', 'Settings'];

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
 * The ancestors that cut off part of an element: those that clip what
 * overflows them (any overflow but "visible") and do not hold all of the
 * element's box. The page itself is left to toBeInViewport, as the root's
 * and body's overflow apply to the viewport rather than to their own box.
 */
function clippingAncestors(locator: Locator): Promise<string[]> {
  return locator.evaluate((el) => {
    const shown = el.getBoundingClientRect();
    // Sub-pixel rounding of the layout
    const slack = 0.5;
    const clipping: string[] = [];
    for (
      let ancestor = el.parentElement;
      ancestor && ancestor !== document.body;
      ancestor = ancestor.parentElement
    ) {
      const style = getComputedStyle(ancestor);
      const clipsX = style.overflowX !== 'visible';
      const clipsY = style.overflowY !== 'visible';
      if (!clipsX && !clipsY) continue;
      // Its padding box: what it shows of its content
      const box = ancestor.getBoundingClientRect();
      const left = box.left + ancestor.clientLeft;
      const top = box.top + ancestor.clientTop;
      const cutX =
        clipsX && (shown.left < left - slack || shown.right > left + ancestor.clientWidth + slack);
      const cutY =
        clipsY && (shown.top < top - slack || shown.bottom > top + ancestor.clientHeight + slack);
      if (cutX || cutY) {
        const classes = Array.from(ancestor.classList, (name) => `.${name}`).join('');
        clipping.push(`${ancestor.tagName.toLowerCase()}${classes}`);
      }
    }
    return clipping;
  });
}

/**
 * Then it should be shown in full — once the layout has settled: its
 * content fits it, and, once scrolled to, nothing around it nor the edge of
 * the screen cuts any of it off
 */
export async function expectShownInFull(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  await expect.poll(() => isWiderThanShown(locator)).toBe(false);
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeInViewport({ ratio: 1 });
  await expect.poll(() => clippingAncestors(locator)).toEqual([]);
}

/**
 * Then I should be able to scroll the table sideways, also by keyboard: the
 * table's own scroll box is narrower than the table, takes focus under its
 * name, and scrolls with the arrow keys
 */
export async function expectTableScrollsOnItsOwn(table: Locator, boxName: string): Promise<void> {
  const box = scrollBoxOf(table);
  await expect.poll(() => isWiderThanShown(box)).toBe(true);
  await expect(box).toHaveAccessibleName(boxName);
  // In the Tab order, not only focusable by script
  await expect(box).toHaveAttribute('tabindex', '0');

  await box.focus();
  await expect(box).toBeFocused();
  await box.page().keyboard.press('ArrowRight');
  await expect.poll(() => box.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
}

/**
 * The scroll box that holds a table
 */
export function scrollBoxOf(table: Locator): Locator {
  return table.locator('xpath=ancestor::*[@data-scroll-box][1]');
}

/**
 * Then the box should no longer be a stop for the Tab key — nor a region
 * to land on — once nothing in it overflows
 */
export async function expectNotATabStop(box: Locator): Promise<void> {
  await expect.poll(() => isWiderThanShown(box)).toBe(false);
  await expect(box).not.toHaveAttribute('tabindex');
  await expect(box).not.toHaveAttribute('role');
}

/**
 * When I switch to another window, and later come back to this one.
 *
 * Headless Chromium and Firefox keep every page focused: bringing another
 * page of the context to the front blurs nothing (nor does it in Chromium
 * with CDP focus emulation turned off). So leaving is played the way a
 * browser does it: the focused element gets blur and focusout while
 * document.hasFocus() is false, and stays the document's active element.
 * Coming back plays the focus and focusin a browser gives it on return.
 * Returns the step that comes back.
 */
export async function leaveWindow(page: Page): Promise<() => Promise<void>> {
  await page.evaluate(() => {
    const focused = document.activeElement!;
    Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => false });
    focused.dispatchEvent(new FocusEvent('blur'));
    focused.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    window.dispatchEvent(new FocusEvent('blur'));
  });
  return async () => {
    await page.evaluate(() => {
      // Back to Document.prototype.hasFocus
      delete (document as { hasFocus?: unknown }).hasFocus;
      window.dispatchEvent(new FocusEvent('focus'));
      const focused = document.activeElement!;
      focused.dispatchEvent(new FocusEvent('focus'));
      focused.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });
  };
}
