/**
 * Reading the AI's choice of a LOINC code among candidates. Shared by all
 * providers: whatever the model answers, a code outside the candidates is
 * never accepted.
 */
import type { TestChoice, TestChoiceRequest } from './types';

/** No choice: the value stays undecided and goes to the user */
function noChoice(id: string): TestChoice {
  return { id, code: null, confident: false };
}

/** The JSON object in a model's text answer, if any */
function parseJsonObject(raw: string): unknown {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return undefined;
  try {
    return JSON.parse(match[0]);
  } catch {
    return undefined;
  }
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
