/**
 * E2E Tests for Import Wizard
 *
 * Implements features/import-wizard.feature:
 * - Upload step (file selection, validation)
 * - Analysis step (progress, errors)
 * - Review step (editing, validation)
 * - Confirm step (save, navigation)
 *
 * The AI is a mocked local Ollama server; documents are real PDFs/images so
 * the app's own text extraction runs.
 */

import * as fs from 'fs';
import { test, expect } from './fixtures';
import type { Locator, Page } from '@playwright/test';
import { DEFAULT_EXTRACTION } from './steps/ai.steps';
import { createTextLabReportPdf } from './steps/aiModelSelection.steps';
import { expandLabResult, labResultCard, goToTimeline } from './steps/timeline.steps';
import { removeTempFile, writeTempFile } from './steps/tempFiles';
import {
  createTextPdf,
  extraction,
  LAB_REPORT_LINES,
} from './steps/documentAnalysis.steps';
import {
  analysisItem,
  analyzeButton,
  analyzeToReview,
  chooseFileWithPicker,
  continueToConfirm,
  expectAnalysisFinished,
  formatFileSize,
  goToImport,
  loginWithOllama,
  main,
  reviewCell,
  reviewRow,
  saveResults,
  startAnalysis,
  tabToUploadArea,
  uploadArea,
  uploadFiles,
} from './steps/importWizard.steps';

/**
 * Create a minimal PNG image file for testing (1x1 transparent PNG)
 */
function createMockLabReportImage(): string {
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  return writeTempFile('mock-lab-report.png', Buffer.from(pngBase64, 'base64'));
}

/**
 * Resolve a Mantine theme colour to the computed CSS colour the browser uses
 */
async function themeColor(page: Page, color: 'green' | 'yellow' | 'red'): Promise<string> {
  return page.evaluate((c) => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = `var(--mantine-color-${c}-filled)`;
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return value;
  }, color);
}

async function expectBadgeColor(page: Page, label: Locator, color: 'green' | 'yellow' | 'red') {
  // The colour is on the badge itself, around its text label
  const badge = label.locator('xpath=..');
  await expect(badge).toHaveCSS('background-color', await themeColor(page, color));
}

/** Track temp files per test so every test cleans up after itself */
let tempFiles: string[] = [];
function track(filePath: string): string {
  tempFiles.push(filePath);
  return filePath;
}

test.afterEach(() => {
  tempFiles.forEach(removeTempFile);
  tempFiles = [];
});

