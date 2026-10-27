/**
 * Steps for AI biomarker identification in review
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { reviewRows } from './unitConversion.steps';
import { continueToConfirm, saveResults } from './importWizard.steps';

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

/** When I continue and save the reviewed values */
export async function saveReviewed(page: Page): Promise<void> {
  await continueToConfirm(page);
  await saveResults(page);
  await expect(page.getByPlaceholder('Search by lab name')).toBeVisible();
}

/** The learned names list in Settings → Biomarkers */
export function learnedNames(page: Page): Locator {
  return page.getByRole('list', { name: 'Learned names' });
}

export async function openLearnedNames(page: Page): Promise<void> {
  await page.locator('nav').getByText('Settings', { exact: true }).click();
  await page.getByRole('tab', { name: 'Biomarkers' }).click();
}

export async function removeLearnedName(page: Page, name: string): Promise<void> {
  await openLearnedNames(page);
  await learnedNames(page)
    .getByRole('button', { name: `Remove ${name}` })
    .click();
  await expectNotLearned(page, name);
}

/** Then the name is not among the learned names (the list goes when it is empty) */
export async function expectNotLearned(page: Page, name: string): Promise<void> {
  await openLearnedNames(page);
  await expect(page.getByRole('tabpanel').getByText(name, { exact: false })).toHaveCount(0);
}
