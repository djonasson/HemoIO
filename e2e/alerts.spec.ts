/**
 * E2E Tests for Alerts
 *
 * Implements features/alerts.feature: the alerts summary for abnormal values,
 * one card per test with its earlier results, severity indicators, ordering,
 * trend and improvement alerts, dismiss/acknowledge actions per test, category
 * filtering, the navigation badge, timestamps and accessibility.
 */

import { test, expect } from './fixtures';
import { setupOrUnlock } from './steps/app.steps';
import { seedLabData } from './steps/data.steps';
import {
  ORANGE_INDICATOR,
  RED_INDICATOR,
  acknowledgeButton,
  alertCard,
  alertCards,
  alertsHeader,
  dismissButton,
  earlierResults,
  earlierResultsToggle,
  expandEarlierResults,
  reloadAndViewAlerts,
  seedAlertData,
  viewAlerts,
} from './steps/alerts.steps';
import {
  GLUCOSE,
  HDL,
  HEMOGLOBIN,
  biomarkerSelect,
  buildLabData,
  goToTrends,
  selectBiomarker,
  type LabVisit,
} from './steps/trends.steps';

/**
 * A normal baseline visit followed by one with three abnormal values from
 * three categories: glucose high (metabolic), hemoglobin low (CBC), HDL low
 * (lipid).
 */
const ABNORMAL_VISITS: LabVisit[] = [
  {
    date: '2024-01-15',
    labName: 'Quest Diagnostics',
    values: [
      { biomarker: GLUCOSE, value: 90 },
      { biomarker: HEMOGLOBIN, value: 14 },
      { biomarker: HDL, value: 50 },
    ],
  },
  {
    date: '2024-03-10',
    labName: 'LabCorp',
    values: [
      { biomarker: GLUCOSE, value: 150 },
      { biomarker: HEMOGLOBIN, value: 10 },
      { biomarker: HDL, value: 30 },
    ],
  },
];

test.describe('Alerts', () => {
  test.describe('Empty State', () => {
    test('should show empty trends state when no data exists', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await page.getByRole('navigation').getByRole('button', { name: /^Trends/ }).click();

      await expect(page.getByRole('main').getByText(/no lab results yet/i)).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('trends/alerts view should be keyboard navigable', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);
      await page.getByRole('navigation').getByRole('button', { name: /^Trends/ }).click();
      const importButton = page.getByRole('main').getByRole('button', { name: /import lab results/i });
      await expect(importButton).toBeVisible();

      await expect(async () => {
        await page.keyboard.press('Tab');
        await expect(importButton).toBeFocused({ timeout: 100 });
      }).toPass();
    });
  });
});

