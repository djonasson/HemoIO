/**
 * E2E Tests for Trend Charts
 *
 * Implements features/trend-charts.feature: navigation, empty states, the
 * single-biomarker chart (reference range, out-of-range markers, date
 * filtering, trend direction, statistics, tooltip, responsiveness), and
 * multi-marker comparison.
 */

import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { setupOrUnlock } from './steps/app.steps';
import {
  backButton,
  expectDetailPage,
  goToDictionary,
  searchField,
  viewDetail,
} from './steps/dictionary.steps';
import {
  GLUCOSE,
  HDL,
  HEMOGLOBIN,
  LDL,
  RDW,
  VITAMIN_D,
  biomarkerSelect,
  dataPoints,
  goToTrends,
  pickDate,
  referenceLink,
  seedVisits,
  selectBiomarker,
  type LabVisit,
} from './steps/trends.steps';

/**
 * "I have multiple lab results imported over time"
 *
 * Hemoglobin rises steadily (normal); glucose is normal, high, low, normal;
 * vitamin D was measured only once.
 */
const VISITS: LabVisit[] = [
  {
    date: '2023-11-10',
    labName: 'Quest Diagnostics',
    values: [
      { biomarker: HEMOGLOBIN, value: 12.8 },
      { biomarker: GLUCOSE, value: 92 },
      { biomarker: LDL, value: 130 },
      { biomarker: HDL, value: 45 },
    ],
  },
  {
    date: '2024-02-15',
    labName: 'LabCorp',
    values: [
      { biomarker: HEMOGLOBIN, value: 13.4 },
      { biomarker: GLUCOSE, value: 140 },
      { biomarker: LDL, value: 120 },
      { biomarker: HDL, value: 48 },
    ],
  },
  {
    date: '2024-05-20',
    labName: 'Quest Diagnostics',
    values: [
      { biomarker: HEMOGLOBIN, value: 14.1 },
      { biomarker: GLUCOSE, value: 60 },
      { biomarker: LDL, value: 110 },
      { biomarker: HDL, value: 52 },
      { biomarker: VITAMIN_D, value: 42 },
    ],
  },
  {
    date: '2024-09-05',
    labName: 'LabCorp',
    values: [
      { biomarker: HEMOGLOBIN, value: 14.9 },
      { biomarker: GLUCOSE, value: 95 },
      { biomarker: LDL, value: 95 },
      { biomarker: HDL, value: 55 },
    ],
  },
];

/** X-axis tick labels for VISITS, as the chart formats them */
const ALL_TICKS = ['Nov 10, 23', 'Feb 15, 24', 'May 20, 24', 'Sep 5, 24'];

const RED = '#fa5252';
const ORANGE = '#fd7e14';
const STANDARD_GREEN = '#40c057';

async function seedAndOpenTrends(page: Page, visits: LabVisit[] = VISITS): Promise<void> {
  await page.goto('/');
  await setupOrUnlock(page);
  await seedVisits(page, visits);
  await goToTrends(page);
}

function xAxisTicks(page: Page) {
  return page.getByRole('main').locator('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value');
}

