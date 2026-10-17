/**
 * Step definitions for features/ai-model-selection.feature
 *
 * The Anthropic API is fully mocked: /v1/models returns a fixed list and
 * /v1/messages records the requested model so tests can assert on it.
 */

import { expect, type Page, type Route } from '@playwright/test';
import { removeTempFile, writeTempFile } from './tempFiles';

export const TEST_PASSWORD = 'TestPassword123!';
const TEST_API_KEY = 'sk-ant-test-0000000000000000000000';

export const MOCK_MODELS = [
  { id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', created_at: '2026-09-01T00:00:00Z' },
  { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', created_at: '2026-09-01T00:00:00Z' },
];

const EXTRACTION_RESULT = {
  biomarkers: [
    {
      name: 'Glucose',
      value: 95,
      unit: 'mg/dL',
      confidence: 0.95,
      referenceRange: { low: 70, high: 100, unit: 'mg/dL' },
    },
  ],
  labDate: '2026-01-15',
  labName: 'Test Laboratory',
  warnings: [],
};

export interface AnthropicMock {
  /** Model IDs sent to /v1/messages, in request order */
  requestedModels: string[];
}

/**
 * Mock the Anthropic API. Responses start with a thinking block, as current
 * models return, so the provider must not assume content[0] is the text.
 */
export async function mockAnthropicApi(page: Page): Promise<AnthropicMock> {
  const mock: AnthropicMock = { requestedModels: [] };

  await page.route('https://api.anthropic.com/**', async (route: Route) => {
    const request = route.request();
    const url = request.url();

    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
        },
      });
      return;
    }

    const corsHeaders = { 'access-control-allow-origin': '*' };

    if (url.endsWith('/v1/models') || url.includes('/v1/models?')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify({
          data: MOCK_MODELS.map((m) => ({ ...m, type: 'model' })),
          has_more: false,
          first_id: MOCK_MODELS[0].id,
          last_id: MOCK_MODELS[MOCK_MODELS.length - 1].id,
        }),
      });
      return;
    }

    const modelLookup = url.match(/\/v1\/models\/([^/?]+)$/);
    if (modelLookup) {
      const id = decodeURIComponent(modelLookup[1]);
      const model = MOCK_MODELS.find((m) => m.id === id);
      await route.fulfill({
        status: model ? 200 : 404,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify(model ? { ...model, type: 'model' } : { error: { type: 'not_found_error' } }),
      });
      return;
    }

    if (url.endsWith('/v1/messages')) {
      const body = request.postDataJSON() as { model: string };
      mock.requestedModels.push(body.model);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: body.model,
          content: [
            { type: 'thinking', thinking: '', signature: 'sig' },
            { type: 'text', text: JSON.stringify(EXTRACTION_RESULT) },
          ],
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      });
      return;
    }

    await route.fulfill({ status: 404, headers: corsHeaders, body: '{}' });
  });

  return mock;
}

/**
 * Given I am logged into the application (fresh install)
 */
export async function completeFreshSetup(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('HemoIO');
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      })
  );
  await page.reload();

  await page.getByPlaceholder(/enter your password/i).fill(TEST_PASSWORD);
  await page.getByPlaceholder(/confirm your password/i).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Go to next step' }).click();
  await page.getByRole('button', { name: 'Go to next step' }).click();
  await page.getByRole('button', { name: 'Go to next step' }).click();
  await page.getByRole('button', { name: 'Complete setup and get started' }).click();
  await expect(page.locator('nav').getByText('Settings', { exact: true })).toBeVisible();
}

export async function unlock(page: Page): Promise<void> {
  await page.getByRole('textbox', { name: /password/i }).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /unlock/i }).click();
  await expect(page.locator('nav').getByText('Settings', { exact: true })).toBeVisible();
}

/**
 * When I open the AI Configuration tab in Settings
 */
export async function openAISettings(page: Page): Promise<void> {
  await page.locator('nav').getByText('Settings', { exact: true }).click();
  await page.getByRole('tab', { name: /AI Configuration/i }).click();
}

/**
 * And I have configured Anthropic as my AI provider with an API key
 */
export async function configureAnthropic(page: Page, apiKey: string = TEST_API_KEY): Promise<void> {
  await openAISettings(page);
  await page.locator('input[aria-label="Select AI provider"]').click();
  await page.getByRole('option', { name: /Anthropic/i }).click();
  await page.locator('input[aria-label="API key"]').fill(apiKey);
  await page.getByRole('button', { name: 'Save API Key' }).click();
  await expect(modelSelect(page)).toBeVisible();
}

export function modelSelect(page: Page) {
  return page.locator('input[aria-label="Select Anthropic model"]');
}

/**
 * Given I have selected the model "<id>" in Settings
 */
export async function selectModel(page: Page, modelId: string): Promise<void> {
  await openAISettings(page);
  await modelSelect(page).click();
  await page.getByRole('option', { name: modelId, exact: true }).click();
  await expect(modelSelect(page)).toHaveValue(modelId);
}

/**
 * Create a small text PDF that pdf.js recognises as a text (not scanned) document
 */
export function createTextLabReportPdf(): string {
  const lines = [
    'Test Laboratory - Blood Panel Report',
    'Collection date: 2026-01-15',
    'Glucose 95 mg/dL reference 70-100',
    'Hemoglobin 14.5 g/dL reference 13.5-17.5',
    'Cholesterol 180 mg/dL reference 0-200',
  ];
  const stream = [
    'BT',
    '/F1 12 Tf',
    '14 TL',
    '50 750 Td',
    ...lines.map((line) => `(${line}) '`),
    'ET',
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return writeTempFile('lab-report.pdf', pdf);
}

/**
 * When I go to Import (navigates in-app, never reloads)
 */
export async function goToImport(page: Page): Promise<void> {
  await page.locator('nav').getByText('Import', { exact: true }).click();
}

/**
 * And I analyze a lab report
 */
export async function analyzeLabReport(page: Page): Promise<void> {
  const filePath = createTextLabReportPdf();
  try {
    await goToImport(page);
    await page.locator('input[type="file"]').setInputFiles(filePath);
    await page.getByRole('button', { name: /^Analyze \(\d+\)$/ }).click();
    await expect(page.getByRole('alert', { name: 'Analysis Complete' })).toBeVisible({
      timeout: 30000,
    });
    await page.getByRole('button', { name: /^Review Results/ }).click();
    await expect(page.getByText('Glucose').first()).toBeVisible();
  } finally {
    removeTempFile(filePath);
  }
}