test.describe('Alerts with Data', () => {
  // Scenario: View out-of-range alerts summary
  test('should display alerts summary panel', async ({ page }) => {
    await seedAlertData(page, ABNORMAL_VISITS);
    await viewAlerts(page);

    await expect(alertsHeader(page)).toBeVisible();
    await expect(alertCards(page).first()).toBeVisible();
  });

  // Scenario: View out-of-range alerts summary — count of abnormal values
  test('should display count of abnormal values', async ({ page }) => {
    await seedAlertData(page, ABNORMAL_VISITS);
    await viewAlerts(page);

    await expect(alertsHeader(page)).toBeVisible();
    await expect(page.getByRole('main').getByText('3 new', { exact: true })).toBeVisible();
    await expect(alertCards(page)).toHaveCount(3);
  });

  // Scenario: High value alert display
  test('should show high value alert with red indicator', async ({ page }) => {
    await seedAlertData(page, [
      { date: '2024-03-10', values: [{ biomarker: GLUCOSE, value: 150 }] },
    ]);
    await viewAlerts(page);

    const card = alertCard(page, 'Glucose');
    await expect(card).toBeVisible();
    await expect(card.getByText('Glucose', { exact: true })).toBeVisible();
    await expect(card.getByText(/^high$/i)).toBeVisible();
    await expect(card).toContainText('150 mg/dL');
    await expect(card).toContainText(/70\s*-\s*100/);
    await expect(card).toHaveCSS('border-left-color', RED_INDICATOR);
  });

  // Scenario: Low value alert display
  test('should show low value alert with orange indicator', async ({ page }) => {
    await seedAlertData(page, [
      { date: '2024-03-10', values: [{ biomarker: HEMOGLOBIN, value: 10 }] },
    ]);
    await viewAlerts(page);

    const card = alertCard(page, 'Hemoglobin');
    await expect(card).toBeVisible();
    await expect(card.getByText('Hemoglobin', { exact: true })).toBeVisible();
    await expect(card.getByText(/^low$/i)).toBeVisible();
    await expect(card).toContainText('10 g/dL');
    await expect(card).toContainText(/12\s*-\s*17\.5/);
    await expect(card).toHaveCSS('border-left-color', ORANGE_INDICATOR);
  });

  // Scenario: One alert card per test
  test('shows one card per test with its latest value and counts', async ({ page }) => {
    await seedAlertData(page, [
      { date: '2024-01-15', values: [{ biomarker: GLUCOSE, value: 150 }, { biomarker: HEMOGLOBIN, value: 14 }] },
      { date: '2024-03-10', values: [{ biomarker: GLUCOSE, value: 130 }, { biomarker: HEMOGLOBIN, value: 10 }] },
    ]);
    await viewAlerts(page);

    await expect(alertCards(page)).toHaveCount(2);
    const glucose = alertCard(page, 'Glucose');
    await expect(glucose).toContainText('130 mg/dL');
    await expect(glucose.getByText('2 results · 2 new', { exact: true })).toBeVisible();
    await expect(alertCard(page, 'Hemoglobin').getByText('1 result · 1 new', { exact: true })).toBeVisible();
    // The flat list's separate summary is gone
    await expect(page.getByRole('main').getByText('By Biomarker', { exact: true })).toHaveCount(0);
  });

  // Scenario: Expand an alert card to see earlier results
  test('expands a card to show its earlier results, most recent first', async ({ page }) => {
    await seedAlertData(page, [
      { date: '2024-01-15', labName: 'January Lab', values: [{ biomarker: GLUCOSE, value: 150 }] },
      { date: '2024-03-10', labName: 'March Lab', values: [{ biomarker: GLUCOSE, value: 140 }] },
      { date: '2024-05-20', labName: 'May Lab', values: [{ biomarker: GLUCOSE, value: 130 }] },
    ]);
    await viewAlerts(page);

    const card = alertCard(page, 'Glucose');
    await expect(card.getByText('3 results · 3 new', { exact: true })).toBeVisible();
    await expect(earlierResults(card, 'Glucose')).toHaveCount(0);

    await expandEarlierResults(card);

    const rows = earlierResults(card, 'Glucose');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Mar 10, 2024');
    await expect(rows.nth(0)).toContainText('140 mg/dL');
    await expect(rows.nth(0)).toContainText('March Lab');
    await expect(rows.nth(1)).toContainText('Jan 15, 2024');
    await expect(rows.nth(1)).toContainText('150 mg/dL');
    await expect(rows.nth(1)).toContainText('January Lab');
  });

  // Scenario: Open an earlier result in Trends
  test('opens an earlier result in Trends at its date', async ({ page }) => {
    await seedAlertData(page, [
      { date: '2024-01-15', values: [{ biomarker: GLUCOSE, value: 150 }] },
      { date: '2024-03-10', values: [{ biomarker: GLUCOSE, value: 130 }] },
    ]);
    await viewAlerts(page);

    const card = alertCard(page, 'Glucose');
    await expandEarlierResults(card);
    await earlierResults(card, 'Glucose').first().click();

    await expect(
      page.getByRole('navigation').getByRole('button', { name: /^Trends/ })
    ).toHaveAttribute('aria-current', 'page');
    await expect(biomarkerSelect(page)).toHaveValue(/^Glucose \(/);
    await expect(
      page.getByRole('main').locator('[aria-label="Jan 15, 24: 150 mg/dL (high)"]')
    ).toHaveAttribute('aria-current', 'true');
  });

  // Scenario: Most recent values shown first
  test('should sort alerts with most recent first', async ({ page }) => {
    // Each value is only slightly out of range, so all share one severity
    await seedAlertData(page, [
      { date: '2024-01-15', labName: 'January Lab', values: [{ biomarker: GLUCOSE, value: 110 }] },
      { date: '2024-03-10', labName: 'March Lab', values: [{ biomarker: HDL, value: 36 }] },
      { date: '2024-05-20', labName: 'May Lab', values: [{ biomarker: HEMOGLOBIN, value: 11 }] },
    ]);
    await viewAlerts(page);

    const cards = alertCards(page);
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0)).toContainText('May Lab');
    await expect(cards.nth(1)).toContainText('March Lab');
    await expect(cards.nth(2)).toContainText('January Lab');

    for (const card of await cards.all()) {
      await expect(card.getByText(/^(\d+ (days?|weeks?|months?|years?) ago|Today|Yesterday)$/)).toBeVisible();
    }
  });

  // Scenario: Trend alert for consistent direction
  test('should show trend alert for consistent direction', async ({ page }) => {
    await seedAlertData(page, [
      { date: '2024-01-10', values: [{ biomarker: HEMOGLOBIN, value: 11.5 }] },
      { date: '2024-02-10', values: [{ biomarker: HEMOGLOBIN, value: 11.0 }] },
      { date: '2024-03-10', values: [{ biomarker: HEMOGLOBIN, value: 10.5 }] },
      { date: '2024-04-10', values: [{ biomarker: HEMOGLOBIN, value: 10.0 }] },
    ]);
    await viewAlerts(page);

    const trendAlert = alertCard(page, 'Hemoglobin').filter({
      has: page.getByText('Trend', { exact: true }),
    });
    await expect(trendAlert).toBeVisible();
    await expect(trendAlert).toContainText('Consistently decreasing');
    // Timeframe of the trend: four monthly readings span three months
    await expect(trendAlert).toContainText(/3 months/);
  });

  // Scenario: No alerts when all values are normal
  test('should show success message when all values normal', async ({ page }) => {
    await seedAlertData(page, [
      { date: '2024-01-15', values: [{ biomarker: GLUCOSE, value: 90 }, { biomarker: HEMOGLOBIN, value: 14 }] },
    ]);
    await viewAlerts(page);

    await expect(page.getByRole('main').getByText('All values within normal range')).toBeVisible();
    await expect(alertCards(page)).toHaveCount(0);
  });

  // Scenario: Nothing to check before any values are imported
  test('says there is nothing to check before any values are imported', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    await viewAlerts(page);

    const main = page.getByRole('main');
    await expect(main.getByText('No values to check yet')).toBeVisible();
    await expect(main.getByText('All values within normal range')).toBeHidden();
  });

  // Scenario: Alert priority based on severity
  test('should show critical alerts before warning alerts', async ({ page }) => {
    // Hemoglobin is the more recent value, so date order alone would put it first
    await seedAlertData(page, [
      { date: '2024-01-15', values: [{ biomarker: GLUCOSE, value: 180 }] },
      { date: '2024-03-10', values: [{ biomarker: HEMOGLOBIN, value: 11.5 }] },
    ]);
    await viewAlerts(page);

    const cards = alertCards(page);
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toHaveAccessibleName(/^Alert for Glucose:/);
    await expect(cards.nth(1)).toHaveAccessibleName(/^Alert for Hemoglobin:/);

    // Critical is red, warning is orange
    await expect(cards.nth(0)).toHaveCSS('border-left-color', RED_INDICATOR);
    await expect(cards.nth(1)).toHaveCSS('border-left-color', ORANGE_INDICATOR);
  });

  // Scenario: Click alert to view details
  test('should navigate to trend on alert click', async ({ page }) => {
    await seedAlertData(page, ABNORMAL_VISITS);
    await viewAlerts(page);

    await alertCard(page, 'Glucose').click();

    await expect(
      page.getByRole('navigation').getByRole('button', { name: /^Trends/ })
    ).toHaveAttribute('aria-current', 'page');
    await expect(biomarkerSelect(page)).toHaveValue(/^Glucose \(/);
    await expect(
      page.getByRole('main').locator('[aria-label="Mar 10, 24: 150 mg/dL (high)"]')
    ).toBeVisible();
    await expect(
      page.getByRole('main').locator('[aria-label="Mar 10, 24: 150 mg/dL (high)"]')
    ).toHaveAttribute('aria-current', 'true');

    // The highlight belongs to the alert's biomarker, not to other biomarkers on that day
    await selectBiomarker(page, 'Hemoglobin');
    await expect(
      page.getByRole('main').locator('[aria-label="Mar 10, 24: 10 g/dL (low)"]')
    ).toBeVisible();
    await expect(page.getByRole('main').locator('[aria-current="true"]')).toHaveCount(0);
  });

  // Scenario: Dismiss alert temporarily
  test('should dismiss alert when dismiss button clicked', async ({ page }) => {
    await seedAlertData(page, ABNORMAL_VISITS);
    await viewAlerts(page);

    const glucose = alertCard(page, 'Glucose');
    await expect(glucose).toBeVisible();
    await dismissButton(glucose, 'Glucose').click();

    await expect(glucose).toBeHidden();
    await expect(alertCard(page, 'Hemoglobin')).toBeVisible();

    await reloadAndViewAlerts(page);
    await expect(alertCard(page, 'Glucose')).toBeVisible();
  });

  // Scenario: Acknowledge alert persistently
  test('should acknowledge alert persistently', async ({ page }) => {
    await seedAlertData(page, ABNORMAL_VISITS);
    await viewAlerts(page);

    const glucose = alertCard(page, 'Glucose');
    await acknowledgeButton(glucose, 'Glucose').click();

    // Marked as acknowledged: no longer offers to be acknowledged, no longer counted as new
    await expect(acknowledgeButton(glucose, 'Glucose')).toHaveCount(0);
    await expect(page.getByRole('main').getByText('2 new', { exact: true })).toBeVisible();

    // Survives a new page load, unlike dismiss
    await reloadAndViewAlerts(page);
    await expect(alertCard(page, 'Hemoglobin')).toBeVisible();
    await expect(alertCard(page, 'Glucose')).toBeHidden();
  });

  // Scenario: Dismissing a card hides every result of that test
  test('dismissing a card hides every result of its test', async ({ page }) => {
    await seedAlertData(page, [
      { date: '2024-01-15', values: [{ biomarker: GLUCOSE, value: 150 }] },
      { date: '2024-03-10', values: [{ biomarker: GLUCOSE, value: 130 }, { biomarker: HEMOGLOBIN, value: 10 }] },
    ]);
    await viewAlerts(page);
    await expect(page.getByRole('main').getByText('3 new', { exact: true })).toBeVisible();

    await dismissButton(alertCard(page, 'Glucose'), 'Glucose').click();

    await expect(alertCard(page, 'Glucose')).toHaveCount(0);
    await expect(page.getByRole('main').getByText('1 new', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('navigation').getByRole('button', { name: /^Alerts/ }).locator('.mantine-Badge-root')
    ).toHaveText('1');
  });

  // Scenario: Acknowledging a card acknowledges every result of that test
  test('acknowledging a card acknowledges every result of its test', async ({ page }) => {
    await seedAlertData(page, [
      { date: '2024-01-15', values: [{ biomarker: GLUCOSE, value: 150 }] },
      { date: '2024-03-10', values: [{ biomarker: GLUCOSE, value: 130 }, { biomarker: HEMOGLOBIN, value: 10 }] },
    ]);
    await viewAlerts(page);

    await acknowledgeButton(alertCard(page, 'Glucose'), 'Glucose').click();
    await expect(alertCard(page, 'Glucose')).toHaveCount(0);
    await expect(page.getByRole('main').getByText('1 new', { exact: true })).toBeVisible();

    await reloadAndViewAlerts(page);
    await expect(alertCard(page, 'Hemoglobin')).toBeVisible();
    await expect(alertCard(page, 'Glucose')).toHaveCount(0);
  });

  // Scenario: A later abnormal result makes an acknowledged test new again
  test('a later abnormal result makes an acknowledged test new again', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    // Glucose (legacy ID 22) acknowledged through the second visit
    await seedLabData(page, {
      ...buildLabData([
        { date: '2024-01-15', values: [{ biomarker: GLUCOSE, value: 150 }] },
        { date: '2024-03-10', values: [{ biomarker: GLUCOSE, value: 140 }] },
        { date: '2024-05-20', values: [{ biomarker: GLUCOSE, value: 130 }] },
      ]),
      userPreferences: { acknowledgedAlerts: { 22: '2024-03-10T10:00:00.000Z' } },
    });
    await viewAlerts(page);

    const card = alertCard(page, 'Glucose');
    await expect(card).toContainText('130 mg/dL');
    await expect(card.getByText('3 results · 1 new', { exact: true })).toBeVisible();

    await expandEarlierResults(card);
    const rows = earlierResults(card, 'Glucose');
    await expect(rows).toHaveCount(2);
    for (const row of await rows.all()) {
      await expect(row.getByText('New', { exact: true })).toHaveCount(0);
    }
  });

  // Scenario: No new alerts after acknowledging every alert
  test('does not call values normal once every alert is acknowledged', async ({ page }) => {
    await seedAlertData(page, [
      { date: '2024-01-15', values: [{ biomarker: GLUCOSE, value: 150 }, { biomarker: HEMOGLOBIN, value: 14 }] },
    ]);
    await viewAlerts(page);

    await acknowledgeButton(alertCard(page, 'Glucose'), 'Glucose').click();

    const main = page.getByRole('main');
    await expect(main.getByText('No new alerts')).toBeVisible();
    await expect(main.getByText('All values within normal range')).toBeHidden();
  });

  // Scenario: Filter alerts by category
  test('should filter alerts by category', async ({ page }) => {
    await seedAlertData(page, ABNORMAL_VISITS);
    await viewAlerts(page);
    await expect(alertCards(page)).toHaveCount(3);

    await page.getByRole('main').getByRole('textbox', { name: 'Filter alerts by category' }).click();
    await page.getByRole('option', { name: /^Metabolic/ }).click();

    await expect(alertCard(page, 'Glucose')).toBeVisible();
    await expect(alertCard(page, 'Hemoglobin')).toBeHidden();
    await expect(alertCard(page, 'HDL Cholesterol')).toBeHidden();
    await expect(alertCards(page)).toHaveCount(1);
  });

  // Scenario: Rapid improvement alert
  test('should show improvement alert for normalized values', async ({ page }) => {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    await seedAlertData(page, [
      { date: iso(lastMonth), values: [{ biomarker: GLUCOSE, value: 180 }] },
      { date: iso(today), values: [{ biomarker: GLUCOSE, value: 95 }] },
    ]);
    await viewAlerts(page);

    const improvement = alertCard(page, 'Glucose').filter({
      has: page.getByText('Improved', { exact: true }),
    });
    await expect(improvement).toBeVisible();
    await expect(improvement).toContainText('Improved: Glucose now within range');
  });

  // Scenario: Alert timestamp display — relative time
  test('should display relative time on alerts', async ({ page }) => {
    await seedAlertData(page, [
      { date: '2024-06-15', values: [{ biomarker: GLUCOSE, value: 150 }] },
    ]);
    await viewAlerts(page);

    await expect(
      alertCard(page, 'Glucose').getByText(/^\d+ (months?|years?) ago$/)
    ).toBeVisible();
  });

  // Scenario: Alert timestamp display — full date on hover
  test('should show full date on hover', async ({ page }) => {
    await seedAlertData(page, [
      { date: '2024-06-15', values: [{ biomarker: GLUCOSE, value: 150 }] },
    ]);
    await viewAlerts(page);

    // The full date as the browser formats it in its own locale
    const fullDate = await page.evaluate(() => new Date('2024-06-15T10:00:00.000Z').toLocaleDateString());

    await alertCard(page, 'Glucose').getByText(/ ago$/).hover();
    await expect(page.getByRole('tooltip', { name: fullDate })).toBeVisible();
  });

  // Scenario: Alert accessibility — roles and announced severity
  test('alert cards should have accessible roles', async ({ page }) => {
    await seedAlertData(page, ABNORMAL_VISITS);
    await viewAlerts(page);

    await expect(alertCards(page)).toHaveCount(3);
    await expect(alertCard(page, 'Glucose')).toHaveAccessibleName(/\bhigh\b/i);
    await expect(alertCard(page, 'Hemoglobin')).toHaveAccessibleName(/\blow\b/i);
    await expect(alertCard(page, 'HDL Cholesterol')).toHaveAccessibleName(/\blow\b/i);
  });

  // Scenario: Alert accessibility — keyboard navigation (dismiss)
  test('alert dismiss button should be focusable', async ({ page }) => {
    await seedAlertData(page, ABNORMAL_VISITS);
    await viewAlerts(page);

    const dismiss = dismissButton(alertCard(page, 'Glucose'), 'Glucose');
    await dismiss.focus();
    await expect(dismiss).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(alertCard(page, 'Glucose')).toBeHidden();
  });

  // Scenario: Alert accessibility — keyboard navigation (acknowledge)
  test('alert acknowledge button should be focusable', async ({ page }) => {
    await seedAlertData(page, ABNORMAL_VISITS);
    await viewAlerts(page);

    const acknowledge = acknowledgeButton(alertCard(page, 'Glucose'), 'Glucose');
    await acknowledge.focus();
    await expect(acknowledge).toBeFocused();

    // Reachable by tabbing from the card's neighbourhood, not only programmatically
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(acknowledge).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(acknowledge).toHaveCount(0);
  });

  // Scenario: Alert accessibility — earlier results by keyboard
  test('earlier results can be expanded and opened via keyboard', async ({ page }) => {
    await seedAlertData(page, [
      { date: '2024-01-15', values: [{ biomarker: GLUCOSE, value: 150 }] },
      { date: '2024-03-10', values: [{ biomarker: GLUCOSE, value: 130 }] },
    ]);
    await viewAlerts(page);

    const card = alertCard(page, 'Glucose');
    const toggle = earlierResultsToggle(card);
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // Enter on the toggle expands the card; it does not also open the trend
    await expect(
      page.getByRole('navigation').getByRole('button', { name: /^Alerts/ })
    ).toHaveAttribute('aria-current', 'page');

    const earlier = earlierResults(card, 'Glucose').first();
    await expect(earlier).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(earlier).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(
      page.getByRole('main').locator('[aria-label="Jan 15, 24: 150 mg/dL (high)"]')
    ).toHaveAttribute('aria-current', 'true');
  });

  // Scenario: Alert badge counts new results, not tests
  test('the navigation badge counts new results, not tests', async ({ page }) => {
    await seedAlertData(page, [
      { date: '2024-01-15', values: [{ biomarker: GLUCOSE, value: 150 }] },
      { date: '2024-03-10', values: [{ biomarker: GLUCOSE, value: 130 }, { biomarker: HEMOGLOBIN, value: 10 }] },
    ]);
    await goToTrends(page);

    const badge = page
      .getByRole('navigation')
      .getByRole('button', { name: /^Alerts/ })
      .locator('.mantine-Badge-root');
    await expect(badge).toHaveText('3');
  });

  // Scenario: Alert badge in navigation
  test('should show alert count badge in header', async ({ page }) => {
    await seedAlertData(page, ABNORMAL_VISITS);
    await goToTrends(page);

    const alertsNav = page.getByRole('navigation').getByRole('button', { name: /^Alerts/ });
    await expect(alertsNav).toBeVisible();
    const badge = alertsNav.locator('.mantine-Badge-root');
    await expect(badge).toHaveText('3');
    await expect(badge).toHaveAttribute('data-variant', 'filled');
  });
});