test.describe('Trend Charts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
  });

  test.describe('Navigation', () => {
    test('should be able to navigate to Trends view', async ({ page }) => {
      await page.getByRole('navigation').getByRole('button', { name: /^Trends/ }).click();

      await expect(page.getByRole('main').getByText(/no lab results yet/i)).toBeVisible();
    });

    test('trends nav should show active state', async ({ page }) => {
      const trendsNav = page.getByRole('navigation').getByRole('button', { name: /^Trends/ });
      await trendsNav.click();

      await expect(trendsNav).toHaveAttribute('aria-current', 'page');
    });
  });

  test.describe('Empty State', () => {
    test('should display empty state when no lab results', async ({ page }) => {
      await page.getByRole('navigation').getByRole('button', { name: /^Trends/ }).click();

      await expect(page.getByRole('main').getByText(/no lab results yet/i)).toBeVisible();
    });

    test('should have import CTA button in empty state', async ({ page }) => {
      await page.getByRole('navigation').getByRole('button', { name: /^Trends/ }).click();

      await expect(
        page.getByRole('main').getByRole('button', { name: /import lab results/i })
      ).toBeVisible();
    });

    test('clicking import button should navigate to import view', async ({ page }) => {
      await page.getByRole('navigation').getByRole('button', { name: /^Trends/ }).click();

      await page.getByRole('main').getByRole('button', { name: /import lab results/i }).click();

      await expect(
        page.getByRole('navigation').getByRole('button', { name: /^Import/ })
      ).toHaveAttribute('aria-current', 'page');
    });
  });

  test.describe('Accessibility', () => {
    test('trends view should be keyboard navigable', async ({ page }) => {
      await page.getByRole('navigation').getByRole('button', { name: /^Trends/ }).click();
      const importButton = page.getByRole('main').getByRole('button', { name: /import lab results/i });
      await expect(importButton).toBeVisible();

      // Tab moves focus forward through the page until it reaches the CTA
      await expect(async () => {
        await page.keyboard.press('Tab');
        await expect(importButton).toBeFocused({ timeout: 100 });
      }).toPass();
    });

    test('import button in empty state should be focusable', async ({ page }) => {
      await page.getByRole('navigation').getByRole('button', { name: /^Trends/ }).click();

      const importButton = page.getByRole('main').getByRole('button', { name: /import lab results/i });
      await importButton.focus();
      await expect(importButton).toBeFocused();
    });

    test('import button should be activatable with Enter key', async ({ page }) => {
      await page.getByRole('navigation').getByRole('button', { name: /^Trends/ }).click();

      const importButton = page.getByRole('main').getByRole('button', { name: /import lab results/i });
      await importButton.focus();
      await page.keyboard.press('Enter');

      await expect(
        page.getByRole('navigation').getByRole('button', { name: /^Import/ })
      ).toHaveAttribute('aria-current', 'page');
    });
  });
});

