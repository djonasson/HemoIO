/**
 * E2E Tests for Document Analysis
 *
 * Implements features/document-analysis.feature:
 * - File type detection and upload handling
 * - Text extraction (pdf.js for text PDFs, Tesseract OCR for images)
 * - AI extraction results (AI is a mocked local Ollama server)
 * - Error handling for corrupt/empty files and AI failures
 * - Batch processing and progress
 *
 * Documents are generated for real, so the app's own extraction pipeline
 * runs; the AI mock records the text it receives.
 */

import { test, expect } from '@playwright/test';
import { DEFAULT_EXTRACTION } from './steps/ai.steps';
import { createTextLabReportPdf } from './steps/aiModelSelection.steps';
import { expandLabResult, goToTimeline, labResultCard } from './steps/timeline.steps';
import { removeTempFile, writeTempFile } from './steps/tempFiles';
import { changeTest, NOT_A_LOINC_TEST } from './steps/identification.steps';
import {
  createScannedPdf,
  createTextImage,
  createTextPdf,
  expectStageShown,
  extraction,
  LAB_REPORT_LINES,
  recordRenderedTexts,
  renderedTexts,
} from './steps/documentAnalysis.steps';
import {
  analysisItem,
  analyzeButton,
  analyzeToReview,
  continueToConfirm,
  expectAnalysisFinished,
  goToImport,
  loginWithOllama,
  main,
  reviewCell,
  reviewRow,
  saveResults,
  startAnalysis,
  tabToUploadArea,
  chooseFileWithPicker,
  uploadFiles,
} from './steps/importWizard.steps';

/**
 * Create a minimal PNG image file for testing
 */
function createMockPngImage(filename: string = 'test-image.png'): string {
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  return writeTempFile(filename, Buffer.from(pngBase64, 'base64'));
}

/**
 * Create a minimal JPEG image file for testing
 */
function createMockJpegImage(filename: string = 'test-image.jpg'): string {
  // Minimal valid JPEG (1x1 pixel)
  const jpegHex = 'ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffdb0043010909090c0b0c180d0d1832211c213232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232323232ffc00011080001000103012200021101031101ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffc4001f0100030101010101010101010000000000000102030405060708090a0bffc400b51100020102040403040705040400010277000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2f3f4f5f6f7f8f9faffda000c03010002110311003f00fbff00ffd9';
  return writeTempFile(filename, Buffer.from(jpegHex, 'hex'));
}

/**
 * Create a corrupt PDF: a .pdf file whose content is not a PDF
 */
