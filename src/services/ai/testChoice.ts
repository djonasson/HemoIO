/**
 * Reading the AI's choice of a LOINC code among candidates. Shared by all
 * providers: whatever the model answers, a code outside the candidates is
 * never accepted.
 */
import { createTestChoicePrompt, TEST_CHOICE_SYSTEM_PROMPT } from './prompts';
import { AI_PROVIDER_NAMES, AIAnalysisError } from './types';
import type { AIProviderType, TestChoice, TestChoiceRequest } from './types';

/** About how many tokens one value's choice takes in the answer */
const TOKENS_PER_CHOICE = 40;

/** The answer limit for choosing the tests of `count` values: room for each, never below the configured limit */
export function choiceAnswerLimit(configured: number, count: number): number {
  return Math.max(configured, count * TOKENS_PER_CHOICE);
}

/** Sends a test-choice prompt to a provider and gives back its answer: parsed JSON or the model's text */
export type SendChoicePrompt = (system: string, user: string, answerLimit: number) => Promise<unknown>;

/**
 * Choose the test of each printed value among its candidates, in one call
 * through `send`. A provider's own errors pass through; any other failure
 * becomes one of the provider's.
 */
export async function chooseTestsWith(
  provider: AIProviderType,
  configuredLimit: number,
  requests: TestChoiceRequest[],
  send: SendChoicePrompt
): Promise<TestChoice[]> {
  if (requests.length === 0) return [];
  try {
    const answer = await send(
      TEST_CHOICE_SYSTEM_PROMPT,
      createTestChoicePrompt(requests),
      choiceAnswerLimit(configuredLimit, requests.length)
    );
    // A cut-off answer keeps the choices it completed
    return parseTestChoices(answer, requests);
  } catch (error) {
    if (error instanceof AIAnalysisError) throw error;
    throw new AIAnalysisError(
      `${AI_PROVIDER_NAMES[provider]} test choice failed: ${error instanceof Error ? error.message : String(error)}`,
      provider
    );
  }
}

/** No choice: the value stays undecided and goes to the user */
function noChoice(id: string): TestChoice {
  return { id, code: null, confident: false };
}

/** A JSON value, or undefined for text that is not one */
function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * The JSON object in a model's text answer, if any. An answer cut off at
 * the length limit keeps the choices it completed: each choice is a flat
 * object of its own.
 */
function parseJsonObject(raw: string): unknown {
  const match = raw.match(/\{[\s\S]*\}/);
  const whole = match ? tryParse(match[0]) : undefined;
  if (whole !== undefined) return whole;
  const start = raw.indexOf('"choices"');
  if (start === -1) return undefined;
  const choices = (raw.slice(start).match(/\{[^{}]*\}/g) ?? []).map(tryParse).filter((c) => c !== undefined);
  return { choices };
}

/**
 * One choice per request, in request order. Choices for ids not asked about
 * are dropped; a missing or malformed choice, or a code that is not one of
 * the request's candidates, becomes "no choice".
 *
 * @param raw - The parsed answer `{ choices: [{ id, code, confident }] }`, or the model's text
 */
export function parseTestChoices(raw: unknown, requests: TestChoiceRequest[]): TestChoice[] {
  const data = typeof raw === 'string' ? parseJsonObject(raw) : raw;
  const list = data && typeof data === 'object' ? (data as { choices?: unknown }).choices : undefined;
  const answered = new Map<string, Record<string, unknown>>();
  if (Array.isArray(list)) {
    for (const item of list) {
      if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
        const entry = item as Record<string, unknown>;
        if (!answered.has(entry.id as string)) answered.set(entry.id as string, entry);
      }
    }
  }

  return requests.map((request) => {
    const entry = answered.get(request.id);
    if (!entry || typeof entry.code !== 'string') return noChoice(request.id);
    const code = entry.code.trim();
    if (!request.candidates.some((candidate) => candidate.code === code)) return noChoice(request.id);
    return { id: request.id, code, confident: entry.confident === true };
  });
}