test.describe('Trend Charts with Data', () => {
  test.beforeEach(async ({ page }) => {
    await seedAndOpenTrends(page);
  });

  // Scenario: Empty state when no biomarker selected
  test('should display biomarker selection when data available', async ({ page }) => {
    const main = page.getByRole('main');

    await expect(main.getByText('Select a biomarker to view its trend')).toBeVisible();
    await expect(main.getByText('Choose from 5 available biomarkers')).toBeVisible();
    await expect(biomarkerSelect(page)).toBeVisible();
    await expect(biomarkerSelect(page)).toHaveValue('');

    await biomarkerSelect(page).click();
    // Options are grouped by category, so only membership is asserted
    await expect(page.getByRole('option')).toHaveCount(5);
    for (const label of [
      'Hemoglobin (4 values)',
      'Glucose (4 values)',
      'LDL Cholesterol (4 values)',
      'HDL Cholesterol (4 values)',
      'Vitamin D (1 value)',
    ]) {
      await expect(page.getByRole('option', { name: label, exact: true })).toBeVisible();
    }
  });

  // Scenario: View single biomarker trend chart
  test('should show trend chart when biomarker selected', async ({ page }) => {
    await selectBiomarker(page, 'Hemoglobin');
    const main = page.getByRole('main');

    await expect(main.getByText('Hemoglobin (g/dL)', { exact: true })).toBeVisible();
    await expect(main.locator('.recharts-line-curve')).toBeVisible();
    await expect(dataPoints(page)).toHaveCount(4);

    // X-axis: dates in chronological order
    await expect(xAxisTicks(page)).toHaveText(ALL_TICKS);

    // Y-axis: labelled with the unit
    await expect(main.locator('text.recharts-label').filter({ hasText: /^g\/dL$/ })).toBeVisible();
  });

  // Scenario: Reference range displayed on chart
  test('should display reference range on chart', async ({ page }) => {
    await selectBiomarker(page, 'Glucose');
    const main = page.getByRole('main');

    const band = main.locator('.recharts-reference-area-rect');
    await expect(band).toBeVisible();
    await expect(main.locator('text.recharts-label', { hasText: 'Low: 70' })).toBeVisible();
    await expect(main.locator('text.recharts-label', { hasText: 'High: 100' })).toBeVisible();

    // The band spans exactly from the low reference value to the high one
    await expect(band).toHaveAttribute('y1', '70');
    await expect(band).toHaveAttribute('y2', '100');
    const lowLine = main.locator('line.recharts-reference-line-line[y="70"]');
    const highLine = main.locator('line.recharts-reference-line-line[y="100"]');
    const bandTop = Number(await band.getAttribute('y'));
    const bandBottom = bandTop + Number(await band.getAttribute('height'));
    expect(bandTop).toBeCloseTo(Number(await highLine.getAttribute('y1')), 1);
    expect(bandBottom).toBeCloseTo(Number(await lowLine.getAttribute('y1')), 1);

    // Visually distinct from the data line
    const bandFill = await band.getAttribute('fill');
    const lineStroke = await main.locator('.recharts-line-curve').getAttribute('stroke');
    expect(bandFill).toBeTruthy();
    expect(bandFill).not.toBe(lineStroke);
  });

  // Scenario: Identify values outside reference range
  test('should highlight values outside reference range', async ({ page }) => {
    await selectBiomarker(page, 'Glucose');

    const highPoint = dataPoints(page).and(page.locator('[aria-label$="(high)"]'));
    const lowPoint = dataPoints(page).and(page.locator('[aria-label$="(low)"]'));
    const normalPoints = dataPoints(page).and(page.locator('[aria-label$="(normal)"]'));

    await expect(highPoint).toHaveCount(1);
    await expect(highPoint).toHaveAttribute('aria-label', 'Feb 15, 24: 140 mg/dL (high)');
    await expect(highPoint).toHaveAttribute('fill', RED);

    await expect(lowPoint).toHaveCount(1);
    await expect(lowPoint).toHaveAttribute('aria-label', 'May 20, 24: 60 mg/dL (low)');
    await expect(lowPoint).toHaveAttribute('fill', ORANGE);

    await expect(normalPoints).toHaveCount(2);
    for (const point of await normalPoints.all()) {
      await expect(point).toHaveAttribute('fill', STANDARD_GREEN);
    }
  });

  // Scenario: Filter trend chart by date range
  test('should filter chart by date range', async ({ page }) => {
    await selectBiomarker(page, 'Hemoglobin');
    await expect(dataPoints(page)).toHaveCount(4);

    await pickDate(page, 'Filter from date', '2024-01-01');
    await pickDate(page, 'Filter to date', '2024-06-30');

    await expect(dataPoints(page)).toHaveCount(2);
    await expect(page.getByRole('main').locator('[aria-label="Feb 15, 24: 13.4 g/dL (normal)"]')).toBeVisible();
    await expect(page.getByRole('main').locator('[aria-label="May 20, 24: 14.1 g/dL (normal)"]')).toBeVisible();
    await expect(xAxisTicks(page)).toHaveText(['Feb 15, 24', 'May 20, 24']);
  });

  // Scenario: Trend statistics follow dark mode
  test('shows the reference range box dark in dark mode', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('mantine-color-scheme-value', 'dark'));
    await page.reload();
    await setupOrUnlock(page);
    await goToTrends(page);
    await selectBiomarker(page, 'Glucose');

    const box = page
      .getByRole('main')
      .locator('div.mantine-Paper-root', { has: page.getByText('Reference Range:', { exact: true }) })
      .last();
    await expect(box).toBeVisible();
    // The box's color blended over the page's, averaged: a light box would be near 255
    const brightness = await box.evaluate((el) => {
      const channels = (color: string) => color.match(/[\d.]+/g)!.map(Number);
      const [r, g, b, alpha = 1] = channels(getComputedStyle(el).backgroundColor);
      const page = channels(getComputedStyle(document.body).backgroundColor);
      return [r, g, b].reduce((sum, c, i) => sum + c * alpha + page[i] * (1 - alpha), 0) / 3;
    });
    expect(brightness).toBeLessThan(100);
  });

  // Scenarios: View trend statistics summary, View rate of change statistic
  test('should display statistics summary', async ({ page }) => {
    await selectBiomarker(page, 'Glucose');
    const main = page.getByRole('main');

    const summary = main.locator('div.mantine-Paper-root', {
      has: page.getByText('Statistics Summary', { exact: true }),
    });
    await expect(summary).toBeVisible();

    const stat = (label: string) =>
      summary.locator('div.mantine-Paper-root', { has: page.getByText(label, { exact: true }) }).first();

    await expect(stat('Minimum')).toContainText('60');
    await expect(stat('Maximum')).toContainText('140');
    await expect(stat('Average')).toContainText('96.8');
    await expect(stat('Latest Value')).toContainText('95');
    await expect(stat('Total Readings')).toContainText('4');

    // Trend direction is shown alongside the statistics
    await expect(main.getByText(/^(Increasing|Decreasing|Stable)$/)).toBeVisible();

    // Rate of change: average change per time period
    const rate = summary.locator('div.mantine-Paper-root', { has: page.getByText('Rate of Change') });
    await expect(rate).toBeVisible();
    await expect(rate.getByText('Per Month')).toBeVisible();
    await expect(rate.getByText(/^[+-][\d.]+ mg\/dL$/).first()).toBeVisible();
  });

  // Scenario: Handle different units on multi-marker chart
  test('should open compare modal when compare button clicked', async ({ page }) => {
    await selectBiomarker(page, 'Hemoglobin');
    await page.getByRole('main').getByRole('button', { name: 'Compare Markers' }).click();

    const dialog = page.getByRole('dialog', { name: 'Compare Biomarkers' });
    await expect(dialog).toBeVisible();

    // Hemoglobin is pre-selected; add glucose (different unit)
    await dialog.getByRole('textbox', { name: 'Select biomarkers to compare' }).click();
    await page.getByRole('option', { name: /^Glucose \(/ }).click();

    await expect(dialog.locator('.recharts-yAxis')).toHaveCount(2);
    await expect(dialog.locator('.recharts-yAxis.yAxis').first()).toBeVisible();
    await expect(dialog.getByText('Left: g/dL')).toBeVisible();
    await expect(dialog.getByText('Right: mg/dL')).toBeVisible();
    await expect(dialog.locator('.recharts-line')).toHaveCount(2);
  });

  // Scenario: Compare multiple biomarkers
  test('should compare multiple biomarkers', async ({ page }) => {
    await selectBiomarker(page, 'LDL Cholesterol');
    await page.getByRole('main').getByRole('button', { name: 'Compare Markers' }).click();

    const dialog = page.getByRole('dialog', { name: 'Compare Biomarkers' });
    await expect(dialog).toBeVisible();
    // The biomarker being viewed is pre-selected as the first marker
    await expect(dialog.locator('.mantine-Pill-label', { hasText: 'LDL Cholesterol' })).toBeVisible();

    const markerInput = dialog.getByRole('textbox', { name: 'Select biomarkers to compare' });
    await markerInput.click();
    await page.getByRole('option', { name: /^HDL Cholesterol \(/ }).click();

    const lines = dialog.locator('.recharts-line-curve');
    await expect(lines).toHaveCount(2);
    const strokes = await Promise.all((await lines.all()).map((l) => l.getAttribute('stroke')));
    expect(new Set(strokes).size).toBe(2);

    const legend = dialog.locator('.recharts-legend-wrapper');
    await expect(legend.getByText(/LDL Cholesterol/)).toBeVisible();
    await expect(legend.getByText(/HDL Cholesterol/)).toBeVisible();
  });

  // Scenario: View chart with single data point
  test('should show single data point message', async ({ page }) => {
    await selectBiomarker(page, 'Vitamin D');
    const main = page.getByRole('main');

    await expect(main.getByText('More data needed for trend analysis')).toBeVisible();
    await expect(main.getByText('42', { exact: true })).toBeVisible();
    await expect(main.getByText('ng/mL', { exact: true })).toBeVisible();
    await expect(main.getByText('May 20, 24', { exact: true })).toBeVisible();
  });

  // Scenario: Hover to see data point details
  test('should show tooltip on hover', async ({ page }) => {
    await selectBiomarker(page, 'Hemoglobin');

    await page.getByRole('main').locator('[aria-label="Feb 15, 24: 13.4 g/dL (normal)"]').hover();

    const tooltip = page.getByRole('main').locator('.recharts-tooltip-wrapper');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Feb 15, 24'); // Date
    await expect(tooltip).toContainText('Value:13.4 g/dL'); // Value
    await expect(tooltip).toContainText('Reference:12 - 17.5'); // Reference range
    await expect(tooltip).toContainText('LabCorp'); // Lab name
  });

  // Scenario: Responsive chart sizing
  test('chart should be responsive', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await selectBiomarker(page, 'Hemoglobin');

    const surface = page.getByRole('main').locator('svg.recharts-surface');
    const title = page.getByRole('main').getByText('Hemoglobin (g/dL)', { exact: true });
    await expect(dataPoints(page)).toHaveCount(4);
    const wideWidth = (await surface.boundingBox())!.width;

    await page.setViewportSize({ width: 700, height: 900 });

    await expect.poll(async () => (await surface.boundingBox())?.width).toBeLessThan(wideWidth);
    const narrowBox = (await surface.boundingBox())!;
    expect(narrowBox.x + narrowBox.width).toBeLessThanOrEqual(700);

    await expect(dataPoints(page)).toHaveCount(4);
    for (const point of await dataPoints(page).all()) {
      await expect(point).toBeInViewport();
    }
    await expect(title).toBeVisible();
    await expect(title).toBeInViewport();
  });
});

