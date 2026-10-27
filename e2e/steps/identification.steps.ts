/**
 * Steps for AI biomarker identification in review
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { reviewRows } from './unitConversion.steps';

/** The review row whose value cell shows `value` */
export function rowFor(page: Page, value: string): Locator {
  return reviewRows(page).filter({ has: page.getByRole('cell', { name: value, exact: true }) });
}

/** The row's "Saved as" cell */
export function savedAsCell(row: Locator): Locator {
  return row.getByTestId('saved-as');
}

/** When I change the row's test to `testName` */
export async function changeTest(page: Page, row: Locator, testName: string): Promise<void> {
  await row.getByRole('button', { name: /^Change test for / }).click();
  const dialog = page.getByRole('dialog', { name: /Saved as/ });
  await dialog.getByRole('textbox', { name: 'Search tests' }).fill(testName);
  await dialog.getByRole('option', { name: testName, exact: true }).click();
  await expect(dialog).toBeHidden();
}