function createCorruptFile(filename: string = 'corrupt.pdf'): string {
  return writeTempFile(filename, 'This is not a valid PDF file content!');
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

/** Lines of a lab report spread over pages, numbered so order is checkable */
function reportPages(pageCount: number): string[][] {
  return Array.from({ length: pageCount }, (_, i) => [
    `Test Laboratory - Report page ${i + 1} of ${pageCount}`,
    `Section ${i + 1} Glucose 9${i} mg/dL reference 70-100`,
    `Section ${i + 1} Hemoglobin 14.${i} g/dL reference 13.5-17.5`,
  ]);
}

/** Text with runs of whitespace collapsed, as the AI prompt is compared */
function squash(text: string): string {
  return text.replace(/\s+/g, ' ');
}

test.describe('Document Analysis', () => {
  test.describe('File Type Detection', () => {
    test.beforeEach(async ({ page }) => {
      await loginWithOllama(page);
      await goToImport(page);
    });

    test('should accept PNG image files', async ({ page }) => {
      await uploadFiles(page, track(createMockPngImage()));
      await expect(main(page).getByText('test-image.png')).toBeVisible();
      await expect(main(page).getByRole('img', { name: 'test-image.png' })).toBeVisible();
    });

    test('should accept JPEG image files', async ({ page }) => {
      await uploadFiles(page, track(createMockJpegImage()));
      await expect(main(page).getByText('test-image.jpg')).toBeVisible();
      await expect(main(page).getByRole('img', { name: 'test-image.jpg' })).toBeVisible();
    });

    test('should accept PDF files', async ({ page }) => {
      await uploadFiles(page, track(createTextLabReportPdf()));
      await expect(main(page).getByText('lab-report.pdf')).toBeVisible();
      await expect(analyzeButton(page)).toHaveText('Analyze (1)');
    });

    test('should show supported formats message', async ({ page }) => {
      await expect(main(page).getByText('Supported formats: PDF, JPEG, PNG, WebP, GIF')).toBeVisible();
    });

    test('should show file size limit', async ({ page }) => {
      await expect(main(page).getByText('Maximum file size: 50MB')).toBeVisible();
    });
  });

  test.describe('Multiple File Upload', () => {
    test.beforeEach(async ({ page }) => {
      await loginWithOllama(page);
      await goToImport(page);
    });

    test('should accept multiple files at once', async ({ page }) => {
      await uploadFiles(page, [
        track(createMockPngImage('multi-1.png')),
        track(createMockJpegImage('multi-2.jpg')),
      ]);

      await expect(main(page).getByText('Selected Files (2)')).toBeVisible();
      await expect(main(page).getByText('multi-1.png')).toBeVisible();
      await expect(main(page).getByText('multi-2.jpg')).toBeVisible();
    });

    test('should show file count in analyze button', async ({ page }) => {
      await uploadFiles(page, track(createMockPngImage('count-test.png')));
      await expect(analyzeButton(page)).toHaveText('Analyze (1)');
    });

    test('should update count when adding multiple files', async ({ page }) => {
      await uploadFiles(page, [
        track(createMockPngImage('add-1.png')),
        track(createMockPngImage('add-2.png')),
      ]);
      await expect(analyzeButton(page)).toHaveText('Analyze (2)');

      // Adding another file keeps the earlier ones
      await uploadFiles(page, track(createMockPngImage('add-3.png')));
      await expect(analyzeButton(page)).toHaveText('Analyze (3)');
      await expect(main(page).getByText('Selected Files (3)')).toBeVisible();
      for (const name of ['add-1.png', 'add-2.png', 'add-3.png']) {
        await expect(main(page).getByText(name)).toBeVisible();
      }
    });
  });

  test.describe('File Removal', () => {
    test.beforeEach(async ({ page }) => {
      await loginWithOllama(page);
      await goToImport(page);
    });

    test('should allow removing individual files', async ({ page }) => {
      await uploadFiles(page, [
        track(createMockPngImage('remove-test.png')),
        track(createMockPngImage('keep-test.png')),
      ]);
      await expect(main(page).getByText('remove-test.png')).toBeVisible();

      await main(page).getByRole('button', { name: 'Remove remove-test.png' }).click();

      await expect(main(page).getByText('remove-test.png')).toBeHidden();
      await expect(main(page).getByText('keep-test.png')).toBeVisible();
      await expect(analyzeButton(page)).toHaveText('Analyze (1)');
    });

    test('should hide analyze button after removing all files', async ({ page }) => {
      await uploadFiles(page, track(createMockPngImage('hide-button-test.png')));
      await expect(analyzeButton(page)).toBeVisible();

      await main(page).getByRole('button', { name: 'Remove hide-button-test.png' }).click();

      await expect(analyzeButton(page)).toBeHidden();
      await expect(main(page).getByRole('button', { name: 'Analyze', exact: true })).toBeDisabled();
    });
  });

  test.describe('Accessibility', () => {
    test.beforeEach(async ({ page }) => {
      await loginWithOllama(page);
      await goToImport(page);
    });

    test('file upload area should be accessible', async ({ page }) => {
      await expect(main(page).getByText('Drag files here or click to select')).toBeVisible();
      await expect(main(page).getByText('Supported formats: PDF, JPEG, PNG, WebP, GIF')).toBeVisible();
    });

    test('file input should be keyboard accessible', async ({ page }) => {
      const pdfPath = track(createTextLabReportPdf());

      // Select a file without the mouse
      await tabToUploadArea(page);
      await chooseFileWithPicker(page, () => page.keyboard.press('Space'), pdfPath);
      await expect(main(page).getByText('lab-report.pdf')).toBeVisible();

      // "Remove All", the file's remove button and Analyze are reachable by Tab
      await page.keyboard.press('Tab');
      await expect(main(page).getByRole('button', { name: 'Remove All' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(main(page).getByRole('button', { name: 'Remove lab-report.pdf' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(analyzeButton(page)).toBeFocused();

      await page.keyboard.press('Enter');
      await expectAnalysisFinished(page);
      await expect(page.getByRole('alert', { name: 'Analysis Complete' })).toBeVisible();
    });

    test('remove buttons should have accessible labels', async ({ page }) => {
      await uploadFiles(page, track(createMockPngImage('a11y-test.png')));
      await expect(main(page).getByRole('button', { name: 'Remove a11y-test.png' })).toBeVisible();
    });
  });
});

test.describe('Document Analysis - AI Processing', () => {
  test('should show progress indicator during PDF text extraction', async ({ page }) => {
    const ai = await loginWithOllama(page, undefined, { hold: true });
    await goToImport(page);
    await uploadFiles(page, track(createTextPdf('report.pdf', reportPages(3))));
    await recordRenderedTexts(page);
    await startAnalysis(page);

    await expect(main(page).getByText('Processing 1 file(s)...')).toBeVisible();
    await expectStageShown(page, 'Detecting document type');
    await expectStageShown(page, 'Extracting text');
    await expectStageShown(page, /^Extracting page \d\/3$/);

    ai.release();
    await expectAnalysisFinished(page);
  });

  test('should show progress indicator during OCR', async ({ page }) => {
    test.setTimeout(120000);
    const ai = await loginWithOllama(page);
    // OCR must not depend on any CDN: block every external host
    const external: string[] = [];
    await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => {
      external.push(route.request().url());
      return route.abort();
    });
    const ocrAssets: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/tesseract/')) ocrAssets.push(new URL(request.url()).pathname);
    });
    await goToImport(page);
    await uploadFiles(page, track(await createTextImage(page, 'scan.png')));
    await recordRenderedTexts(page);
    await startAnalysis(page);

    await expect(page.getByRole('alert', { name: 'Analysis Complete' })).toBeVisible({ timeout: 90000 });
    // With OCR served locally a small scan can finish within one check of the
    // page, so the stage is read from everything the page rendered
    await expectStageShown(page, /^OCR: /);
    // The text the AI received was read from the image
    expect(squash(ai.prompts[0])).toContain('Glucose 95 mg/dL');
    expect(external).toEqual([]);
    expect(ocrAssets).toEqual(
      expect.arrayContaining([
        '/tesseract/lang/eng.traineddata.gz',
        '/tesseract/lang/ita.traineddata.gz',
      ])
    );
  });

  test('should explain that OCR must be used online once when its files cannot load', async ({
    page,
  }) => {
    // Scenario: A scan before OCR has ever been used online
    test.setTimeout(60000);
    await loginWithOllama(page);
    // Offline, with nothing cached yet: the OCR files cannot be fetched
    await page.route('**/tesseract/**', (route) => route.abort('internetdisconnected'));
    await goToImport(page);
    await uploadFiles(page, track(await createTextImage(page, 'scan.png')));
    await startAnalysis(page);
    await expectAnalysisFinished(page);

    await expect(analysisItem(page, 'scan.png')).toContainText(
      'OCR could not load. Connect to the internet and try again: after its first use, OCR works offline.'
    );
    await expect(main(page).getByRole('button', { name: 'Enter values manually' })).toBeVisible();
  });

  test('should extract text from text-based PDF', async ({ page }) => {
    const ai = await loginWithOllama(page);
    await goToImport(page);
    await uploadFiles(page, track(createTextPdf('report.pdf', [LAB_REPORT_LINES])));
    await recordRenderedTexts(page);
    await startAnalysis(page);
    await expectAnalysisFinished(page);
    await expect(page.getByRole('alert', { name: 'Analysis Complete' })).toBeVisible();

    // All lines reach the AI, intact and in document order
    const prompt = squash(ai.prompts[0]);
    const positions = LAB_REPORT_LINES.map((line) => prompt.indexOf(line));
    positions.forEach((position, i) =>
      expect(position, `"${LAB_REPORT_LINES[i]}" is in the prompt`).toBeGreaterThanOrEqual(0)
    );
    expect(positions).toEqual([...positions].sort((a, b) => a - b));

    // Embedded text is used directly: no OCR
    expect((await renderedTexts(page)).filter((t) => t.startsWith('OCR:'))).toEqual([]);
  });

  test('should use OCR for scanned PDF', async ({ page }) => {
    test.setTimeout(120000);
    const ai = await loginWithOllama(page);
    await goToImport(page);
    await uploadFiles(page, track(await createScannedPdf(page, 'scanned.pdf')));
    await recordRenderedTexts(page);
    await startAnalysis(page);
    await expectAnalysisFinished(page);

    // The report's text was read from the page image and sent to the AI
    expect(ai.prompts).toHaveLength(1);
    expect(squash(ai.prompts[0])).toContain('Glucose 95 mg/dL');
    await expectStageShown(page, /^OCR: /);
  });

  test('should handle multi-page PDF', async ({ page }) => {
    const ai = await loginWithOllama(page);
    await goToImport(page);
    await uploadFiles(page, track(createTextPdf('multi-page.pdf', reportPages(3))));
    await startAnalysis(page);
    await expectAnalysisFinished(page);
    await expect(page.getByRole('alert', { name: 'Analysis Complete' })).toBeVisible();

    // Text from every page reaches the AI, pages in order
    const prompt = squash(ai.prompts[0]);
    const pageStarts = [1, 2, 3].map((n) => prompt.indexOf(`Report page ${n} of 3`));
    pageStarts.forEach((position) => expect(position).toBeGreaterThanOrEqual(0));
    expect(pageStarts).toEqual([...pageStarts].sort((a, b) => a - b));
    expect(prompt).toContain('Section 3 Hemoglobin 14.2 g/dL');
  });

  test('should show AI analysis progress', async ({ page }) => {
    // Scenario: Show which AI analyzes the report
    const ai = await loginWithOllama(page, undefined, { hold: true });
    await goToImport(page);
    await uploadFiles(page, track(createTextLabReportPdf()));
    await startAnalysis(page);

    const item = analysisItem(page, 'lab-report.pdf');
    // Names the provider and the model chosen in Settings
    await expect(item.getByText('Analyzing with Ollama llama3.2:8b')).toBeVisible();
    await expect(item.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60');
    await expect(main(page).getByText('Processing 1 file(s)...')).toBeVisible();

    ai.release();

    await expect(main(page).getByText('Processing complete')).toBeVisible();
    await expect(item.getByText(/^Analyzing with /)).toBeHidden();
  });

  test('should display extracted biomarker values', async ({ page }) => {
    await loginWithOllama(page, [
      {
        extraction: extraction([
          {
            name: 'Glucose',
            value: 95,
            unit: 'mg/dL',
            confidence: 0.95,
            referenceRange: { low: 70, high: 100, unit: 'mg/dL' },
          },
          {
            name: 'Hemoglobin',
            value: 14.5,
            unit: 'g/dL',
            confidence: 0.9,
            referenceRange: { low: 13.5, high: 17.5, unit: 'g/dL' },
          },
        ]),
      },
    ]);
    await analyzeToReview(page, track(createTextLabReportPdf()));

    const glucose = reviewRow(page, 'Glucose');
    await expect(reviewCell(glucose, 'Value')).toHaveText('95');
    await expect(reviewCell(glucose, 'Unit')).toHaveText('mg/dL');
    await expect(reviewCell(glucose, 'Reference Range')).toHaveText('70 - 100 mg/dL');

    const hemoglobin = reviewRow(page, 'Hemoglobin');
    await expect(reviewCell(hemoglobin, 'Value')).toHaveText('14.5');
    await expect(reviewCell(hemoglobin, 'Unit')).toHaveText('g/dL');
    await expect(reviewCell(hemoglobin, 'Reference Range')).toHaveText('13.5 - 17.5 g/dL');
  });

  test('should show confidence scores for extracted values', async ({ page }) => {
    await loginWithOllama(page, [
      {
        extraction: extraction([
          { name: 'Glucose', value: 95, unit: 'mg/dL', confidence: 0.95 },
          // An ambiguous reading the AI is unsure about
          { name: 'Hemoglobin', value: 14.5, unit: 'g/dL', confidence: 0.55 },
        ]),
      },
    ]);
    await analyzeToReview(page, track(createTextLabReportPdf()));

    await expect(reviewCell(reviewRow(page, 'Glucose'), 'Confidence')).toHaveText('95%');
    await expect(reviewCell(reviewRow(page, 'Hemoglobin'), 'Confidence')).toHaveText('55%');
    // Lower confidence values are called out for verification
    await expect(main(page).getByText('1 low confidence')).toBeVisible();
  });

  test('should extract lab date from document', async ({ page }) => {
    // The AI returns the date as written in the report
    const ai = await loginWithOllama(page, [
      { extraction: extraction(DEFAULT_EXTRACTION.biomarkers, { labDate: '15.01.2024' }) },
    ]);
    await analyzeToReview(page, track(createTextPdf('report.pdf', [LAB_REPORT_LINES])));
    expect(squash(ai.prompts[0])).toContain('Collection date: 15.01.2024');

    // The date picker shows it as a calendar date
    await expect(main(page).getByRole('textbox', { name: 'Lab Date' })).toHaveValue('2024-01-15');

    // Saved under the normalized calendar date
    await continueToConfirm(page);
    await saveResults(page);
    await goToTimeline(page);
    await expect(labResultCard(page, '2024-01-15')).toBeVisible();
  });

  test('should extract lab name from document', async ({ page }) => {
    await loginWithOllama(page, [
      {
        extraction: extraction(DEFAULT_EXTRACTION.biomarkers, {
          labName: 'St. Mary Hospital Laboratory',
        }),
      },
    ]);
    await analyzeToReview(page, track(createTextLabReportPdf()));

    await expect(main(page).getByRole('textbox', { name: 'Lab Name' })).toHaveValue(
      'St. Mary Hospital Laboratory'
    );

    await continueToConfirm(page);
    await expect(main(page).getByText('Lab(s)', { exact: true }).locator('xpath=..')).toContainText(
      'St. Mary Hospital Laboratory'
    );
  });

  test('should match extracted names to LOINC tests', async ({ page }) => {
    // Scenario: Match extracted names to LOINC tests
    await loginWithOllama(page, [
      {
        extraction: extraction([
          // The lab's sample prefix: serum
          { name: 'S-ALT', value: 25, unit: 'U/L', confidence: 0.95 },
        ]),
      },
    ]);
    await analyzeToReview(page, track(createTextLabReportPdf()));

    const alt = reviewRow(page, 'S-ALT');
    await expect(reviewCell(alt, 'Specimen')).toHaveText('Serum/Plasma');
    await reviewCell(alt, 'Biomarker').getByText('S-ALT').hover();
    await expect(page.getByRole('tooltip')).toContainText(
      'LOINC 1742-6: Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma'
    );

    // Matched, so not counted as one to identify
    await expect(main(page).getByText(/could not be identified/)).toBeHidden();
  });

  test('should flag unknown biomarkers for review', async ({ page }) => {
    // Scenario: Handle unknown biomarkers
    await loginWithOllama(page, [
      {
        extraction: extraction([{ name: 'Zorblatin', value: 42, unit: 'mg/dL', confidence: 0.9 }]),
      },
    ]);
    await analyzeToReview(page, track(createTextLabReportPdf()));

    // Flagged for review
    const notes = page.getByRole('alert', { name: 'Analysis Notes' });
    await expect(notes).toContainText(
      '1 value(s) could not be identified: choose their tests in the Saved as column'
    );
    const unknown = reviewRow(page, 'Zorblatin');
    await expect(unknown.getByText('Not identified')).toBeVisible();
    await expect(reviewCell(unknown, 'Specimen')).toHaveText('—');

    // The user chooses its test
    await changeTest(page, unknown, NOT_A_LOINC_TEST);

    await continueToConfirm(page);
    await saveResults(page);
    await goToTimeline(page);
    const card = await expandLabResult(page, '2024-01-15');
    await expect(
      card.getByRole('table', { name: 'Test values' }).getByRole('row').filter({ hasText: 'Zorblatin' })
    ).toContainText('42');
  });

  test('should normalize extracted units', async ({ page }) => {
    await loginWithOllama(page, [
      {
        extraction: extraction([
          { name: 'Glucose', value: 95, unit: 'MG/DL', confidence: 0.95 },
          { name: 'Hemoglobin', value: 14.5, unit: 'g/dl', confidence: 0.9 },
          { name: 'ALT', value: 25, unit: 'UL', confidence: 0.9 },
        ]),
      },
    ]);
    await analyzeToReview(page, track(createTextLabReportPdf()));

    await expect(reviewCell(reviewRow(page, 'Glucose'), 'Unit')).toHaveText('mg/dL');
    await expect(reviewCell(reviewRow(page, 'Hemoglobin'), 'Unit')).toHaveText('g/dL');
    await expect(reviewCell(reviewRow(page, 'ALT'), 'Unit')).toHaveText('U/L');
  });

  test('asks for results printed as words or crosses, of any test', async ({ page }) => {
    // Scenario: AI extracts results printed as words or crosses for any test
    const ai = await loginWithOllama(page);
    await analyzeToReview(page, track(createTextLabReportPdf()));

    const instructions = squash(ai.systemPrompts[0]);
    expect(instructions).toContain('QUALITATIVE VALUES (any test, not only urinalysis)');
    expect(instructions).toContain('with unit "" (empty string), the number below as value, and the result exactly as printed in qualitativeValue');
    expect(instructions).toContain('"tracce"/"traccia"/"trace"/"traces" → value: 0.5');
    expect(instructions).toContain('"+" → 1, "++" → 2, "+++" → 3, "++++" → 4');
    expect(instructions).toContain('Skip free text with no presence meaning');
  });

  test('asks for both units of a value printed in two, without a warning, and shows it once', async ({ page }) => {
    // Scenario: A value printed in two units needs no warning
    const ai = await loginWithOllama(page, [
      {
        extraction: extraction([
          { name: 'Glucose', value: 95, unit: 'mg/dL', confidence: 0.95 },
          { name: 'Glucose', value: 5.27, unit: 'mmol/L', confidence: 0.95 },
        ]),
      },
    ]);
    await analyzeToReview(page, track(createTextLabReportPdf()));

    expect(squash(ai.systemPrompts[0])).toMatch(/printed in two units.*extract both.*do not add a warning about it/);
    await expect(reviewRow(page, 'Glucose')).toHaveCount(1);
  });
});

test.describe('Document Analysis - Error Handling', () => {
  test('should show error for corrupt PDF', async ({ page }) => {
    await loginWithOllama(page);
    await goToImport(page);
    await uploadFiles(page, track(createCorruptFile()));
    await startAnalysis(page);
    await expectAnalysisFinished(page);

    await expect(analysisItem(page, 'corrupt.pdf')).toContainText(/Failed to parse PDF/);
    await expect(page.getByRole('alert', { name: 'Analysis Failed' })).toContainText(
      'Check your files and try again'
    );
    await expect(main(page).getByRole('button', { name: /^Review Results/ })).toBeDisabled();

    // Try another file
    await main(page).getByRole('button', { name: 'Back' }).click();
    await uploadFiles(page, track(createTextLabReportPdf()));
    await startAnalysis(page);
    await expectAnalysisFinished(page);
    await expect(page.getByRole('alert', { name: 'Analysis Complete' })).toBeVisible();
  });

  test('should show error for empty document', async ({ page }) => {
    const ai = await loginWithOllama(page);
    await goToImport(page);
    // A valid PDF whose only page is blank
    await uploadFiles(page, track(createTextPdf('blank.pdf', [[]])));
    await startAnalysis(page);
    await expectAnalysisFinished(page);

    await expect(analysisItem(page, 'blank.pdf')).toContainText('No readable text found in document');
    expect(ai.prompts).toHaveLength(0);

    // Manual entry is suggested
    await expect(main(page).getByText(/enter (the )?values manually|manual entry/i)).toBeVisible();
  });

  test('should show error when AI service unavailable', async ({ page }) => {
    await loginWithOllama(page, [{ abort: true }]);
    await goToImport(page);
    await uploadFiles(page, track(createTextLabReportPdf()));
    await startAnalysis(page);
    await expectAnalysisFinished(page);

    await expect(analysisItem(page, 'lab-report.pdf')).toContainText('AI analysis failed');
    await expect(page.getByRole('alert', { name: 'Analysis Failed' })).toBeVisible();
    // The user can go back and retry later
    await expect(main(page).getByRole('button', { name: 'Back' })).toBeEnabled();
  });

  test("asks again with a larger limit when the AI's answer is cut off", async ({ page }) => {
    // Scenario: The AI's answer is cut off at the length limit
    const ai = await loginWithOllama(page, [
      { cutOff: '{"biomarkers": [{"name": "Gluc' },
      { extraction: DEFAULT_EXTRACTION },
    ]);
    await analyzeToReview(page, track(createTextLabReportPdf()));

    expect(ai.prompts).toHaveLength(2);
    expect(ai.answerLimits[1]).toBeGreaterThan(ai.answerLimits[0]);
    await expect(reviewRow(page, 'Glucose')).toBeVisible();
  });

  test("says when the AI's answer is cut off also with the larger limit", async ({ page }) => {
    // Scenario: The AI's answer is cut off also with the larger limit
    await loginWithOllama(page, [{ cutOff: '{"biomarkers": [{"name": "Gluc' }]);
    await goToImport(page);
    await uploadFiles(page, track(createTextLabReportPdf()));
    await startAnalysis(page);
    await expectAnalysisFinished(page);

    await expect(analysisItem(page, 'lab-report.pdf')).toContainText(
      /cut off at HemoIO's limit of \d+ tokens.*smaller files/
    );
  });

  test('says the local AI is busy when asking again finds it busy', async ({ page }) => {
    // Scenario: Asking again with a larger limit finds the local AI busy
    await loginWithOllama(page, [
      { cutOff: '{"biomarkers": [{"name": "Gluc' },
      { status: 503, error: 'server busy, please try again' },
    ]);
    await goToImport(page);
    await uploadFiles(page, track(createTextLabReportPdf()));
    await startAnalysis(page);
    await expectAnalysisFinished(page);

    const item = analysisItem(page, 'lab-report.pdf');
    await expectAnalysisFinished(page);
    await expect(item).toContainText('AI analysis failed: Ollama API error: server busy');
    await expect(item).not.toContainText('smaller files');
  });

  test('asks at the report\'s own size when a context kept from before no longer fits', async ({ page }) => {
    // Scenario: A short report after a long one needs only its own memory
    const ai = await loginWithOllama(page, [
      { extraction: DEFAULT_EXTRACTION },
      { status: 500, error: 'model requires more system memory' },
      { extraction: DEFAULT_EXTRACTION },
    ]);
    const notes = Array.from({ length: 300 }, (_, i) => `Note ${i}: sample handled and stored as required`);
    const pages = [LAB_REPORT_LINES, ...Array.from({ length: 6 }, (_, i) => notes.slice(i * 50, i * 50 + 50))];
    await goToImport(page);
    await uploadFiles(page, [
      track(createTextPdf('long-report.pdf', pages)),
      track(createTextPdf('short-report.pdf', [LAB_REPORT_LINES])),
    ]);
    await startAnalysis(page);
    await expectAnalysisFinished(page);

    await expect(page.getByRole('alert', { name: 'Analysis Complete' })).toContainText('from 2 file(s)');
    const [long, kept, own] = ai.contexts;
    expect(kept).toBe(long);
    expect(own).toBeLessThan(long);
  });

  test('suggests splitting the report when the connection times out on the larger request', async ({ page }) => {
    // Scenario: The connection to the local AI times out when it is asked again
    await loginWithOllama(page, [
      { cutOff: '{"biomarkers": [{"name": "Gluc' },
      { status: 504, error: 'Gateway Time-out' },
    ]);
    await goToImport(page);
    await uploadFiles(page, track(createTextLabReportPdf()));
    await startAnalysis(page);
    await expectAnalysisFinished(page);

    await expect(analysisItem(page, 'lab-report.pdf')).toContainText(
      /cut off at HemoIO's limit of \d+ tokens.*Gateway Time-out.*smaller files/
    );
  });

  test("asks a report after a timed-out one with only its own room, not the long report's", async ({ page }) => {
    // Scenario: A report after the connection timed out with a long report's memory needs only its own
    const ai = await loginWithOllama(page, [
      { extraction: DEFAULT_EXTRACTION },
      { status: 504, error: 'Gateway Time-out' },
      { extraction: DEFAULT_EXTRACTION },
    ]);
    const notes = Array.from({ length: 300 }, (_, i) => `Note ${i}: sample handled and stored as required`);
    const pages = [LAB_REPORT_LINES, ...Array.from({ length: 6 }, (_, i) => notes.slice(i * 50, i * 50 + 50))];
    await goToImport(page);
    await uploadFiles(page, [
      track(createTextPdf('long-report.pdf', pages)),
      track(createTextPdf('short-report.pdf', [LAB_REPORT_LINES])),
      track(createTextPdf('next-report.pdf', [LAB_REPORT_LINES])),
    ]);
    await startAnalysis(page);
    await expectAnalysisFinished(page);

    await expect(analysisItem(page, 'short-report.pdf')).toContainText('Gateway Time-out');
    await expect(analysisItem(page, 'next-report.pdf')).not.toContainText('failed');
    const [long, kept, own] = ai.contexts;
    expect(kept).toBe(long);
    expect(own).toBeLessThan(long);
  });

  test('should allow retry after error', async ({ page }) => {
    const ai = await loginWithOllama(page, [
      { status: 503, error: 'service unavailable' },
      { extraction: DEFAULT_EXTRACTION },
    ]);
    await goToImport(page);
    await uploadFiles(page, track(createTextLabReportPdf()));
    await startAnalysis(page);
    await expectAnalysisFinished(page);
    await expect(analysisItem(page, 'lab-report.pdf')).toContainText(
      'AI analysis failed: Ollama API error: service unavailable'
    );

    await main(page).getByRole('button', { name: 'Back' }).click();
    await uploadFiles(page, track(createTextLabReportPdf()));
    await startAnalysis(page);

    await expectAnalysisFinished(page);
    await expect(page.getByRole('alert', { name: 'Analysis Complete' })).toContainText(
      'Successfully extracted 2 biomarker values from 1 file(s).'
    );
    expect(ai.prompts).toHaveLength(2);
  });

  test('should suggest manual entry after AI failure', async ({ page }) => {
    await loginWithOllama(page, [{ status: 503, error: 'service unavailable' }]);
    await goToImport(page);
    await uploadFiles(page, track(createTextLabReportPdf()));
    await startAnalysis(page);
    await expectAnalysisFinished(page);
    await expect(page.getByRole('alert', { name: 'Analysis Failed' })).toBeVisible();

    await expect(main(page).getByText(/enter (the )?values manually|manual entry/i)).toBeVisible();
  });

  test('should handle rate limiting gracefully', async ({ page }) => {
    const ai = await loginWithOllama(
      page,
      [{ status: 429, error: 'rate limit exceeded' }, { extraction: DEFAULT_EXTRACTION }],
      // Long enough that requests sent together would be counted together
      { replyDelayMs: 500 }
    );
    await goToImport(page);
    await uploadFiles(page, [
      track(createTextPdf('report-1.pdf', [LAB_REPORT_LINES])),
      track(createTextPdf('report-2.pdf', [LAB_REPORT_LINES])),
    ]);
    await recordRenderedTexts(page);
    await startAnalysis(page);
    await expectAnalysisFinished(page);

    // Progress was shown and requests were queued, never sent concurrently
    await expectStageShown(page, /^Analyzing with Ollama/);
    await expectStageShown(page, 'Waiting for the AI provider (rate limited)');
    expect(ai.maxInFlight).toBe(1);

    // The rate-limited document is not lost
    await expect(page.getByRole('alert', { name: 'Some Files Failed' })).toBeHidden();
    await expectAnalysisFinished(page);
    await expect(page.getByRole('alert', { name: 'Analysis Complete' })).toContainText(
      'Successfully extracted 4 biomarker values from 2 file(s).'
    );
  });

  test('should fail with a clear message when rate limiting does not stop', async ({ page }) => {
    // retry-after: 0 keeps the test fast; the backoff itself is unit tested
    const ai = await loginWithOllama(page, [
      { status: 429, error: 'rate limit exceeded', headers: { 'retry-after': '0' } },
    ]);
    await goToImport(page);
    await uploadFiles(page, track(createTextLabReportPdf()));
    await startAnalysis(page);
    await expectAnalysisFinished(page);

    await expect(analysisItem(page, 'lab-report.pdf')).toContainText(
      'The AI provider is rate limiting requests. Wait a minute, then try again.'
    );
    // The first request and 3 retries
    expect(ai.prompts).toHaveLength(4);
    await expect(main(page).getByRole('button', { name: 'Enter values manually' })).toBeVisible();
  });

  test('should open an empty review for manual entry', async ({ page }) => {
    await loginWithOllama(page);
    await goToImport(page);
    await uploadFiles(page, track(createTextPdf('blank.pdf', [[]])));
    await startAnalysis(page);
    await expectAnalysisFinished(page);

    await main(page).getByRole('button', { name: 'Enter values manually' }).click();

    await expect(main(page).getByText('blank.pdf')).toBeVisible();
    await expect(main(page).getByText('Entered manually')).toBeVisible();
    await expect(main(page).getByText('0 biomarker(s) from 1 file(s)')).toBeVisible();

    await main(page).getByRole('button', { name: 'Add Biomarker' }).click();
    const editing = main(page)
      .getByRole('row')
      .filter({ has: page.getByRole('button', { name: 'Save changes' }) });
    await editing.getByPlaceholder('Biomarker name').fill('Glucose');
    await editing.getByPlaceholder('Value', { exact: true }).fill('95');
    await editing.getByPlaceholder('Unit', { exact: true }).fill('mg/dL');
    await editing.getByRole('button', { name: 'Save changes' }).click();
    // Serum and blood glucose both fit the name: the user chooses
    await changeTest(page, reviewRow(page, 'Glucose'), 'Glucose [Mass/volume] in Serum or Plasma');

    // A lab date is required before continuing
    await main(page).getByRole('button', { name: 'Continue to Confirm' }).click();
    await expect(main(page).getByText('Enter the lab date for "blank.pdf"')).toBeVisible();

    await main(page).getByRole('textbox', { name: 'Lab Date' }).fill('2024-03-01');
    await continueToConfirm(page);
    await expect(main(page).getByText('2024-03-01').first()).toBeVisible();
  });
});

test.describe('Document Analysis - Performance', () => {
  test('should show per-page progress for large documents', async ({ page }) => {
    await loginWithOllama(page);
    await goToImport(page);
    await uploadFiles(page, track(createTextPdf('large.pdf', reportPages(8))));
    await recordRenderedTexts(page);
    await startAnalysis(page);
    // Eight pages are really parsed: on a busy machine that outlasts the default wait
    await expect(page.getByRole('alert', { name: 'Analysis Complete' })).toBeVisible({ timeout: 30000 });

    // Page progress counts up through the document
    const pageStages = (await renderedTexts(page))
      .map((t) => /^Extracting page (\d+)\/8$/.exec(t))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => Number(m[1]));
    expect(pageStages.length).toBeGreaterThan(1);
    expect(pageStages).toEqual([...pageStages].sort((a, b) => a - b));
  });

  test('should keep UI responsive during processing', async ({ page }) => {
    const ai = await loginWithOllama(page, undefined, { hold: true });
    await goToImport(page);
    await uploadFiles(page, track(createTextPdf('large.pdf', reportPages(8))));
    await startAnalysis(page);
    await expect(main(page).getByText('Processing 1 file(s)...')).toBeVisible();

    // The rest of the app can be used while the document is processed
    await page.getByRole('button', { name: 'Export data' }).click();
    const exportDialog = page.getByRole('dialog');
    await expect(exportDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(exportDialog).toBeHidden();

    // Processing carried on undisturbed
    await expect(main(page).getByText('Processing 1 file(s)...')).toBeVisible();
    ai.release();
    await expectAnalysisFinished(page);
    await expect(page.getByRole('alert', { name: 'Analysis Complete' })).toBeVisible();
  });

  test('should process multiple documents in batch', async ({ page }) => {
    const ai = await loginWithOllama(page, undefined, { hold: true });
    await goToImport(page);
    const names = ['batch-1.pdf', 'batch-2.pdf', 'batch-3.pdf'];
    await uploadFiles(page, names.map((name) => track(createTextPdf(name, [LAB_REPORT_LINES]))));
    await startAnalysis(page);

    // Each document is listed with its own progress
    await expect(main(page).getByText('Processing 3 file(s)...')).toBeVisible();
    for (const name of names) {
      await expect(analysisItem(page, name)).toBeVisible();
    }
    // Reading the PDFs comes first; on a busy machine Firefox takes longer than the default wait
    await expect(analysisItem(page, 'batch-1.pdf').getByText(/^Analyzing with Ollama/)).toBeVisible({
      timeout: 30000,
    });
    await expect(analysisItem(page, 'batch-1.pdf').getByRole('progressbar')).toBeVisible();

    ai.release();

    await expectAnalysisFinished(page);
    await expect(page.getByRole('alert', { name: 'Analysis Complete' })).toContainText(
      'Successfully extracted 6 biomarker values from 3 file(s).'
    );
    expect(ai.prompts).toHaveLength(3);

    await main(page).getByRole('button', { name: /^Review Results/ }).click();
    await expect(main(page).getByText('6 biomarker(s) from 3 file(s)')).toBeVisible();
  });

  test('should not block on failed documents in batch', async ({ page }) => {
    await loginWithOllama(page);
    await goToImport(page);
    await uploadFiles(page, [
      track(createTextPdf('good-1.pdf', [LAB_REPORT_LINES])),
      track(createCorruptFile('broken.pdf')),
      track(createTextPdf('good-2.pdf', [LAB_REPORT_LINES])),
    ]);
    await startAnalysis(page);
    await expectAnalysisFinished(page);

    await expect(analysisItem(page, 'broken.pdf')).toContainText(/Failed to parse PDF/);
    await expect(page.getByRole('alert', { name: 'Some Files Failed' })).toContainText(
      '1 file(s) could not be processed'
    );
    await expectAnalysisFinished(page);
    await expect(page.getByRole('alert', { name: 'Analysis Complete' })).toContainText(
      'Successfully extracted 4 biomarker values from 2 file(s).'
    );

    await main(page).getByRole('button', { name: /^Review Results/ }).click();
    await expect(main(page).getByText('4 biomarker(s) from 2 file(s)')).toBeVisible();
    await expect(main(page).getByRole('button', { name: /good-1\.pdf/ })).toBeVisible();
    await expect(main(page).getByRole('button', { name: /good-2\.pdf/ })).toBeVisible();
  });
});