// Scenario: View trend direction indicator
test.describe('Trend direction indicator', () => {
  test('should display trend direction indicator', async ({ page }) => {
    // Three hemoglobin readings a month apart, rising ~1.5 g/dL per month
    await seedAndOpenTrends(page, [
      { date: '2024-03-01', values: [{ biomarker: HEMOGLOBIN, value: 12.5 }] },
      { date: '2024-04-01', values: [{ biomarker: HEMOGLOBIN, value: 14.0 }] },
      { date: '2024-05-01', values: [{ biomarker: HEMOGLOBIN, value: 15.5 }] },
    ]);
    await selectBiomarker(page, 'Hemoglobin');

    await expect(dataPoints(page)).toHaveCount(3);
    await expect(page.getByRole('main').getByText('Increasing', { exact: true })).toBeVisible();
  });

  test('does not plot a value whose unit cannot be converted to the chart unit', async ({ page }) => {
    await seedAndOpenTrends(page, [
      { date: '2024-03-01', values: [{ biomarker: HEMOGLOBIN, value: 12.5 }] },
      { date: '2024-04-01', values: [{ biomarker: HEMOGLOBIN, value: 14.0 }] },
      { date: '2024-05-01', values: [{ biomarker: HEMOGLOBIN, value: 140, unit: 'xyz/L' }] },
    ]);
    await selectBiomarker(page, 'Hemoglobin');

    await expect(dataPoints(page)).toHaveCount(2);
    await expect(
      page.getByRole('main').getByText(
        '1 value recorded in xyz/L is not shown: it cannot be converted to g/dL.'
      )
    ).toBeVisible();
  });

  test('should show stable when values barely change', async ({ page }) => {
    await seedAndOpenTrends(page, [
      { date: '2024-03-01', values: [{ biomarker: HEMOGLOBIN, value: 14.0 }] },
      { date: '2024-04-01', values: [{ biomarker: HEMOGLOBIN, value: 14.1 }] },
      { date: '2024-05-01', values: [{ biomarker: HEMOGLOBIN, value: 14.0 }] },
    ]);
    await selectBiomarker(page, 'Hemoglobin');

    await expect(page.getByRole('main').getByText('Stable', { exact: true })).toBeVisible();
  });
});