test.describe('Import Wizard', () => {
  test.describe('Upload Step', () => {
    test.beforeEach(async ({ page }) => {
      await loginWithOllama(page);
      await goToImport(page);
    });

    test('should display upload interface when navigating to Import', async ({ page }) => {
      await expect(main(page).getByText('Drag files here or click to select')).toBeVisible();
      await expect(analyzeButton(page)).toBeHidden();
      await expect(main(page).getByRole('button', { name: 'Analyze', exact: true })).toBeDisabled();
    });

    test('should show supported file types', async ({ page }) => {
      await expect(main(page).getByText('Supported formats: PDF, JPEG, PNG, WebP, GIF')).toBeVisible();
    });

    test('should allow selecting files via the file picker', async ({ page }) => {
      const imagePath = track(createMockLabReportImage());

      await chooseFileWithPicker(page, () => uploadArea(page).click(), imagePath);

      await expect(main(page).getByText('Selected Files (1)')).toBeVisible();
      // Images get a thumbnail preview
      await expect(main(page).getByRole('img', { name: 'mock-lab-report.png' })).toBeVisible();
    });

    test('should display file name and size after upload', async ({ page }) => {
      const pdfPath = track(createTextLabReportPdf());
      const size = formatFileSize(fs.statSync(pdfPath).size);

      await uploadFiles(page, pdfPath);

      const fileList = main(page).getByText('Selected Files (1)').locator('xpath=../..');
      await expect(fileList.getByText('lab-report.pdf')).toBeVisible();
      await expect(fileList.getByText(size, { exact: true })).toBeVisible();
      await expect(fileList.getByRole('button', { name: 'Remove lab-report.pdf' })).toBeVisible();
    });

    test('should allow removing uploaded file', async ({ page }) => {
      await uploadFiles(page, track(createMockLabReportImage()));
      await expect(main(page).getByText('mock-lab-report.png')).toBeVisible();

      await main(page).getByRole('button', { name: 'Remove mock-lab-report.png' }).click();

      await expect(main(page).getByText('mock-lab-report.png')).toBeHidden();
      await expect(main(page).getByText(/^Selected Files/)).toBeHidden();
    });

    test('should show analyze button after file upload', async ({ page }) => {
      await uploadFiles(page, track(createMockLabReportImage()));

      await expect(analyzeButton(page)).toHaveText('Analyze (1)');
      await expect(analyzeButton(page)).toBeEnabled();
    });

    test('should proceed to the analysis step when clicking Analyze', async ({ page }) => {
      await uploadFiles(page, track(createTextLabReportPdf()));
      await startAnalysis(page);

      await expect(analysisItem(page, 'lab-report.pdf')).toBeVisible();
      await expect(main(page).getByText('Drag files here or click to select')).toBeHidden();
    });

    test('should reject unsupported file types', async ({ page }) => {
      const exePath = track(writeTempFile('test.exe', 'executable content'));

      await uploadFiles(page, exePath);

      const error = page.getByRole('alert', { name: 'Upload Error' });
      await expect(error).toBeVisible();
      await expect(error).toContainText(/rejected|unsupported/i);
      await expect(main(page).getByText('test.exe')).toBeHidden();
      await expect(main(page).getByText(/^Selected Files/)).toBeHidden();
      await expect(main(page).getByRole('button', { name: 'Analyze', exact: true })).toBeDisabled();
    });
  });

  test.describe('Analysis Step', () => {
    test('should show progress indicator during analysis', async ({ page }) => {
      const ai = await loginWithOllama(page, undefined, { hold: true });
      await goToImport(page);
      await uploadFiles(page, track(createTextLabReportPdf()));
      await startAnalysis(page);

      // While the AI is working: overall progress, current file and its stage
      await expect(main(page).getByText('Processing 1 file(s)...')).toBeVisible();
      const item = analysisItem(page, 'lab-report.pdf');
      await expect(item.getByText(/^Analyzing with Ollama/)).toBeVisible();
      await expect(item.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60');
      await expect(main(page).getByRole('progressbar')).toHaveCount(2);
      await expect(main(page).getByRole('button', { name: /^Review Results/ })).toBeDisabled();

      ai.release();

      await expectAnalysisFinished(page);
      await expect(page.getByRole('alert', { name: 'Analysis Complete' })).toContainText(
        'Successfully extracted 2 biomarker values from 1 file(s).'
      );
      await expect(main(page).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    });

    test('should handle analysis failure gracefully', async ({ page }) => {
      await loginWithOllama(page, [
        { status: 500, error: 'model crashed' },
        { extraction: DEFAULT_EXTRACTION },
      ]);
      await goToImport(page);
      await uploadFiles(page, [
        track(createTextPdf('report-a.pdf', [LAB_REPORT_LINES])),
        track(createTextPdf('report-b.pdf', [LAB_REPORT_LINES])),
      ]);
      await startAnalysis(page);
      await expectAnalysisFinished(page);

      // The failed file shows its own error
      await expect(analysisItem(page, 'report-a.pdf')).toContainText(
        'AI analysis failed: Ollama API error: model crashed'
      );
      await expect(page.getByRole('alert', { name: 'Some Files Failed' })).toContainText(
        '1 file(s) could not be processed'
      );
      await expect(page.getByRole('alert', { name: 'Analysis Complete' })).toContainText('from 1 file(s)');

      // Skip the failed file and continue with the successful one
      const review = main(page).getByRole('button', { name: /^Review Results/ });
      await expect(review).toBeEnabled();
      await review.click();
      await expect(main(page).getByText('2 biomarker(s) from 1 file(s)')).toBeVisible();
      await expect(main(page).getByRole('button', { name: /report-b\.pdf/ })).toBeVisible();
      await expect(main(page).getByText('report-a.pdf')).toBeHidden();
    });
  });

  test.describe('Review Step', () => {
    test('should display extracted biomarkers', async ({ page }) => {
      await loginWithOllama(page);
      await analyzeToReview(page, track(createTextLabReportPdf()));

      await expect(main(page).getByText('2 biomarker(s) from 1 file(s)')).toBeVisible();

      const glucose = reviewRow(page, 'Glucose');
      await expect(reviewCell(glucose, 'Value')).toHaveText('95');
      await expect(reviewCell(glucose, 'Unit')).toHaveText('mg/dL');
      await expect(reviewCell(glucose, 'Reference Range')).toHaveText('70 - 100');
      await expect(reviewCell(glucose, 'Confidence')).toHaveText('95%');

      const hemoglobin = reviewRow(page, 'Hemoglobin');
      await expect(reviewCell(hemoglobin, 'Value')).toHaveText('14.5');
      await expect(reviewCell(hemoglobin, 'Unit')).toHaveText('g/dL');
      // No reference range was detected for hemoglobin
      await expect(reviewCell(hemoglobin, 'Reference Range')).toHaveText('—');
      await expect(reviewCell(hemoglobin, 'Confidence')).toHaveText('90%');
    });

    test('should show confidence indicators', async ({ page }) => {
      await loginWithOllama(page, [
        {
          extraction: extraction([
            { name: 'Glucose', value: 95, unit: 'mg/dL', confidence: 0.95 },
            { name: 'Hemoglobin', value: 14.5, unit: 'g/dL', confidence: 0.75 },
            { name: 'Total Cholesterol', value: 180, unit: 'mg/dL', confidence: 0.5 },
          ]),
        },
      ]);
      await analyzeToReview(page, track(createTextLabReportPdf()));

      const high = reviewCell(reviewRow(page, 'Glucose'), 'Confidence');
      const medium = reviewCell(reviewRow(page, 'Hemoglobin'), 'Confidence');
      const low = reviewCell(reviewRow(page, 'Total Cholesterol'), 'Confidence');

      // The score is always written out, so colour is not the only signal
      await expect(high).toHaveText('95%');
      await expect(medium).toHaveText('75%');
      await expect(low).toHaveText('50%');
      await expectBadgeColor(page, high.getByText('95%'), 'green');
      await expectBadgeColor(page, medium.getByText('75%'), 'yellow');
      await expectBadgeColor(page, low.getByText('50%'), 'red');

      await expect(main(page).getByText('1 low confidence')).toBeVisible();
    });

    test('should allow editing extracted values', async ({ page }) => {
      await loginWithOllama(page);
      await analyzeToReview(page, track(createTextLabReportPdf()));

      const glucose = reviewRow(page, 'Glucose');
      await glucose.getByRole('button', { name: 'Edit biomarker' }).click();
      const editing = main(page)
        .getByRole('row')
        .filter({ has: page.getByRole('button', { name: 'Save changes' }) });

      await editing.getByPlaceholder('Value', { exact: true }).fill('5.3');
      await editing.getByPlaceholder('Unit', { exact: true }).fill('mmol/L');
      await editing.getByRole('button', { name: 'Save changes' }).click();

      await expect(reviewCell(glucose, 'Value')).toHaveText('5.3');
      await expect(reviewCell(glucose, 'Unit')).toHaveText('mmol/L');

      // While editing the name, matching dictionary biomarkers are listed
      await reviewRow(page, 'Hemoglobin').getByRole('button', { name: 'Edit biomarker' }).click();
      await editing.getByPlaceholder('Biomarker name').fill('Hemato');
      await expect(page.getByRole('option', { name: 'Hematocrit' })).toBeVisible();
    });

    test('keeps the unit of a renamed value and asks for one that fits', async ({ page }) => {
      await loginWithOllama(page);
      await analyzeToReview(page, track(createTextLabReportPdf()));

      // Typing passes through other biomarkers' names ("Hb" is Hemoglobin)
      await reviewRow(page, 'Glucose').getByRole('button', { name: 'Edit biomarker' }).click();
      const editing = main(page)
        .getByRole('row')
        .filter({ has: page.getByRole('button', { name: 'Save changes' }) });
      const name = editing.getByPlaceholder('Biomarker name');
      await name.clear();
      await name.pressSequentially('HbA1c');
      await expect(editing.getByPlaceholder('Unit', { exact: true })).toHaveValue('mg/dL');
      await editing.getByRole('button', { name: 'Save changes' }).click();
      await expect(reviewCell(reviewRow(page, 'HbA1c'), 'Unit')).toHaveText('mg/dL');

      await main(page).getByRole('button', { name: 'Continue to Confirm' }).click();
      await expect(main(page).getByText('Cannot Continue')).toBeVisible();
      await expect(
        main(page).getByText(/HbA1c in ".*": mg\/dL is not a unit for Hemoglobin A1c/)
      ).toBeVisible();
    });

    test('shows every problem that stops the import once asked', async ({ page }) => {
      // Scenario: User sees every problem that stops the import
      const misfits = Array.from({ length: 7 }, (_, index) => ({
        name: `Glicemia ${index + 1}`,
        value: index + 1,
        unit: 'mmol/24h',
        confidence: 0.95,
        biomarkerKey: 'glucose',
      }));
      await loginWithOllama(page, [{ extraction: extraction(misfits) }]);
      await analyzeToReview(page, track(createTextLabReportPdf()));

      await main(page).getByRole('button', { name: 'Continue to Confirm' }).click();
      const problems = main(page).getByRole('alert').filter({ hasText: 'Cannot Continue' });
      await expect(problems.getByRole('listitem')).toHaveCount(5);
      await expect(problems.getByText(/^Glicemia 6 in/)).toHaveCount(0);

      await problems.getByRole('button', { name: 'Show 2 more' }).click();

      await expect(problems.getByRole('listitem')).toHaveCount(7);
      await expect(problems.getByText(/^Glicemia 7 in ".*": mmol\/24h is not a unit for Glucose/)).toBeVisible();
    });

    test('saves a name that matches no dictionary entry as typed', async ({ page }) => {
      await loginWithOllama(page);
      await analyzeToReview(page, track(createTextLabReportPdf()));

      await reviewRow(page, 'Hemoglobin').getByRole('button', { name: 'Edit biomarker' }).click();
      const editing = main(page)
        .getByRole('row')
        .filter({ has: page.getByRole('button', { name: 'Save changes' }) });
      await editing.getByPlaceholder('Biomarker name').fill('Zorblatin');
      await editing.getByRole('button', { name: 'Save changes' }).click();

      await continueToConfirm(page);
      await saveResults(page);

      const card = await expandLabResult(page, '2024-01-15');
      await expect(card.getByRole('row').filter({ hasText: 'Zorblatin' })).toContainText('14.5');
    });

    test('should allow adding missing values', async ({ page }) => {
      await loginWithOllama(page);
      await analyzeToReview(page, track(createTextLabReportPdf()));

      await main(page).getByRole('button', { name: 'Add Biomarker' }).click();
      const editing = main(page)
        .getByRole('row')
        .filter({ has: page.getByRole('button', { name: 'Save changes' }) });

      await editing.getByPlaceholder('Value', { exact: true }).fill('180');
      await editing.getByPlaceholder('Unit', { exact: true }).fill('mg/dL');

      // The biomarker is selected from the dictionary
      await editing.getByPlaceholder('Biomarker name').fill('Cholest');
      await page.getByRole('option', { name: 'Total Cholesterol', exact: true }).click();
      await editing.getByRole('button', { name: 'Save changes' }).click();

      const cholesterol = reviewRow(page, 'Total Cholesterol');
      await expect(reviewCell(cholesterol, 'Value')).toHaveText('180');
      await expect(reviewCell(cholesterol, 'Unit')).toHaveText('mg/dL');
      await expect(main(page).getByText('3 biomarker(s) from 1 file(s)')).toBeVisible();
    });

    test('should show date picker for lab date', async ({ page }) => {
      await loginWithOllama(page);
      await analyzeToReview(page, track(createTextLabReportPdf()));

      await main(page).getByLabel('Lab Date', { exact: true }).click();
      const calendar = page.getByRole('dialog');
      await expect(calendar).toBeVisible();
      // Opens on the detected date's month
      await calendar.getByRole('button', { name: '20 January 2024', exact: true }).click();
      await expect(calendar).toBeHidden();

      await continueToConfirm(page);
      await expect(main(page).getByText('2024-01-20').first()).toBeVisible();
    });

    test('should pre-fill the detected lab date and name and allow changing them', async ({ page }) => {
      await loginWithOllama(page);
      await analyzeToReview(page, track(createTextLabReportPdf()));

      const labDate = main(page).getByRole('textbox', { name: 'Lab Date' });
      const labName = main(page).getByRole('textbox', { name: 'Lab Name' });
      await expect(labDate).toHaveValue('2024-01-15');
      await expect(labName).toHaveValue('Test Laboratory');

      await labDate.fill('2024-01-16');
      await labName.fill('City Hospital Lab');

      await continueToConfirm(page);
      const labDateCard = main(page).getByText('Lab Date(s)', { exact: true }).locator('xpath=..');
      const labNameCard = main(page).getByText('Lab(s)', { exact: true }).locator('xpath=..');
      await expect(labDateCard).toContainText('2024-01-16');
      await expect(labNameCard).toContainText('City Hospital Lab');
    });

    test('should display specimen type column for matched biomarkers', async ({ page }) => {
      await loginWithOllama(page, [
        {
          extraction: extraction([
            { name: 'Glucose', value: 95, unit: 'mg/dL', confidence: 0.95 },
            { name: 'Hemoglobin', value: 14.5, unit: 'g/dL', confidence: 0.9 },
            { name: 'Zorblatin', value: 3, unit: 'mg/L', confidence: 0.9 },
          ]),
        },
      ]);
      await analyzeToReview(page, track(createTextLabReportPdf()));

      await expect(main(page).getByRole('columnheader', { name: 'Specimen' })).toBeVisible();
      await expect(reviewCell(reviewRow(page, 'Glucose'), 'Specimen')).toHaveText('Serum');
      await expect(reviewCell(reviewRow(page, 'Hemoglobin'), 'Specimen')).toHaveText('Whole Blood');
      // Not in the dictionary: no specimen type
      await expect(reviewCell(reviewRow(page, 'Zorblatin'), 'Specimen')).toHaveText('—');
    });

    test('should extract specimen type from biomarker name when unmatched', async ({ page }) => {
      await loginWithOllama(page, [
        {
          extraction: extraction([
            { name: 'Albumina/L (urine)', value: 12, unit: 'mg/L', confidence: 0.9 },
          ]),
        },
      ]);
      await analyzeToReview(page, track(createTextLabReportPdf()));

      const row = reviewRow(page, 'Albumina/L');
      await expect(reviewCell(row, 'Biomarker')).toHaveText('Albumina/L');
      await expect(reviewCell(row, 'Specimen')).toHaveText('Urine');
    });

    test('should show LOINC code in tooltip on hover', async ({ page }) => {
      await loginWithOllama(page);
      await analyzeToReview(page, track(createTextLabReportPdf()));

      await reviewCell(reviewRow(page, 'Glucose'), 'Biomarker').getByText('Glucose').hover();

      const tooltip = page.getByRole('tooltip');
      await expect(tooltip).toContainText('LOINC: 2345-7');
      await expect(tooltip).toContainText('Blood sugar level, primary energy source for cells.');
    });
  });

  test.describe('Confirm Step', () => {
    test('should show summary of values to be saved', async ({ page }) => {
      await loginWithOllama(page);
      await analyzeToReview(page, track(createTextLabReportPdf()));
      await continueToConfirm(page);

      const summaryValue = (label: string) =>
        main(page).getByText(label, { exact: true }).locator('xpath=..');
      await expect(summaryValue('Files')).toContainText('1');
      await expect(summaryValue('Biomarkers')).toContainText('2');
      await expect(summaryValue('Lab Date(s)')).toContainText('2024-01-15');
      await expect(summaryValue('Lab(s)')).toContainText('Test Laboratory');

      const values = main(page).getByRole('table');
      await expect(values.getByRole('row').filter({ hasText: 'Glucose' })).toContainText('95 mg/dL');
      await expect(values.getByRole('row').filter({ hasText: 'Glucose' })).toContainText('70 - 100 mg/dL');
      await expect(values.getByRole('row').filter({ hasText: 'Hemoglobin' })).toContainText('14.5 g/dL');
      await expect(main(page).getByText('2 values', { exact: true })).toBeVisible();
    });

    test('should save results and redirect to timeline', async ({ page }) => {
      await loginWithOllama(page);
      await analyzeToReview(page, track(createTextLabReportPdf()));
      await continueToConfirm(page);
      await saveResults(page);

      await expect(page.getByText('Import Complete').first()).toBeVisible();
      await expect(
        page.getByText('Successfully saved 1 lab result(s) with 2 test value(s).').first()
      ).toBeVisible();
      await expect(
        page.getByRole('navigation').getByRole('button', { name: /^Timeline/ })
      ).toHaveAttribute('aria-current', 'page');

      const card = labResultCard(page, '2024-01-15');
      await expect(card).toContainText('Test Laboratory');
    });

    test('should allow going back to make changes', async ({ page }) => {
      await loginWithOllama(page);
      await analyzeToReview(page, track(createTextLabReportPdf()));

      // Edits on the review step
      await reviewRow(page, 'Hemoglobin').getByRole('button', { name: 'Remove biomarker' }).click();
      await main(page).getByRole('textbox', { name: 'Lab Name' }).fill('City Hospital Lab');
      await continueToConfirm(page);
      await expect(main(page).getByText('1 values', { exact: true })).toBeVisible();

      await main(page).getByRole('button', { name: 'Back to Review' }).click();

      await expect(main(page).getByText('Review Extracted Values')).toBeVisible();
      await expect(main(page).getByText('1 biomarker(s) from 1 file(s)')).toBeVisible();
      await expect(reviewRow(page, 'Glucose')).toBeVisible();
      await expect(reviewRow(page, 'Hemoglobin')).toHaveCount(0);
      await expect(main(page).getByRole('textbox', { name: 'Lab Name' })).toHaveValue('City Hospital Lab');
    });
  });

  test.describe('Accessibility', () => {
    test('upload area should be keyboard accessible', async ({ page }) => {
      await loginWithOllama(page);
      await goToImport(page);
      const imagePath = track(createMockLabReportImage());

      await tabToUploadArea(page);
      await chooseFileWithPicker(page, () => page.keyboard.press('Enter'), imagePath);

      await expect(main(page).getByText('Selected Files (1)')).toBeVisible();
      await expect(main(page).getByText('mock-lab-report.png')).toBeVisible();
    });

    test('should have accessible labels on form fields', async ({ page }) => {
      await loginWithOllama(page);
      await goToImport(page);

      // Upload instructions are text, so screen readers announce them
      await expect(main(page).getByText('Drag files here or click to select')).toBeVisible();
      await expect(main(page).getByText('Supported formats: PDF, JPEG, PNG, WebP, GIF')).toBeVisible();
      await expect(main(page).getByText('Maximum file size: 50MB')).toBeVisible();

      // Review step form fields are labelled
      await analyzeToReview(page, track(createTextLabReportPdf()));
      await expect(main(page).getByRole('textbox', { name: 'Lab Date' })).toBeVisible();
      await expect(main(page).getByRole('textbox', { name: 'Lab Name' })).toBeVisible();
      await expect(
        reviewRow(page, 'Glucose').getByRole('button', { name: 'Edit biomarker' })
      ).toBeVisible();
      await expect(
        reviewRow(page, 'Glucose').getByRole('button', { name: 'Remove biomarker' })
      ).toBeVisible();
    });
  });
});

test.describe('Import Wizard - With AI Mocking', () => {
  test('full import flow with mocked AI', async ({ page }) => {
    const ai = await loginWithOllama(page);
    await goToImport(page);

    // 1. Upload file
    await uploadFiles(page, track(createTextLabReportPdf()));
    await expect(main(page).getByText('lab-report.pdf')).toBeVisible();

    // 2. Analyze with the (mocked) AI
    await startAnalysis(page);
    await expect(page.getByRole('alert', { name: 'Analysis Complete' })).toBeVisible();
    expect(ai.prompts).toHaveLength(1);

    // 3. Review extracted values
    await main(page).getByRole('button', { name: /^Review Results/ }).click();
    await expect(reviewRow(page, 'Glucose')).toBeVisible();
    await expect(reviewRow(page, 'Hemoglobin')).toBeVisible();

    // 4. Confirm and save
    await continueToConfirm(page);
    await saveResults(page);

    // 5. Redirected to the timeline
    await expect(
      page.getByRole('navigation').getByRole('button', { name: /^Timeline/ })
    ).toHaveAttribute('aria-current', 'page');

    // 6. The data was saved
    await goToTimeline(page);
    const card = await expandLabResult(page, '2024-01-15');
    const values = card.getByRole('table', { name: 'Test values' });
    await expect(values.getByRole('row').filter({ hasText: 'Glucose' })).toContainText('95');
    await expect(values.getByRole('row').filter({ hasText: 'Hemoglobin' })).toContainText('14.5');
  });
});
