/**
 * Shared steps for configuring an AI provider
 */

import { expect, type Page, type Route } from '@playwright/test';
import { openSettingsTab } from './app.steps';

export const MOCK_OLLAMA_MODELS = ['llama3.2:8b', 'llava:13b'];

export interface ExtractedBiomarkerFixture {
  name: string;
  value: number;
  unit: string;
  confidence: number;
  referenceRange?: { low?: number; high?: number; unit: string };
  /** The sample the AI reads from the report: "urine", "24h urine", "serum" */
  specimenHint?: string;
}

/** The AI's answer when asked which of the candidate tests a value is */
export interface TestChoiceFixture {
  code: string | null;
  confident: boolean;
}

/** How the mocked AI answers the test choice: by printed name; any other value gets no choice */
export interface TestChoiceMock {
  choices?: Record<string, TestChoiceFixture>;
  /** The test choice request fails, as an unreachable AI would */
  fails?: boolean;
}

/** A value the app asks the AI about, as the test choice prompt lists it */
export interface AskedValue {
  id: string;
  name: string;
  unit: string;
  candidates: { code: string; name: string }[];
}

interface ChatBody {
  messages: { role: string; content: string }[];
}

/** Whether a chat request asks which test values are, rather than to read a report */
export function isTestChoiceRequest(body: ChatBody): boolean {
  return body.messages.some(
    (m) => m.role === 'system' && m.content.startsWith('You match laboratory test names')
  );
}

/** The values a test choice request asks about */
function askedValues(body: ChatBody): AskedValue[] {
  const prompt = body.messages.find((m) => m.role === 'user')?.content ?? '';
  const start = prompt.indexOf('[');
  return start === -1 ? [] : (JSON.parse(prompt.slice(start)) as AskedValue[]);
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

/** The AI's choices for the values of DEFAULT_EXTRACTION, which several tests fit */
export const DEFAULT_TEST_CHOICES: Record<string, TestChoiceFixture> = {
  Glucose: { code: '2345-7', confident: true },
  Hemoglobin: { code: '718-7', confident: true },
};

export interface OllamaMock {
  /** Number of report analysis requests received */
  chatRequests: number;
  /** The values each test choice request asked about */
  choiceRequests: AskedValue[][];
}

/**
 * Mock a local Ollama server. Analysis requests return `extraction`; test
 * choice requests are answered from `testChoice`, over DEFAULT_TEST_CHOICES.
 */
export async function mockOllama(
  page: Page,
  extraction: object = DEFAULT_EXTRACTION,
  testChoice: TestChoiceMock = {}
): Promise<OllamaMock> {
  const mock: OllamaMock = { chatRequests: 0, choiceRequests: [] };

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

    if (url.includes('/api/chat')) {
      const body = route.request().postDataJSON() as ChatBody;
      if (isTestChoiceRequest(body)) {
        const asked = askedValues(body);
        mock.choiceRequests.push(asked);
        if (testChoice.fails) {
          await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"unavailable"}' });
          return;
        }
        const choices = asked.map(({ id, name }) => ({
          id,
          ...({ ...DEFAULT_TEST_CHOICES, ...testChoice.choices }[name] ?? { code: null, confident: false }),
        }));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            model: MOCK_OLLAMA_MODELS[0],
            message: { role: 'assistant', content: JSON.stringify({ choices }) },
            done: true,
            done_reason: 'stop',
          }),
        });
        return;
      }
      mock.chatRequests++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          model: MOCK_OLLAMA_MODELS[0],
          message: { role: 'assistant', content: JSON.stringify(extraction) },
          done: true,
          done_reason: 'stop',
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
  await openSettingsTab(page, 'AI Configuration');
  await page.locator('input[aria-label="Select AI provider"]').click();
  await page.getByRole('option', { name: /Ollama/i }).click();
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
}