test.describe('Reference page from a trend', () => {
  test.beforeEach(async ({ page }) => {
    await seedAndOpenTrends(page);
  });

  test("opens the biomarker's reference page, and from there the list", async ({ page }) => {
    await selectBiomarker(page, 'Glucose');

    await referenceLink(page, 'Glucose').click();

    const detail = await expectDetailPage(page, 'Glucose');
    await backButton(detail).click();
    await expect(searchField(page)).toBeVisible();
  });

  test('follows the biomarker picked after switching', async ({ page }) => {
    await selectBiomarker(page, 'Glucose');
    await selectBiomarker(page, 'Hemoglobin');

    await expect(referenceLink(page, 'Glucose')).toHaveCount(0);
    await referenceLink(page, 'Hemoglobin').click();

    await expectDetailPage(page, 'Hemoglobin');
  });

  test('is reached by tabbing, and opens with Enter', async ({ page }) => {
    await selectBiomarker(page, 'Glucose');
    const link = referenceLink(page, 'Glucose');

    // Reached by tabbing: back to the control before it, then forward again
    await link.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(link).not.toBeFocused();
    await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
    await page.keyboard.press('Enter');

    await expectDetailPage(page, 'Glucose');
  });

  test('works while a unit Glucose does not support is typed', async ({ page }) => {
    await selectBiomarker(page, 'Glucose');
    await page.getByRole('textbox', { name: 'Preferred unit' }).fill('stones');
    await expect(page.getByText('Unit not supported for Glucose')).toBeVisible();

    await referenceLink(page, 'Glucose').click();

    await expectDetailPage(page, 'Glucose');
  });

  test('choosing Trends in the menu starts the page over', async ({ page }) => {
    await selectBiomarker(page, 'Glucose');

    await goToTrends(page);

    await expect(biomarkerSelect(page)).toHaveValue('');
    await expect(referenceLink(page, 'Glucose')).toHaveCount(0);
  });
});

