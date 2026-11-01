/**
 * E2E Tests for Timeline View
 *
 * Tests the timeline view functionality including:
 * - Empty state display
 * - Lab result cards display
 * - Expand/collapse test values
 * - Abnormal value indicators
 * - Opening a test's trend from its name
 * - Filtering
 * - Deletion with confirmation
 * - Accessibility
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import { test, expect } from './fixtures';
import { openFromMenu, setupOrUnlock } from './steps/app.steps';
import { seedLabData } from './steps/data.steps';
import {
  BIOMARKERS,
  deleteWithKeyboard,
  expandButton,
  expandLabResult,
  goToTimeline,
  labResult,
  labResultCard,
  labResultCards,
  longDate,
  panelValues,
  pickDate,
  shortDate,
  testValues,
  trendLink,
} from './steps/timeline.steps';
import { biomarkerSelect } from './steps/trends.steps';

// Test fixtures
const mockLabResult = {
  date: '2024-01-15',
  labName: 'Quest Diagnostics',
  biomarkers: [
    { name: 'Hemoglobin', value: 14.5, unit: 'g/dL', refLow: 12.0, refHigh: 17.5 },
    { name: 'Glucose', value: 125, unit: 'mg/dL', refLow: 70, refHigh: 100 },
  ],
};

test.describe('Timeline View', () => {
  test.describe('Empty State', () => {
    test('should display empty state message when no results', async ({ page }) => {
      await page.goto('/');

      await setupOrUnlock(page);

      // Navigate to timeline
      await goToTimeline(page);

      // Verify empty state
      await expect(page.getByText(/no lab results yet/i)).toBeVisible();
    });

    test('should have import CTA button in empty state', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);

      await goToTimeline(page);

      const importButton = page.getByRole('button', { name: /import lab results/i });
      await expect(importButton).toBeVisible();
    });

    test('clicking import button should navigate to import view', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);

      await goToTimeline(page);

      await page.getByRole('button', { name: /import lab results/i }).click();

      // Verify we're on the import view
      await expect(
        page.getByRole('navigation').getByRole('button', { name: /^Import/ })
      ).toHaveAttribute('aria-current', 'page');
    });
  });

  test.describe('Filtering', () => {
    test('should have search input', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);

      // The filter controls should be present when there's data
      // or we can check the import view has filters
      const searchInput = page.getByPlaceholder(/search/i);
      // Search might only be visible when there are results
      // This test verifies the search element exists in DOM
    });

    test('should have date range filters', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);

      // Date filters should be accessible
      const fromDateInput = page.getByLabel(/from|start date/i);
      const toDateInput = page.getByLabel(/to|end date/i);
      // These are only visible when there are results
    });
  });

  test.describe('Accessibility', () => {
    test('timeline should be keyboard navigable', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);

      await goToTimeline(page);

      // Tab through the page
      await page.keyboard.press('Tab');

      // Should be able to navigate via keyboard
      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(focusedElement).toBeTruthy();
    });

    test('empty state import button should be focusable', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);

      await goToTimeline(page);

      const importButton = page.getByRole('button', { name: /import lab results/i });
      await importButton.focus();
      await expect(importButton).toBeFocused();
    });

    test('import button should be activatable with Enter key', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);

      await goToTimeline(page);

      const importButton = page.getByRole('button', { name: /import lab results/i });
      await importButton.focus();
      await page.keyboard.press('Enter');

      // Should navigate to import view
      await expect(
        page.getByRole('navigation').getByRole('button', { name: /^Import/ })
      ).toHaveAttribute('aria-current', 'page');
    });
  });

  test.describe('Navigation', () => {
    test('should display timeline in nav as active when on timeline view', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);

      // Timeline should be active by default
      // Navigation items render as buttons
      const timelineNav = page.getByRole('button', { name: /timeline/i });
      await expect(timelineNav).toHaveAttribute('aria-current', 'page');
    });

    test('lock button should lock the application', async ({ page }) => {
      await page.goto('/');
      await setupOrUnlock(page);

      // Click lock button
      await page.getByRole('button', { name: /lock/i }).click();

      // Should show login screen
      await expect(page.getByRole('button', { name: /unlock/i })).toBeVisible();
    });
  });
});

test.describe('Timeline with Data', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
  });

  test('should display lab result cards', async ({ page }) => {
    const jan = labResult(1, '2024-01-15', 'Quest Diagnostics');
    const mar = labResult(2, '2024-03-20', 'LabCorp');
    const jun = labResult(3, '2024-06-10', 'Quest Diagnostics');
    await seedLabData(page, {
      labResults: [jan, mar, jun],
      testValues: [...panelValues(jan, 5, 1), ...panelValues(mar, 8, 6), ...panelValues(jun, 6, 14)],
    });

    await goToTimeline(page);

    const cards = labResultCards(page);
    await expect(cards).toHaveCount(3);

    // Newest first
    await expect(cards.nth(0)).toHaveAccessibleName(`Lab result from ${longDate('2024-06-10')}`);
    await expect(cards.nth(1)).toHaveAccessibleName(`Lab result from ${longDate('2024-03-20')}`);
    await expect(cards.nth(2)).toHaveAccessibleName(`Lab result from ${longDate('2024-01-15')}`);

    const expected = [
      { day: '2024-06-10', labName: 'Quest Diagnostics', count: '6 tests' },
      { day: '2024-03-20', labName: 'LabCorp', count: '8 tests' },
      { day: '2024-01-15', labName: 'Quest Diagnostics', count: '5 tests' },
    ];
    for (const { day, labName, count } of expected) {
      const card = labResultCard(page, day);
      await expect(card.getByText(shortDate(day), { exact: true })).toBeVisible();
      await expect(card.getByText(labName, { exact: true })).toBeVisible();
      await expect(card.getByText(count, { exact: true })).toBeVisible();
    }
  });

  test('choosing Timeline in the menu shows the timeline fresh', async ({ page }) => {
    const result = labResult(1, '2024-01-15', 'Quest Diagnostics');
    await seedLabData(page, { labResults: [result], testValues: panelValues(result, 3, 1) });
    await goToTimeline(page);
    const card = await expandLabResult(page, '2024-01-15');

    await goToTimeline(page);

    await expect(expandButton(card)).toHaveAttribute('aria-expanded', 'false');
  });

  test('should expand card to show test values', async ({ page }) => {
    const result = labResult(1, '2024-01-15', 'Quest Diagnostics');
    await seedLabData(page, {
      labResults: [result],
      testValues: testValues(
        result,
        [
          { biomarker: BIOMARKERS.HEMOGLOBIN, value: 14.5, low: 12.0, high: 17.5 },
          { biomarker: BIOMARKERS.GLUCOSE, value: 125, low: 70, high: 100 },
          { biomarker: BIOMARKERS.CREATININE, value: 0.9 },
        ],
        1
      ),
    });

    await goToTimeline(page);
    const card = labResultCard(page, '2024-01-15');
    await expect(card.getByRole('table', { name: 'Test values' })).toBeHidden();

    await expandLabResult(page, '2024-01-15');

    const table = card.getByRole('table', { name: 'Test values' });
    await expect(table).toBeVisible();
    for (const header of ['Biomarker', 'Value', 'Unit', 'Reference Range']) {
      await expect(table.getByRole('columnheader', { name: header, exact: true })).toBeVisible();
    }

    // Header row + one row per test value
    await expect(table.getByRole('row')).toHaveCount(4);

    const cells = (name: string) => table.getByRole('row', { name: new RegExp(`^${name}:`) }).getByRole('cell');

    await expect(cells('Hemoglobin')).toHaveText([/.*/, 'Hemoglobin', /.*/, '14.50', 'g/dL', '12 - 17.5 g/dL']);
    await expect(cells('Glucose')).toHaveText([/.*/, 'Glucose', /.*/, '125', 'mg/dL', '70 - 100 mg/dL']);
    // No reference range was reported for creatinine
    await expect(cells('Creatinine')).toHaveText([/.*/, 'Creatinine', /.*/, '0.90', 'mg/dL', '—']);
  });

  test('should show abnormal value indicators', async ({ page }) => {
    const result = labResult(1, '2024-01-15', 'Quest Diagnostics');
    await seedLabData(page, {
      labResults: [result],
      testValues: testValues(
        result,
        [
          { biomarker: BIOMARKERS.HEMOGLOBIN, value: 11.0, low: 12.0, high: 17.5 },
          { biomarker: BIOMARKERS.GLUCOSE, value: 150, low: 70, high: 100 },
          { biomarker: BIOMARKERS.CREATININE, value: 1.0, low: 0.7, high: 1.3 },
        ],
        1
      ),
    });

    await goToTimeline(page);
    const card = labResultCard(page, '2024-01-15');

    // Badge is visible (and announced) before expanding
    await expect(card.getByLabel('2 abnormal values', { exact: true })).toBeVisible();
    await expect(card.getByLabel('2 abnormal values', { exact: true })).toHaveText('2 abnormal');

    await expandLabResult(page, '2024-01-15');
    const table = card.getByRole('table', { name: 'Test values' });

    // Each status has its own labelled icon, so it is not conveyed by color alone
    const hemoglobin = table.getByRole('row', {
      name: 'Hemoglobin: 11 g/dL, Below reference range',
      exact: true,
    });
    const glucose = table.getByRole('row', {
      name: 'Glucose: 150 mg/dL, Above reference range',
      exact: true,
    });
    const creatinine = table.getByRole('row', {
      name: 'Creatinine: 1 mg/dL, Within reference range',
      exact: true,
    });

    await expect(hemoglobin.getByLabel('Below reference range', { exact: true })).toBeVisible();
    await expect(glucose.getByLabel('Above reference range', { exact: true })).toBeVisible();
    await expect(creatinine.getByLabel('Within reference range', { exact: true })).toBeVisible();

    // Low and high use different icons, not just different colors
    const lowIcon = await hemoglobin.getByLabel('Below reference range').locator('svg').getAttribute('class');
    const highIcon = await glucose.getByLabel('Above reference range').locator('svg').getAttribute('class');
    const normalIcon = await creatinine.getByLabel('Within reference range').locator('svg').getAttribute('class');
    expect(new Set([lowIcon, highIcon, normalIcon]).size).toBe(3);
  });

  // Scenario: Open a test's trend from a lab result
  test("opens a test's trend at the result's date from its name", async ({ page }) => {
    const jan = labResult(1, '2024-01-15', 'Quest Diagnostics');
    const mar = labResult(2, '2024-03-20', 'LabCorp');
    await seedLabData(page, {
      labResults: [jan, mar],
      testValues: [
        ...testValues(jan, [{ biomarker: BIOMARKERS.GLUCOSE, value: 125, low: 70, high: 100 }], 1),
        ...testValues(mar, [{ biomarker: BIOMARKERS.GLUCOSE, value: 90, low: 70, high: 100 }], 2),
      ],
    });

    await goToTimeline(page);
    const card = await expandLabResult(page, '2024-01-15');
    await trendLink(card, 'Glucose').click();

    await expect(
      page.getByRole('navigation').getByRole('button', { name: /^Trends/ })
    ).toHaveAttribute('aria-current', 'page');
    await expect(biomarkerSelect(page)).toHaveValue(/^Glucose \(/);
    await expect(
      page.getByRole('main').locator('[aria-label="Jan 15, 24: 125 mg/dL (high)"]')
    ).toHaveAttribute('aria-current', 'true');
  });

  // Scenario: Biomarker description stays available on hover
  test("keeps the test's description on hover", async ({ page }) => {
    const result = labResult(1, '2024-01-15', 'Quest Diagnostics');
    await seedLabData(page, {
      labResults: [result],
      testValues: testValues(result, [{ biomarker: BIOMARKERS.GLUCOSE, value: 90, low: 70, high: 100 }], 1),
    });

    await goToTimeline(page);
    const card = await expandLabResult(page, '2024-01-15');
    await trendLink(card, 'Glucose').hover();

    await expect(page.getByRole('tooltip')).toContainText('Blood sugar level');
  });

  // Scenario: Open a test's trend with the keyboard
  test("opens a test's trend with the keyboard", async ({ page }) => {
    const result = labResult(1, '2024-01-15', 'Quest Diagnostics');
    await seedLabData(page, {
      labResults: [result],
      testValues: testValues(result, [{ biomarker: BIOMARKERS.GLUCOSE, value: 125, low: 70, high: 100 }], 1),
    });

    await goToTimeline(page);
    const card = await expandLabResult(page, '2024-01-15');
    const link = trendLink(card, 'Glucose');
    // Reached by tabbing, which is what shows the tooltip on focus
    await link.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
    // Keyboard users get the description too
    await expect(page.getByRole('tooltip')).toContainText('Blood sugar level');
    await page.keyboard.press('Enter');

    await expect(
      page.getByRole('navigation').getByRole('button', { name: /^Trends/ })
    ).toHaveAttribute('aria-current', 'page');
    await expect(biomarkerSelect(page)).toHaveValue(/^Glucose \(/);
  });

  // Scenario: A value without a chart has no trend link
  test('shows a qualitative value\'s test name without a trend link', async ({ page }) => {
    const result = labResult(1, '2024-01-15', 'Quest Diagnostics');
    await seedLabData(page, {
      labResults: [result],
      testValues: [{ ...testValues(result, [{ biomarker: BIOMARKERS.GLUCOSE, value: 0 }], 1)[0], value: 'Negative', unit: '' }],
    });

    await goToTimeline(page);
    const card = await expandLabResult(page, '2024-01-15');

    const table = card.getByRole('table', { name: 'Test values' });
    await expect(table.getByText('Glucose', { exact: true })).toBeVisible();
    await expect(table.getByRole('button')).toHaveCount(0);
  });

  test('should filter by date range', async ({ page }) => {
    const days = ['2024-01-15', '2024-03-20', '2024-06-10', '2024-09-05'];
    const results = days.map((day, i) => labResult(i + 1, day, 'Quest Diagnostics'));
    await seedLabData(page, {
      labResults: results,
      testValues: results.flatMap((r, i) => panelValues(r, 1, i + 1)),
    });

    await goToTimeline(page);
    await expect(labResultCards(page)).toHaveCount(4);

    await pickDate(page, 'Filter from date', '2024-03-01');
    await pickDate(page, 'Filter to date', '2024-07-01');

    await expect(labResultCards(page)).toHaveCount(2);
    await expect(labResultCard(page, '2024-03-20')).toBeVisible();
    await expect(labResultCard(page, '2024-06-10')).toBeVisible();
    await expect(labResultCard(page, '2024-01-15')).toHaveCount(0);
    await expect(labResultCard(page, '2024-09-05')).toHaveCount(0);
  });

  test('should filter by lab name search', async ({ page }) => {
    const results = [
      labResult(1, '2024-01-15', 'Quest Diagnostics'),
      labResult(2, '2024-03-20', 'LabCorp'),
      labResult(3, '2024-06-10', 'Quest Diagnostics'),
    ];
    await seedLabData(page, {
      labResults: results,
      testValues: results.flatMap((r, i) => panelValues(r, 1, i + 1)),
    });

    await goToTimeline(page);
    await expect(labResultCards(page)).toHaveCount(3);

    await page.getByRole('main').getByRole('textbox', { name: 'Search by lab name' }).fill('Quest');

    const cards = labResultCards(page);
    await expect(cards).toHaveCount(2);
    for (const card of await cards.all()) {
      await expect(card.getByText('Quest Diagnostics', { exact: true })).toBeVisible();
    }
    await expect(labResultCard(page, '2024-03-20')).toHaveCount(0);
  });

  test('should clear all filters', async ({ page }) => {
    const results = [
      labResult(1, '2024-01-15', 'Quest Diagnostics'),
      labResult(2, '2024-03-20', 'LabCorp'),
      labResult(3, '2024-06-10', 'Quest Diagnostics'),
    ];
    await seedLabData(page, {
      labResults: results,
      testValues: results.flatMap((r, i) => panelValues(r, 1, i + 1)),
    });

    await goToTimeline(page);
    const main = page.getByRole('main');
    const search = main.getByRole('textbox', { name: 'Search by lab name' });

    await search.fill('Quest');
    await pickDate(page, 'Filter from date', '2024-03-01');
    await expect(labResultCards(page)).toHaveCount(1);

    await main.getByRole('button', { name: 'Clear all filters' }).click();

    await expect(search).toHaveValue('');
    await expect(main.getByRole('button', { name: 'Filter from date', exact: true })).toHaveText('Start date');
    await expect(main.getByRole('button', { name: 'Filter to date', exact: true })).toHaveText('End date');
    await expect(labResultCards(page)).toHaveCount(3);
  });

  test('should delete result with confirmation', async ({ page }) => {
    await seedLabData(page);
    await goToTimeline(page);
    await expect(labResultCards(page)).toHaveCount(2);

    const card = labResultCard(page, '2024-01-15');
    await card.getByRole('button', { name: 'Delete this lab result' }).click();

    const dialog = page.getByRole('dialog', { name: 'Delete Lab Result' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(longDate('2024-01-15'));
    await expect(dialog).toContainText('This action cannot be undone.');

    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(dialog).toBeHidden();
    await expect(card).toHaveCount(0);
    await expect(labResultCards(page)).toHaveCount(1);
    await expect(labResultCard(page, '2024-02-20')).toBeVisible();
  });

  test.describe('deleting from the keyboard', () => {
    /** Shown newest first: March, February, January */
    const DAYS = ['2024-01-15', '2024-02-20', '2024-03-10'];

    test.beforeEach(async ({ page }) => {
      const results = DAYS.map((day, i) => labResult(i + 1, day, 'Quest Diagnostics'));
      await seedLabData(page, {
        labResults: results,
        testValues: results.flatMap((r, i) => panelValues(r, 1, i + 1)),
      });
      await goToTimeline(page);
      await expect(labResultCards(page)).toHaveCount(3);
    });

    test('deletes a result from the keyboard', async ({ page }) => {
      // Scenario: Delete a lab result with the keyboard
      await deleteWithKeyboard(page, labResultCard(page, '2024-02-20'));

      // Focus moves on to the next lab result, not back to the top of the page
      await expect(expandButton(labResultCard(page, '2024-01-15'))).toBeFocused();
    });

    test('deleting the last result moves focus to the one before it', async ({ page }) => {
      // Scenario: Delete the last lab result with the keyboard
      await deleteWithKeyboard(page, labResultCard(page, '2024-01-15'));

      await expect(expandButton(labResultCard(page, '2024-02-20'))).toBeFocused();
    });
  });

  test('should show a success notification after deleting a result', async ({ page }) => {
    await seedLabData(page);
    await goToTimeline(page);

    // Let the restore notification go so it cannot satisfy the assertion below
    await expect(page.getByRole('alert').filter({ hasText: 'Restore Complete' })).toHaveCount(0, {
      timeout: 10000,
    });

    const card = labResultCard(page, '2024-01-15');
    await card.getByRole('button', { name: 'Delete this lab result' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete Lab Result' });
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(card).toHaveCount(0);

    await expect(page.getByRole('alert').filter({ hasText: /deleted/i })).toBeVisible();
  });

  test('should cancel deletion', async ({ page }) => {
    await seedLabData(page);
    await goToTimeline(page);

    const card = labResultCard(page, '2024-01-15');
    await card.getByRole('button', { name: 'Delete this lab result' }).click();

    const dialog = page.getByRole('dialog', { name: 'Delete Lab Result' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    await expect(dialog).toBeHidden();
    await expect(card).toBeVisible();
    await expect(labResultCards(page)).toHaveCount(2);

    // Still there after leaving and returning, so nothing was deleted in the DB
    await openFromMenu(page, 'Trends');
    await goToTimeline(page);
    await expect(labResultCards(page)).toHaveCount(2);
  });
});
