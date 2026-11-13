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
import * as path from 'path';
import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { DEFAULT_EXTRACTION } from './steps/ai.steps';
import { createTextLabReportPdf } from './steps/aiModelSelection.steps';
import { expandLabResult, labResultCard, goToTimeline } from './steps/timeline.steps';
import { changeTest, editingRow, NOT_A_LOINC_TEST, savedAsCell } from './steps/identification.steps';
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

    /** A lab report whose text, and so its prompt, names the lab `lab` */
    function labReport(fileName: string, lab: string): string {
      return track(createTextPdf(fileName, [[`${lab} - Blood Panel Report`, ...LAB_REPORT_LINES.slice(1)]]));
    }

    const reviewResultsButton = (page: Page) => main(page).getByRole('button', { name: /^Review Results/ });
    const backButton = (page: Page) => main(page).getByRole('button', { name: 'Back', exact: true });
    const labNames = (page: Page) => main(page).getByRole('textbox', { name: 'Lab Name' });

    test('retries a failed file on its own, keeping the review edits of the other', async ({ page }) => {
      const ai = await loginWithOllama(page, [
        { status: 500, error: 'model crashed' },
        { extraction: DEFAULT_EXTRACTION },
      ]);
      await goToImport(page);
      await uploadFiles(page, [labReport('report-a.pdf', 'Alpha Lab'), labReport('report-b.pdf', 'Beta Lab')]);
      await startAnalysis(page);
      await expectAnalysisFinished(page);

      // Only the failed file can be retried
      await expect(page.getByRole('alert', { name: 'Some Files Failed' })).toContainText(
        'You can retry a failed file, or continue with the successful files.'
      );
      await expect(main(page).getByRole('button', { name: 'Retry report-b.pdf' })).toHaveCount(0);
      const retry = main(page).getByRole('button', { name: 'Retry report-a.pdf' });
      await expect(retry).toBeVisible();

      // Review the file that was analysed, and edit it
      await reviewResultsButton(page).click();
      await labNames(page).fill('Beta Lab, Ward 2');

      // Back on the analysis, retry the failed file: only it goes to the AI again
      await backButton(page).click();
      await expect(main(page).getByText('Processing complete')).toBeVisible();
      await retry.click();
      await expectAnalysisFinished(page);
      expect(ai.prompts).toHaveLength(3);
      expect(ai.prompts[2]).toContain('Alpha Lab');
      await expect(analysisItem(page, 'report-a.pdf')).not.toContainText('model crashed');
      await expect(page.getByRole('alert', { name: 'Some Files Failed' })).toBeHidden();
      await expect(page.getByRole('alert', { name: 'Analysis Complete' })).toContainText('from 2 file(s)');

      // Both are reviewed, in upload order, the edit kept
      await reviewResultsButton(page).click();
      await expect(main(page).getByText('4 biomarker(s) from 2 file(s)')).toBeVisible();
      const files = main(page).getByRole('button', { name: /report-[ab]\.pdf/ });
      await expect(files.nth(0)).toContainText('report-a.pdf');
      await expect(files.nth(1)).toContainText('report-b.pdf');
      await files.nth(1).click();
      await expect(labNames(page).nth(1)).toHaveValue('Beta Lab, Ward 2');
    });

    test('going back from review shows the finished analysis and keeps the review edits', async ({ page }) => {
      const ai = await loginWithOllama(page);
      await analyzeToReview(page, track(createTextLabReportPdf()));
      await labNames(page).fill('City Hospital Lab');

      await backButton(page).click();
      await expect(main(page).getByText('Processing complete')).toBeVisible();
      await expect(page.getByRole('alert', { name: 'Analysis Complete' })).toContainText(
        'Successfully extracted 2 biomarker values from 1 file(s).'
      );
      await expect(main(page).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');

      await reviewResultsButton(page).click();
      await expect(labNames(page)).toHaveValue('City Hospital Lab');
      expect(ai.prompts).toHaveLength(1);
    });

    test('analyses only the files added, and drops the files removed', async ({ page }) => {
      const ai = await loginWithOllama(page);
      await goToImport(page);
      await uploadFiles(page, labReport('report-a.pdf', 'Alpha Lab'));
      await startAnalysis(page);
      await expectAnalysisFinished(page);

      // The files chosen are still there; only the added one is analysed
      await backButton(page).click();
      await expect(main(page).getByText('report-a.pdf')).toBeVisible();
      await uploadFiles(page, labReport('report-b.pdf', 'Beta Lab'));
      await startAnalysis(page);
      await expectAnalysisFinished(page);
      expect(ai.prompts).toHaveLength(2);
      expect(ai.prompts[1]).toContain('Beta Lab');
      await expect(page.getByRole('alert', { name: 'Analysis Complete' })).toContainText('from 2 file(s)');

      // A removed file is no longer analysed or reviewed
      await backButton(page).click();
      await main(page).getByRole('button', { name: 'Remove report-a.pdf' }).click();
      await startAnalysis(page);
      await expectAnalysisFinished(page);
      await expect(analysisItem(page, 'report-a.pdf')).toHaveCount(0);
      await expect(analysisItem(page, 'report-b.pdf')).toBeVisible();
      await reviewResultsButton(page).click();
      await expect(main(page).getByText('2 biomarker(s) from 1 file(s)')).toBeVisible();
      expect(ai.prompts).toHaveLength(2);
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
      await expect(reviewCell(glucose, 'Reference Range')).toHaveText('70 - 100 mg/dL');
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
      const editing = editingRow(page);

      await editing.getByPlaceholder('Value', { exact: true }).fill('5.3');
      await editing.getByPlaceholder('Unit', { exact: true }).fill('mmol/L');
      await editing.getByRole('button', { name: 'Save changes' }).click();

      await expect(reviewCell(glucose, 'Value')).toHaveText('5.3');
      await expect(reviewCell(glucose, 'Unit')).toHaveText('mmol/L');

      // Its test is read again in the new unit: the AI chose it for mg/dL
      await expect(savedAsCell(glucose)).not.toHaveText('Glucose [Mass/volume] in Serum or Plasma');
    });

    test('keeps the unit of a renamed value and asks for its test', async ({ page }) => {
      // Scenario: Renaming a value keeps the unit it was measured in
      await loginWithOllama(page);
      await analyzeToReview(page, track(createTextLabReportPdf()));

      await reviewRow(page, 'Glucose').getByRole('button', { name: 'Edit biomarker' }).click();
      const editing = editingRow(page);
      const name = editing.getByPlaceholder('Biomarker name');
      await name.clear();
      await name.pressSequentially('Zorblatina');
      await expect(editing.getByPlaceholder('Unit', { exact: true })).toHaveValue('mg/dL');
      await editing.getByRole('button', { name: 'Save changes' }).click();
      await expect(reviewCell(reviewRow(page, 'Zorblatina'), 'Unit')).toHaveText('mg/dL');

      await main(page).getByRole('button', { name: 'Continue to Confirm' }).click();
      await expect(main(page).getByText('Cannot Continue')).toBeVisible();
      await expect(
        main(page).getByText(/Zorblatina in ".*" needs a test: choose one or "Not a LOINC test"/)
      ).toBeVisible();
    });

    test('shows every problem that stops the import once asked', async ({ page }) => {
      // Scenario: User sees every problem that stops the import
      const misfits = Array.from({ length: 7 }, (_, index) => ({
        name: `Zorblatina ${index + 1}`,
        value: index + 1,
        unit: 'mg/dL',
        confidence: 0.95,
      }));
      // The AI cannot be asked, so each value is left for me to choose
      await loginWithOllama(page, [{ extraction: extraction(misfits) }], {}, { fails: true });
      await analyzeToReview(page, track(createTextLabReportPdf()));

      await main(page).getByRole('button', { name: 'Continue to Confirm' }).click();
      const problems = main(page).getByRole('alert').filter({ hasText: 'Cannot Continue' });
      await expect(problems.getByRole('listitem')).toHaveCount(5);
      await expect(problems.getByText(/^Zorblatina 6 in/)).toHaveCount(0);

      await problems.getByRole('button', { name: 'Show 2 more' }).click();

      await expect(problems.getByRole('listitem')).toHaveCount(7);
      await expect(problems.getByText(/^Zorblatina 7 in ".*" needs a test/)).toBeVisible();

      // Each try lists the problems afresh, folded again
      await main(page).getByRole('button', { name: 'Continue to Confirm' }).click();
      await expect(problems.getByRole('listitem')).toHaveCount(5);
      await expect(problems.getByRole('button', { name: 'Show 2 more' })).toBeVisible();
    });

    test('saves a name that is not a LOINC test as typed', async ({ page }) => {
      // Scenario: User enters a name that is not a LOINC test
      await loginWithOllama(page);
      await analyzeToReview(page, track(createTextLabReportPdf()));

      await reviewRow(page, 'Hemoglobin').getByRole('button', { name: 'Edit biomarker' }).click();
      const editing = editingRow(page);
      await editing.getByPlaceholder('Biomarker name').fill('Zorblatin');
      await editing.getByRole('button', { name: 'Save changes' }).click();
      const zorblatin = reviewRow(page, 'Zorblatin');
      await expect(zorblatin.getByText('Not identified')).toBeVisible();
      await changeTest(page, zorblatin, NOT_A_LOINC_TEST);

      await continueToConfirm(page);
      await saveResults(page);

      const card = await expandLabResult(page, '2024-01-15');
      await expect(card.getByRole('row').filter({ hasText: 'Zorblatin' })).toContainText('14.5');
    });

    test('should allow adding missing values', async ({ page }) => {
      await loginWithOllama(page);
      await analyzeToReview(page, track(createTextLabReportPdf()));

      await main(page).getByRole('button', { name: 'Add Biomarker' }).click();
      const editing = editingRow(page);

      await editing.getByPlaceholder('Value', { exact: true }).fill('30');
      await editing.getByPlaceholder('Unit', { exact: true }).fill('U/L');
      await editing.getByPlaceholder('Biomarker name').fill('S-ALT');
      await editing.getByRole('button', { name: 'Save changes' }).click();

      // Its test is found from the name and unit typed
      const alt = reviewRow(page, 'S-ALT');
      await expect(reviewCell(alt, 'Value')).toHaveText('30');
      await expect(reviewCell(alt, 'Unit')).toHaveText('U/L');
      await expect(savedAsCell(alt)).toHaveText(
        'Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma'
      );
      await expect(main(page).getByText('3 biomarker(s) from 1 file(s)')).toBeVisible();
    });

    test('adds a value of a test that has no unit', async ({ page }) => {
      // Scenario: User adds a value of a test that has no unit
      await loginWithOllama(page);
      await analyzeToReview(page, track(createTextLabReportPdf()));

      await main(page).getByRole('button', { name: 'Add Biomarker' }).click();
      const editing = editingRow(page);
      await editing.getByPlaceholder('Biomarker name').fill('Peso specifico');
      await editing.getByPlaceholder('Value', { exact: true }).fill('1.02');
      await editing.getByRole('button', { name: 'Save changes' }).click();
      const row = reviewRow(page, 'Peso specifico');
      await changeTest(page, row, 'Specific gravity of Urine');

      await continueToConfirm(page);
      await expect(main(page).getByRole('row').filter({ hasText: 'Peso specifico' })).toBeVisible();
    });

    test('asks a unit of a value printed without one, once saved as a test measured in one', async ({ page }) => {
      // Scenario: A value printed without a unit, saved as a test measured in one, needs its unit
      await loginWithOllama(page, [
        { extraction: extraction([{ name: 'Glucose', value: 95, unit: '', confidence: 0.95 }]) },
      ]);
      await analyzeToReview(page, track(createTextLabReportPdf()));
      const glucose = reviewRow(page, 'Glucose');
      await expect(savedAsCell(glucose)).toHaveText('Glucose [Mass/volume] in Serum or Plasma');

      await main(page).getByRole('button', { name: 'Continue to Confirm' }).click();
      await expect(main(page).getByText('Cannot Continue')).toBeVisible();
      await expect(main(page).getByText(/Glucose in ".*" is missing: unit/)).toBeVisible();

      // A test the user chooses stays while the unit is given
      await changeTest(page, glucose, 'Glucose [Mass/volume] in Serum or Plasma');
      await glucose.getByRole('button', { name: 'Edit biomarker' }).click();
      const editing = editingRow(page);
      await editing.getByPlaceholder('Unit', { exact: true }).fill('mg/dL');
      await editing.getByRole('button', { name: 'Save changes' }).click();
      await continueToConfirm(page);
    });

    test('asks for a cleared number, and keeps a negative one as typed', async ({ page }) => {
      // Scenario: A value whose number is cleared must be filled in before saving
      await loginWithOllama(page);
      const pdfPath = track(createTextLabReportPdf());
      await analyzeToReview(page, pdfPath);
      const editing = editingRow(page);
      const number = editing.getByPlaceholder('Value', { exact: true });

      await reviewRow(page, 'Hemoglobin').getByRole('button', { name: 'Edit biomarker' }).click();
      await number.clear();
      await editing.getByRole('button', { name: 'Save changes' }).click();
      await main(page).getByRole('button', { name: 'Continue to Confirm' }).click();
      await expect(
        main(page).getByText(`Hemoglobin in "${path.basename(pdfPath)}" is missing: value`, { exact: true })
      ).toBeVisible();

      await reviewRow(page, 'Hemoglobin').getByRole('button', { name: 'Edit biomarker' }).click();
      await expect(number).toHaveValue('');
      // Typed key by key, through the half-typed "-" and "-0"
      await number.pressSequentially('-0.5');
      await expect(number).toHaveValue('-0.5');
      await editing.getByRole('button', { name: 'Save changes' }).click();
      await expect(reviewCell(reviewRow(page, 'Hemoglobin'), 'Value')).toHaveText('-0.5');

      await continueToConfirm(page);
      await expect(
        main(page).getByRole('row').filter({ hasText: 'Hemoglobin' }).getByText('-0.5')
      ).toBeVisible();
    });

    for (const end of ['Low', 'High'] as const) {
      test(`asks for an interval whose ${end.toLowerCase()} end is cleared`, async ({ page }) => {
        // Scenario: An interval with a cleared end must be filled in before saving
        await loginWithOllama(page, [
          {
            extraction: extraction([
              { name: 'Erythrocytes', value: '5-10', unit: '/HPF', confidence: 0.95 },
            ]),
          },
        ]);
        const pdfPath = track(createTextLabReportPdf());
        await analyzeToReview(page, pdfPath);
        const row = reviewRow(page, 'Erythrocytes');
        await expect(reviewCell(row, 'Value')).toHaveText('5-10');
        await changeTest(page, row, NOT_A_LOINC_TEST);

        await row.getByRole('button', { name: 'Edit biomarker' }).click();
        const editing = editingRow(page);
        // The interval's ends come before the reference range's
        const low = editing.getByPlaceholder('Low', { exact: true }).first();
        const high = editing.getByPlaceholder('High', { exact: true }).first();
        await expect(low).toHaveValue('5');
        await expect(high).toHaveValue('10');
        await (end === 'Low' ? low : high).clear();
        await editing.getByRole('button', { name: 'Save changes' }).click();
        await main(page).getByRole('button', { name: 'Continue to Confirm' }).click();
        await expect(
          main(page).getByText(`Erythrocytes in "${path.basename(pdfPath)}" is missing: value`, {
            exact: true,
          })
        ).toBeVisible();

        await row.getByRole('button', { name: 'Edit biomarker' }).click();
        await low.fill('5');
        await high.fill('10');
        await editing.getByRole('button', { name: 'Save changes' }).click();
        await expect(reviewCell(row, 'Value')).toHaveText('5-10');

        await continueToConfirm(page);
        await expect(
          main(page).getByRole('row').filter({ hasText: 'Erythrocytes' }).getByText('5-10')
        ).toBeVisible();
      });
    }

    test.describe('Values as printed', () => {
      /** Save the reviewed import and open its result on the timeline */
      async function saveAndExpand(page: Page): Promise<Locator> {
        await continueToConfirm(page);
        await saveResults(page);
        return expandLabResult(page, '2024-01-15');
      }

      /** A timeline row by what it says to screen readers: "name: value unit, ..." */
      function savedRow(card: Locator, name: string, value: RegExp): Locator {
        return card.getByRole('row', { name: new RegExp(`^${name}: ${value.source}`) });
      }

      test('keeps the comparator of a value printed beyond what the lab can measure', async ({ page }) => {
        // Scenario: A value printed beyond what the lab can measure keeps its comparator
        await loginWithOllama(page, [
          {
            extraction: extraction([
              {
                name: 'Glucose',
                value: '< 10',
                unit: 'mg/dL',
                confidence: 0.95,
                referenceRange: { low: 70, high: 100, unit: 'mg/dL' },
              },
            ]),
          },
        ]);
        await analyzeToReview(page, track(createTextLabReportPdf()));
        await expect(reviewCell(reviewRow(page, 'Glucose'), 'Value')).toHaveText('< 10');

        const card = await saveAndExpand(page);
        await expect(savedRow(card, 'Glucose', /< 10 mg\/dL, Below reference range$/)).toBeVisible();
      });

      test('keeps the comparator when a mark or a unit follows the number', async ({ page }) => {
        // Scenario: A value beyond what the lab can measure keeps its comparator when a mark or a unit follows it
        await loginWithOllama(page, [
          {
            extraction: extraction([
              {
                name: 'Glucose',
                value: '> 200 (H)',
                unit: 'mg/dL',
                confidence: 0.95,
                referenceRange: { low: 70, high: 100, unit: 'mg/dL' },
              },
            ]),
          },
        ]);
        await analyzeToReview(page, track(createTextLabReportPdf()));
        await expect(reviewCell(reviewRow(page, 'Glucose'), 'Value')).toHaveText('> 200');

        const card = await saveAndExpand(page);
        await expect(savedRow(card, 'Glucose', /> 200 mg\/dL, Above reference range$/)).toBeVisible();
      });

      test('lets the comparator be chosen on review', async ({ page }) => {
        // Scenario: The comparator of a value can be changed on review
        await loginWithOllama(page);
        await analyzeToReview(page, track(createTextLabReportPdf()));
        const row = reviewRow(page, 'Hemoglobin');

        await row.getByRole('button', { name: 'Edit biomarker' }).click();
        const editing = editingRow(page);
        await editing.getByRole('combobox', { name: 'Comparator' }).selectOption('<');
        await editing.getByRole('button', { name: 'Save changes' }).click();
        await expect(reviewCell(row, 'Value')).toHaveText('< 14.5');
      });

      test("keeps the lab's own high or low mark", async ({ page }) => {
        // Scenario: The lab's own high or low mark is kept
        await loginWithOllama(page, [
          { extraction: extraction([{ name: 'Glucose', value: 130, unit: 'mg/dL', confidence: 0.95, flag: 'H' }]) },
        ]);
        await analyzeToReview(page, track(createTextLabReportPdf()));
        await expect(reviewRow(page, 'Glucose').getByTitle('flagged high by the lab')).toHaveText('H');

        const card = await saveAndExpand(page);
        // Said once: the mark is what gives the status here
        const row = savedRow(card, 'Glucose', /130 mg\/dL, Flagged high by the lab$/);
        await expect(row.getByTitle('flagged high by the lab')).toHaveText('H');
      });

      test("lets the lab's mark be cleared on review", async ({ page }) => {
        // Scenario: The lab's mark can be changed or cleared on review
        await loginWithOllama(page, [
          { extraction: extraction([{ name: 'Glucose', value: 90, unit: 'mg/dL', confidence: 0.95, flag: 'L' }]) },
        ]);
        await analyzeToReview(page, track(createTextLabReportPdf()));
        const row = reviewRow(page, 'Glucose');
        await expect(row.getByTitle('flagged low by the lab')).toHaveText('L');

        await row.getByRole('button', { name: 'Edit biomarker' }).click();
        await editingRow(page).getByRole('combobox', { name: "Lab's mark" }).selectOption('No mark');
        await editingRow(page).getByRole('button', { name: 'Save changes' }).click();
        await expect(row.getByTitle('flagged low by the lab')).toHaveCount(0);

        const card = await saveAndExpand(page);
        await expect(savedRow(card, 'Glucose', /90 mg\/dL, No reference range available$/)).toBeVisible();
      });

      test('reads a censored value printed with thousands and its mark', async ({ page }) => {
        // Scenario: Values printed beyond what the lab can measure are read in every common form
        await loginWithOllama(page, [
          {
            extraction: extraction([
              {
                name: 'Glucose',
                value: '> 1.000 H',
                unit: 'mg/dL',
                confidence: 0.95,
                referenceRange: { low: 70, high: 100 },
              },
            ]),
          },
        ]);
        await analyzeToReview(page, track(createTextLabReportPdf()));
        await expect(reviewCell(reviewRow(page, 'Glucose'), 'Value')).toHaveText('> 1000');
      });

      test('reads a small decimal bound as printed, and leaves a power of ten for review', async ({ page }) => {
        // Scenario: Values printed beyond what the lab can measure are read in every common form
        // Scenario: A bound that could read two ways, or is more than a number, is left for review
        await loginWithOllama(page, [
          {
            extraction: extraction([
              { name: 'Glucose', value: '< 0.005', unit: 'mg/dL', confidence: 0.95 },
              { name: 'Hemoglobin', value: '> 10^5 UFC/mL', unit: 'g/dL', confidence: 0.95 },
            ]),
          },
        ]);
        await analyzeToReview(page, track(createTextLabReportPdf()));
        await expect(reviewCell(reviewRow(page, 'Glucose'), 'Value')).toHaveText('< 0.005');
        const row = reviewRow(page, 'Hemoglobin');
        await expect(row.getByText('Printed: “> 10^5 UFC/mL”')).toBeVisible();
        // No bound read from it: the cell holds only what was printed
        await expect(reviewCell(row, 'Value')).toHaveText('Printed: “> 10^5 UFC/mL”');
      });

      test('keeps a measured number beside a word', async ({ page }) => {
        // Scenario: A measured number is never replaced by a word
        await loginWithOllama(page, [
          {
            extraction: extraction([
              { name: 'Glucose', value: 95, unit: 'mg/dL', confidence: 0.95, qualitativeValue: 'Normale' },
            ]),
          },
        ]);
        await analyzeToReview(page, track(createTextLabReportPdf()));
        await expect(reviewCell(reviewRow(page, 'Glucose'), 'Value')).toHaveText('95');
        await expect(reviewCell(reviewRow(page, 'Glucose'), 'Unit')).toHaveText('mg/dL');
      });

      test('leaves a value it cannot read for review, showing what was printed', async ({ page }) => {
        // Scenario: A value that cannot be read is left for review
        await loginWithOllama(page, [
          { extraction: extraction([{ name: 'Glucose', value: 'vedi nota', unit: 'mg/dL', confidence: 0.95 }]) },
        ]);
        await analyzeToReview(page, track(createTextLabReportPdf()));
        const row = reviewRow(page, 'Glucose');
        await expect(row.getByText('Printed: “vedi nota”')).toBeVisible();
        await expect(reviewCell(row, 'Value')).not.toContainText('0');
      });

      test("compares a range printed in another unit in the value's unit", async ({ page }) => {
        // Scenario: A reference range printed in another unit is compared in the value's unit
        await loginWithOllama(page, [
          {
            extraction: extraction([
              {
                name: 'Glucose',
                value: 90,
                unit: 'mg/dL',
                confidence: 0.95,
                referenceRange: { low: 3.9, high: 5.6, unit: 'mmol/L' },
              },
            ]),
          },
        ]);
        await analyzeToReview(page, track(createTextLabReportPdf()));

        const card = await saveAndExpand(page);
        // 90 mg/dL is within 3.9-5.6 mmol/L (about 70-101 mg/dL); compared unconverted, it would read high
        const row = savedRow(card, 'Glucose', /90 mg\/dL, Within reference range$/);
        await expect(row).toContainText(/mg\/dL$/);
      });

      test("lets a range in the value's unit follow a unit corrected on review", async ({ page }) => {
        // Scenario: A range in the value's unit follows a unit corrected on review
        await loginWithOllama(page, [
          {
            extraction: extraction([
              {
                name: 'Glucose',
                value: 150,
                unit: 'mg/dL',
                confidence: 0.95,
                // As models give it: the range unit copied from the misread value unit
                referenceRange: { low: 70, high: 100, unit: 'mg/dL' },
              },
            ]),
          },
        ]);
        await analyzeToReview(page, track(createTextLabReportPdf()));
        const row = reviewRow(page, 'Glucose');
        await row.getByRole('button', { name: 'Edit biomarker' }).click();
        await editingRow(page).getByPlaceholder('Unit', { exact: true }).fill('mmol/L');
        await editingRow(page).getByRole('button', { name: 'Save changes' }).click();
        await expect(reviewCell(row, 'Reference Range')).toHaveText('70 - 100 mmol/L');
      });

      test('compares a converted range at full precision', async ({ page }) => {
        // Scenario: A converted range is compared at full precision
        await loginWithOllama(page, [
          {
            extraction: extraction([
              {
                name: 'Calcium',
                value: 10.3,
                unit: 'mg/dL',
                confidence: 0.95,
                referenceRange: { low: 2.1, high: 2.6, unit: 'mmol/L' },
              },
            ]),
          },
        ]);
        await analyzeToReview(page, track(createTextLabReportPdf()));

        const card = await saveAndExpand(page);
        // Rounded to 8.4-10 mg/dL, 10.3 would read high
        await expect(savedRow(card, 'Calcium', /10\.3 mg\/dL, Within reference range$/)).toContainText('8.417 - 10.42 mg/dL');
      });

      for (const typed of ['1.015', '0.005']) {
        test(`keeps every decimal of ${typed}`, async ({ page }) => {
          // Scenario: Numbers keep every decimal the report printed
          await loginWithOllama(page);
          await analyzeToReview(page, track(createTextLabReportPdf()));
          const row = reviewRow(page, 'Hemoglobin');

          await row.getByRole('button', { name: 'Edit biomarker' }).click();
          const number = editingRow(page).getByPlaceholder('Value', { exact: true });
          await number.fill(typed);
          await expect(number).toHaveValue(typed);
          await editingRow(page).getByRole('button', { name: 'Save changes' }).click();
          await expect(reviewCell(row, 'Value')).toHaveText(typed);

          const card = await saveAndExpand(page);
          await expect(savedRow(card, 'Hemoglobin', new RegExp(`${typed.replace('.', '\\.')} g/dL,`))).toBeVisible();
        });
      }

      test('saves an interval as its two ends', async ({ page }) => {
        // Scenario: An interval is saved as its two ends
        await loginWithOllama(page, [
          { extraction: extraction([{ name: 'Erythrocytes', value: '5-10', unit: '/HPF', confidence: 0.95 }]) },
        ]);
        await analyzeToReview(page, track(createTextLabReportPdf()));
        const row = reviewRow(page, 'Erythrocytes');
        await changeTest(page, row, NOT_A_LOINC_TEST);

        const card = await saveAndExpand(page);
        await expect(savedRow(card, 'Erythrocytes', /5-10 \/HPF,/)).toBeVisible();
        await expect(card.getByText('7.5', { exact: true })).toHaveCount(0);
      });

      test("saves a value's method", async ({ page }) => {
        // Scenario: A value's method is saved
        await loginWithOllama(page, [
          {
            extraction: extraction([
              { name: 'Glucose', value: 95, unit: 'mg/dL', confidence: 0.95, method: 'Enzymatic' },
            ]),
          },
        ]);
        await analyzeToReview(page, track(createTextLabReportPdf()));
        await expect(reviewCell(reviewRow(page, 'Glucose'), 'Method')).toHaveText('Enzymatic');

        const card = await saveAndExpand(page);
        const row = savedRow(card, 'Glucose', /95 mg\/dL by Enzymatic,/);
        await expect(row).toBeVisible();
        await expect(row.getByText('Enzymatic', { exact: true })).toBeVisible();
      });

      test('keeps a result printed as a word as printed', async ({ page }) => {
        // Scenario: A result printed as a word is kept as printed
        await loginWithOllama(page, [
          {
            extraction: extraction([
              {
                name: 'Batteri',
                value: 0,
                qualitativeValue: 'Assenti',
                unit: 'per campo',
                specimenHint: 'urine',
                confidence: 0.95,
              },
            ]),
          },
        ]);
        await analyzeToReview(page, track(createTextLabReportPdf()));
        const row = reviewRow(page, 'Batteri');
        await expect(reviewCell(row, 'Value')).toHaveText('Assenti (0)');
        // A presence has no unit, whatever column the report printed beside it
        await expect(reviewCell(row, 'Unit')).toHaveText('');
        await changeTest(page, row, NOT_A_LOINC_TEST);

        const card = await saveAndExpand(page);
        await expect(savedRow(card, 'Batteri', /Assenti\s*,/)).toBeVisible();
      });

      test('keeps a count printed in words, never as 0 per field', async ({ page }) => {
        // Scenario: A count printed in words is never read as none (document-analysis.feature)
        await loginWithOllama(page, [
          {
            extraction: extraction([
              { name: 'Batteri', value: 0, qualitativeValue: 'Rari', unit: 'per campo', specimenHint: 'urine', confidence: 0.95 },
            ]),
          },
        ]);
        await analyzeToReview(page, track(createTextLabReportPdf()));
        const row = reviewRow(page, 'Batteri');
        await expect(reviewCell(row, 'Value')).toHaveText('Rari (1)');
        await expect(reviewCell(row, 'Unit')).toHaveText('');
      });

      test('keeps a result printed as crosses as printed', async ({ page }) => {
        // Scenario: A result printed as crosses is kept as printed
        await loginWithOllama(page, [
          {
            extraction: extraction([
              { name: 'Emoglobina', value: 2, qualitativeValue: '++', unit: '', specimenHint: 'urine', confidence: 0.9 },
            ]),
          },
        ]);
        await analyzeToReview(page, track(createTextLabReportPdf()));
        const row = reviewRow(page, 'Emoglobina');
        await expect(reviewCell(row, 'Value')).toHaveText('++ (2)');
        await changeTest(page, row, NOT_A_LOINC_TEST);

        const card = await saveAndExpand(page);
        await expect(savedRow(card, 'Emoglobina', /\+\+\s*,/)).toBeVisible();
      });

      test("saves the number typed over a word's", async ({ page }) => {
        // Scenario: A word's number changed on review is saved as the number typed
        await loginWithOllama(page, [
          {
            extraction: extraction([
              { name: 'Batteri', value: 0, qualitativeValue: 'Assenti', unit: '', specimenHint: 'urine', confidence: 0.95 },
            ]),
          },
        ]);
        await analyzeToReview(page, track(createTextLabReportPdf()));
        const row = reviewRow(page, 'Batteri');
        await changeTest(page, row, NOT_A_LOINC_TEST);

        await row.getByRole('button', { name: 'Edit biomarker' }).click();
        const editing = editingRow(page);
        await expect(editing.getByText('Assenti', { exact: true })).toBeVisible();
        await editing.getByPlaceholder('Value', { exact: true }).fill('3');
        await expect(editing.getByText('Assenti', { exact: true })).toHaveCount(0);
        await editing.getByRole('button', { name: 'Save changes' }).click();
        await expect(reviewCell(row, 'Value')).toHaveText('3');

        const card = await saveAndExpand(page);
        await expect(savedRow(card, 'Batteri', /3\s*,/)).toBeVisible();
      });
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

    test('should display specimen type column for identified values', async ({ page }) => {
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
      // The LOINC sample of each test the AI chose
      await expect(reviewCell(reviewRow(page, 'Glucose'), 'Specimen')).toHaveText('Serum/Plasma');
      await expect(reviewCell(reviewRow(page, 'Hemoglobin'), 'Specimen')).toHaveText('Whole Blood');
      // No test: no specimen type
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
      await expect(tooltip).toContainText('LOINC 2345-7: Glucose [Mass/volume] in Serum or Plasma');
      await expect(tooltip).toContainText('Blood sugar level, primary energy source for cells.');
      // The description sits on a line of its own, below LOINC's name
      await expect(tooltip).toHaveCSS('white-space', 'pre-line');
    });

    test('shows the LOINC tooltip on keyboard focus', async ({ page }) => {
      // Scenario: Keyboard users see the LOINC tooltip too
      await loginWithOllama(page);
      await analyzeToReview(page, track(createTextLabReportPdf()));

      // Reached with the keyboard: the tooltip opens on visible keyboard focus
      const name = reviewCell(reviewRow(page, 'Glucose'), 'Biomarker').getByText('Glucose');
      await name.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(name).toBeFocused();

      await expect(page.getByRole('tooltip')).toContainText('LOINC 2345-7: Glucose [Mass/volume] in Serum or Plasma');
    });

    test('a long file name never squeezes the confidence badge on a phone', async ({ page }) => {
      // Scenario: A long file name never squeezes the confidence badge
      await loginWithOllama(page);
      await page.setViewportSize({ width: 320, height: 640 });
      await analyzeToReview(page, track(createTextLabReportPdf('Referto_Laboratorio_Analisi_Cliniche_Gennaio_2024.pdf')));

      const badge = main(page).getByText(/confidence$/).first();
      await expect(badge).toBeVisible();
      const fits = await badge.evaluate((label) => label.scrollWidth <= label.clientWidth);
      expect(fits).toBe(true);

      const name = await main(page)
        .getByText('Referto_Laboratorio_Analisi_Cliniche_Gennaio_2024.pdf', { exact: true })
        .boundingBox();
      const badgeBox = await badge.boundingBox();
      expect(badgeBox!.y).toBeGreaterThanOrEqual(name!.y + name!.height);
      // Wide enough for whole syllables, not a column of letters
      expect(name!.width).toBeGreaterThan(150);
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

    test('shows a reference range with only one end as ≤ or ≥', async ({ page }) => {
      // Scenario: A reference range with only one end
      await loginWithOllama(page);
      await analyzeToReview(page, track(createTextLabReportPdf()));
      const confirmRow = () => main(page).getByRole('table').getByRole('row').filter({ hasText: 'Hemoglobin' });

      for (const [end, other, number, shown] of [
        ['High', 'Low', '17.5', '≤ 17.5 g/dL'],
        ['Low', 'High', '12', '≥ 12 g/dL'],
      ]) {
        await reviewRow(page, 'Hemoglobin').getByRole('button', { name: 'Edit biomarker' }).click();
        const editing = editingRow(page);
        await editing.getByPlaceholder(other).clear();
        await editing.getByPlaceholder(end).fill(number);
        await editing.getByRole('button', { name: 'Save changes' }).click();
        await expect(reviewCell(reviewRow(page, 'Hemoglobin'), 'Reference Range')).toHaveText(shown);

        await continueToConfirm(page);
        await expect(confirmRow()).toContainText(shown);
        await main(page).getByRole('button', { name: 'Back to Review' }).click();
      }
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
    await expectAnalysisFinished(page);
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
