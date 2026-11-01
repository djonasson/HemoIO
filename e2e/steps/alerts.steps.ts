/**
 * Step definitions for features/alerts.feature
 *
 * Alerts are shown on the Alerts view, opened from the navigation.
 */

import { expect, type Locator, type Page } from '@playwright/test';
import { openFromMenu, setupOrUnlock } from './app.steps';
import { waitForAnimations } from './timeline.steps';
import { seedVisits, type LabVisit } from './trends.steps';
import { readStoredRows } from './dataAtRest.steps';

/** Mantine red-6 / orange-6, used for the alert's left border indicator */
export const RED_INDICATOR = 'rgb(250, 82, 82)';
export const ORANGE_INDICATOR = 'rgb(253, 126, 20)';

/**
 * Given the application is set up and unlocked, and I have these lab visits
 */
export async function seedAlertData(page: Page, visits: LabVisit[]): Promise<void> {
  await page.goto('/');
  await setupOrUnlock(page);
  await seedVisits(page, visits);
}

/**
 * When I view the alerts
 */
export async function viewAlerts(page: Page): Promise<void> {
  await openFromMenu(page, 'Alerts');
}

/**
 * Acknowledge a test's card and wait until the browser has stored it: the
 * card goes at once, before the save is kept
 */
export async function acknowledgeAndWaitForSave(page: Page, biomarkerName: string): Promise<void> {
  // Sealed records keep their ciphertext as text
  const stored = async (): Promise<string> => JSON.stringify((await readStoredRows(page)).userPreferences);
  const before = await stored();
  await acknowledgeButton(alertCard(page, biomarkerName), biomarkerName).click();
  await expect.poll(stored).not.toBe(before);
}

/**
 * Reload the app (a new page load), unlock it and return to the alerts
 */
export async function reloadAndViewAlerts(page: Page): Promise<void> {
  await page.reload();
  await setupOrUnlock(page);
  await viewAlerts(page);
}

/** The alerts summary panel header ("Alerts") */
export function alertsHeader(page: Page): Locator {
  return page.getByRole('main').getByText('Alerts', { exact: true });
}

/** All alert cards, one per test */
export function alertCards(page: Page): Locator {
  return page.getByRole('main').getByRole('article', { name: /^Alert for / });
}

/** The alert card for one test */
export function alertCard(page: Page, biomarkerName: string): Locator {
  return page.getByRole('main').getByRole('article', { name: new RegExp(`^Alert for ${biomarkerName}:`) });
}

/** The button that acknowledges every result of a test's card */
export function acknowledgeButton(card: Locator, biomarkerName: string): Locator {
  return card.getByRole('button', { name: `Acknowledge all ${biomarkerName} results`, exact: true });
}

/** The button that dismisses a test's card until the next page load */
export function dismissButton(card: Locator, biomarkerName: string): Locator {
  return card.getByRole('button', { name: `Dismiss ${biomarkerName} alert`, exact: true });
}

/** The toggle that shows or hides a card's earlier results */
export function earlierResultsToggle(card: Locator): Locator {
  return card.getByRole('button', { name: /earlier results?$/ });
}

/**
 * And I expand the alert card: show its earlier results and wait for the
 * Collapse animation, so a click inside it does not land mid-move
 */
export async function expandEarlierResults(card: Locator): Promise<void> {
  const toggle = earlierResultsToggle(card);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await waitForAnimations(card);
}

/** A card's earlier results, most recent first; each opens its trend */
export function earlierResults(card: Locator, biomarkerName: string): Locator {
  return card
    .getByRole('list', { name: `Earlier ${biomarkerName} results`, exact: true })
    .getByRole('button');
}
