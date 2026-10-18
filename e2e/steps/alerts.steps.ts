/**
 * Step definitions for features/alerts.feature
 *
 * Alerts are shown on the Alerts view, opened from the navigation.
 */

import type { Locator, Page } from '@playwright/test';
import { setupOrUnlock } from './app.steps';
import { seedVisits, type LabVisit } from './trends.steps';

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
  await page.getByRole('navigation').getByRole('button', { name: /^Alerts/ }).click();
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

/** All individual alert cards */
export function alertCards(page: Page): Locator {
  return page.getByRole('main').getByRole('article', { name: /^Alert for / });
}

/** Alert cards for one biomarker */
export function alertCard(page: Page, biomarkerName: string): Locator {
  return page.getByRole('main').getByRole('article', { name: new RegExp(`^Alert for ${biomarkerName}:`) });
}
