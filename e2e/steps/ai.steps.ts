/**
 * Shared steps for configuring an AI provider
 */

import { expect, type Page, type Route } from '@playwright/test';

export const MOCK_OLLAMA_MODELS = ['llama3.2:8b', 'llava:13b'];

export interface ExtractedBiomarkerFixture {
  name: string;
  value: number;
  unit: string;
  confidence: number;
  referenceRange?: { low?: number; high?: number; unit: string };
}

export const DEFAULT_EXTRACTION = {
  biomarkers: [
    {
      name: 'Glucose',
      value: 95,
      unit: 'mg/dL',
      confidence: 0.95,
      referenceRange: { low: 70, high: 100, unit: 'mg/dL' },
    },
    { name: 'Hemoglobin', value: 14.5, unit: 'g/dL', confidence: 0.9 },
  ] as ExtractedBiomarkerFixture[],
  labDate: '2024-01-15',
  labName: 'Test Laboratory',
  warnings: [] as string[],
};

export interface OllamaMock {
  /** Number of chat completion requests received */
  chatRequests: number;
}

/**
 * Mock a local Ollama server. Analysis requests return `extraction`.
 */
export async function mockOllama(
  page: Page,
  extraction: object = DEFAULT_EXTRACTION
): Promise<OllamaMock> {
  const mock: OllamaMock = { chatRequests: 0 };

  await page.route('**/localhost:11434/**', async (route: Route) => {
    const url = route.request().url();

    if (url.includes('/api/tags')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          models: MOCK_OLLAMA_MODELS.map((name) => ({ name, size: 1, digest: name })),
        }),
      });
      return;
    }

    if (url.includes('/v1/chat/completions')) {
      mock.chatRequests++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [{ message: { content: JSON.stringify(extraction) }, finish_reason: 'stop' }],
          model: MOCK_OLLAMA_MODELS[0],
        }),
      });
      return;
    }

    await route.fulfill({ status: 404, body: '{}' });
  });

  return mock;
}

/**
 * Given I have configured Ollama as my AI provider (via Settings)
 */
export async function configureOllamaProvider(page: Page): Promise<void> {
  await page.locator('nav').getByText('Settings', { exact: true }).click();
  await page.getByRole('tab', { name: /AI Configuration/i }).click();
  await page.locator('input[aria-label="Select AI provider"]').click();
  await page.getByRole('option', { name: /Ollama/i }).click();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
}
