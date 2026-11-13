/**
 * Step definitions for features/import-wizard.feature
 *
 * The wizard flow: upload -> analyze -> review -> confirm.
 */

import * as fs from 'fs';
import * as path from 'path';
import { expect, type Locator, type Page } from '@playwright/test';
import { openFromMenu, setupOrUnlock } from './app.steps';
import { configureOllamaProvider, mockOllama, DEFAULT_EXTRACTION, type TestChoiceMock } from './ai.steps';
import {
  scriptOllamaChat,
  type ChatReply,
  type OllamaChatOptions,
  type OllamaChatScript,
} from './documentAnalysis.steps';

/**
 * Given I am logged into HemoIO with a (mocked) local Ollama provider, which
 * needs no API key, so the import wizard is available. Analysis requests
 * are answered by `replies`, test choice requests by `testChoice`.
 */
export async function loginWithOllama(
  page: Page,
  replies: ChatReply[] = [{ extraction: DEFAULT_EXTRACTION }],
  options: OllamaChatOptions = {},
  testChoice: TestChoiceMock = {}
): Promise<OllamaChatScript> {
  await mockOllama(page, DEFAULT_EXTRACTION, testChoice);
  const script = await scriptOllamaChat(page, replies, options);
  await page.goto('/');
  await setupOrUnlock(page);
  await configureOllamaProvider(page);
  return script;
}

/**
 * And I navigate to the Import page
 */
export async function goToImport(page: Page): Promise<void> {
  await openFromMenu(page, 'Import');
  await expect(page.getByRole('heading', { name: 'Import Lab Results' })).toBeVisible();
}

export function main(page: Page): Locator {
  return page.getByRole('main');
}

export function analyzeButton(page: Page): Locator {
  return main(page).getByRole('button', { name: /^Analyze \(\d+\)$/ });
}

/**
 * When I select files to upload
 */
export async function uploadFiles(page: Page, filePaths: string | string[]): Promise<void> {
  await main(page).locator('input[type="file"]').setInputFiles(filePaths);
}

/**
 * The status line of a file in the analysis list
 */
export function analysisItem(page: Page, fileName: string): Locator {
  return main(page).getByRole('listitem').filter({ hasText: fileName });
}

/**
 * When I click "Analyze"
 */
export async function startAnalysis(page: Page): Promise<void> {
  await analyzeButton(page).click();
  await expect(main(page).getByText('Overall Progress')).toBeVisible();
}

/**
 * Then the analysis finishes (successfully or not)
 */
export async function expectAnalysisFinished(page: Page): Promise<void> {
  await expect(main(page).getByText('Processing complete')).toBeVisible({ timeout: 60000 });
}

/**
 * Given the analysis has completed — upload, analyze and open the review step
 */
export async function analyzeToReview(page: Page, filePaths: string | string[]): Promise<void> {
  await goToImport(page);
  await uploadFiles(page, filePaths);
  await startAnalysis(page);
  await expect(page.getByRole('alert', { name: 'Analysis Complete' })).toBeVisible({ timeout: 60000 });
  await main(page).getByRole('button', { name: /^Review Results/ }).click();
  await expect(main(page).getByText('Review Extracted Values')).toBeVisible();
}

/**
 * The review table row for a biomarker
 */
export function reviewRow(page: Page, name: string | RegExp): Locator {
  return main(page)
    .getByRole('row')
    .filter({ has: page.locator('td:first-child', { hasText: name }) });
}

/**
 * Cell text of a review row, by column header
 */
const REVIEW_COLUMNS = [
  'Biomarker',
  'Saved as',
  'Specimen',
  'Value',
  'Unit',
  'Reference Range',
  'Method',
  'Confidence',
  'Actions',
] as const;

export function reviewCell(row: Locator, column: (typeof REVIEW_COLUMNS)[number]): Locator {
  return row.getByRole('cell').nth(REVIEW_COLUMNS.indexOf(column));
}

/**
 * When I continue from review to the confirm step
 */
export async function continueToConfirm(page: Page): Promise<void> {
  await main(page).getByRole('button', { name: 'Continue to Confirm' }).click();
  await expect(main(page).getByText('Values to Import')).toBeVisible();
}

/**
 * When I click "Save Results"
 */
export async function saveResults(page: Page): Promise<void> {
  await main(page).getByRole('button', { name: 'Save Results', exact: true }).click();
}

/**
 * Move keyboard focus onto the upload area using only Tab, starting from the
 * wizard's introduction text
 */
export async function tabToUploadArea(page: Page): Promise<Locator> {
  // Clicking plain text sets the sequential focus navigation starting point
  await main(page).getByText("Upload your lab report documents and we'll extract the values automatically.").click();
  await page.keyboard.press('Tab');
  const focused = page.locator(':focus');
  await expect(focused).toContainText('Drag files here or click to select');
  return focused;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

/**
 * When I choose a file in the browser's file picker, opened by `open`.
 *
 * Chromium exposes the File System Access API, which the upload area uses
 * instead of a file input; its native picker cannot be driven by Playwright,
 * so it is replaced by one that returns `filePath`. Other browsers open a
 * regular file chooser.
 */
export async function chooseFileWithPicker(
  page: Page,
  open: () => Promise<void>,
  filePath: string
): Promise<void> {
  const usesFileSystemAccessApi = await page.evaluate(() => 'showOpenFilePicker' in window);

  if (!usesFileSystemAccessApi) {
    const fileChooserPromise = page.waitForEvent('filechooser');
    await open();
    const fileChooser = await fileChooserPromise;
    expect(fileChooser.isMultiple()).toBe(true);
    await fileChooser.setFiles(filePath);
    return;
  }

  const file = {
    name: path.basename(filePath),
    type: MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? '',
    data: fs.readFileSync(filePath).toString('base64'),
  };
  await page.evaluate((file) => {
    const w = window as unknown as {
      __pickerOptions: unknown[];
      showOpenFilePicker: (options: unknown) => Promise<unknown[]>;
    };
    w.__pickerOptions = [];
    w.showOpenFilePicker = async (options: unknown) => {
      w.__pickerOptions.push(options);
      const bytes = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0));
      return [
        {
          kind: 'file',
          name: file.name,
          getFile: async () => new File([bytes], file.name, { type: file.type }),
        },
      ];
    };
  }, file);

  await open();

  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __pickerOptions: { multiple?: boolean }[] }).__pickerOptions
      )
    )
    .toEqual([expect.objectContaining({ multiple: true })]);
}

/**
 * The upload area (drop zone)
 */
export function uploadArea(page: Page): Locator {
  return main(page).locator('[tabindex="0"]', { hasText: 'Drag files here or click to select' });
}

/**
 * Format a file size the way the upload list shows it
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