test('a trend opened from a biomarker page starts at the top', async ({ page }) => {
  await seedAndOpenTrends(page);
  await goToDictionary(page);
  const detail = await viewDetail(page, 'Glucose');
  const viewTrend = detail.getByRole('region', { name: 'Your results' }).getByRole('button', { name: 'View trend' });
  await page.mouse.wheel(0, 120);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(120);

  await viewTrend.click();

  await expect(biomarkerSelect(page)).toHaveValue(/^Glucose \(/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test('a test with a single unit offers its reference page', async ({ page }) => {
  await seedAndOpenTrends(page, [
    { date: '2024-03-01', values: [{ biomarker: RDW, value: 13 }] },
    { date: '2024-04-01', values: [{ biomarker: RDW, value: 13.4 }] },
  ]);

  await selectBiomarker(page, RDW.name);

  await expect(page.getByRole('textbox', { name: 'Preferred unit' })).toHaveCount(0);
  await referenceLink(page, RDW.name).click();
  await expectDetailPage(page, RDW.name);
});

test('a test outside the biomarker dictionary offers no reference page', async ({ page }) => {
  // A legacy hash ID: a test the dictionary does not have
  const zorblatin = { id: 10042, name: 'Zorblatin index', unit: 'U', low: 1, high: 5 };
  await seedAndOpenTrends(page, [
    { date: '2024-03-01', values: [{ biomarker: zorblatin, value: 3 }] },
    { date: '2024-04-01', values: [{ biomarker: zorblatin, value: 4 }] },
  ]);

  await selectBiomarker(page, 'Zorblatin index');

  await expect(dataPoints(page)).toHaveCount(2);
  await expect(page.getByRole('main').getByRole('button', { name: /^View reference/ })).toHaveCount(0);
});
