/**
 * Steps for AI biomarker identification in review
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { reviewRows } from './unitConversion.steps';
import { continueToConfirm, main, saveResults } from './importWizard.steps';
import { openFromMenu } from './app.steps';

/** The review row whose value cell shows `value` */
export function rowFor(page: Page, value: string): Locator {
  return reviewRows(page).filter({ has: page.getByRole('cell', { name: value, exact: true }) });
}

/** The row's "Saved as" cell */
export function savedAsCell(row: Locator): Locator {
  return row.getByTestId('saved-as');
}

/** The review row being edited */
export function editingRow(page: Page): Locator {
  return main(page).getByRole('row').filter({ has: page.getByRole('button', { name: 'Save changes' }) });
}

/** When I edit the row's name and unit (either may be left as it is) and save the edit */
export async function editRow(
  page: Page,
  row: Locator,
  edit: { name?: string; unit?: string }
): Promise<void> {
  await row.getByRole('button', { name: 'Edit biomarker' }).click();
  const editing = editingRow(page);
  if (edit.name !== undefined) await editing.getByPlaceholder('Biomarker name').fill(edit.name);
  if (edit.unit !== undefined) await editing.getByPlaceholder('Unit', { exact: true }).fill(edit.unit);
  await editing.getByRole('button', { name: 'Save changes' }).click();
}

/** Then the row carries no label that asks for a check, of any kind */
export async function expectNoCheckLabel(row: Locator): Promise<void> {
  await expect(row.getByTestId('check-labels')).toHaveCount(0);
}

/** When I change the row's test to `testName` */
export async function changeTest(page: Page, row: Locator, testName: string): Promise<void> {
  await row.getByRole('button', { name: /^Change test for / }).click();
  const dialog = page.getByRole('dialog', { name: /Saved as/ });
  await dialog.getByRole('textbox', { name: 'Search tests' }).fill(testName);
  await dialog.getByRole('button', { name: testName, exact: true }).click();
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
  await openFromMenu(page, 'Settings');
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
