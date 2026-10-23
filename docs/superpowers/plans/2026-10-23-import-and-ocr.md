# Import and OCR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the import flow from the Gherkin, in five parts:
- an autocomplete for biomarker names in review
- a lab date picker
- manual entry when analysis finds nothing
- retries when the AI provider rate limits
- OCR bundled with the app in English and Italian, with no CDN

**Architecture:**
- **Retries:** one helper, `fetchWithRateLimitRetry` in `src/services/ai/`. All three providers send their analysis requests through it, and it reports waits through a new `AnalysisOptions.rateLimit` hook. The analyzer turns that hook into a progress stage.
- **Review step:** reusable pure helpers in `src/utils/biomarkerSuggestions.ts` and `src/utils/labDate.ts`, plus Mantine `Autocomplete` and `DateInput`.
- **Manual entry:** produces an empty, "entered manually" analysis result that flows through the existing review and confirm steps.
- **OCR:** the Tesseract worker, core and language data are copied into `dist/tesseract/` at build time (and served in dev) by `vite-plugin-static-copy`. Workbox precaches them, and `tesseractService` points `createWorker` at them.

**Tech Stack:** React 19, Mantine 8 (`Autocomplete`, `DateInput`), tesseract.js 7, `@tesseract.js-data/eng` and `@tesseract.js-data/ita`, `vite-plugin-static-copy`, vite-plugin-pwa (Workbox), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-gherkin-completion-design.md`, section "4. Import and OCR".

## Global Constraints

**Biomarker autocomplete**
- In review, the name field of an edited or added value is an Autocomplete over dictionary names and aliases.
- Choosing a suggestion sets the dictionary match, and with it the specimen and the unit options.
- Free text stays allowed; an unmatched name remains "unknown".

**Lab date picker**
- The lab date is a calendar date input that opens a keyboard-accessible calendar, pre-filled from the extraction.
- The E2E tests also type into the field and expect a textbox showing `2024-01-15`.
- So it is Mantine `DateInput` (typed input plus calendar dropdown) with `valueFormat="YYYY-MM-DD"`, rather than the button-only `DatePickerInput` the spec names.

**Manual entry**
- Offered when analysis yields no values: an empty document, an AI failure or a refusal.
- The analysis step offers "Enter values manually". It opens review with an empty table and the file's name as context.

**Rate limits**
- An AI request answered with HTTP 429 is retried up to 3 times, with exponential backoff (2 s, 4 s, 8 s).
- A `retry-after` header is honoured when present, capped at 60 s.
- While waiting, the file shows `Waiting for the AI provider (rate limited)`.
- After the last retry, the file fails with: `The AI provider is rate limiting requests. Wait a minute, then try again.`
- Implemented once, in a shared request helper used by all providers.

**Bundled OCR**
- The Tesseract worker, its LSTM cores (wasm) and the language data are served from the app's own origin under `tesseract/`, and precached for offline PWA use.
- No CDN requests.
- Languages: English and Italian (`eng`, `ita`). Adding a language is a change to `OCR_LANGUAGES` plus one npm data package.

**Lab dates**
- A result without a lab date cannot be continued from review. It used to be saved silently as today.
- Message: `Enter the lab date for "{file name}"`.

## Review Focus

1. **A 429 with `retry-after`**, either in seconds (`30`) or as an HTTP date, waits that long (at most 60 s), not the default backoff. An unparsable value falls back to the backoff. Pinned in Task 2.
2. **Editing the name after a dictionary match**, e.g. "Glucose" changed to "Glucose fasting", clears the match. The value is saved as an unknown biomarker, not as Glucose. Pinned in Task 5.
3. **A lab date from the AI that is not `YYYY-MM-DD`** (e.g. `15/01/2024` or `Jan 15 2024`) leaves the date field empty without crashing, and asks for the date before continuing. Pinned in Tasks 4 and 6.
4. **A non-429 error (500 or 503) is never retried**, and a request that keeps getting 429 makes exactly 4 attempts. Pinned in Task 2.
5. **Manual entry when other files succeeded** keeps those files' values and adds the empty manual result; nothing is lost. Pinned in Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `features/document-analysis.feature`, `features/import-wizard.feature` | Scenarios for retries, manual entry, bundled OCR, unknown names |
| `e2e/steps/documentAnalysis.steps.ts` | `ChatReply` gains response headers |
| `e2e/document-analysis.spec.ts`, `e2e/import-wizard.spec.ts` | E2E for the new behaviour |
| `src/services/ai/rateLimitedFetch.ts` | `fetchWithRateLimitRetry`, `retryAfterMs`, `RATE_LIMIT_MESSAGE` |
| `src/services/ai/types.ts` | `AnalysisOptions.rateLimit` |
| `src/services/ai/{Anthropic,OpenAI,Ollama}Provider.ts` | Use the helper; report the final 429 |
| `src/services/analysis/LabReportAnalyzer.ts` | Rate-limit progress stage |
| `src/components/import/AnalysisStep.tsx` | "Enter values manually" |
| `src/components/import/ReviewStep.tsx` | Autocomplete, unit options, DateInput, lab date validation, manual label |
| `src/utils/biomarkerSuggestions.ts` | Suggestion filter, unit options, applying a name |
| `src/utils/labDate.ts` | `normalizeLabDate` |
| `src/services/ocr/ocrAssets.ts` | Languages, asset paths, copy targets |
| `src/services/ocr/tesseractService.ts` | Local worker, core and language paths |
| `vite.config.ts`, `package.json` | Copy and precache the OCR assets |

---

### Task 1: Gherkin and E2E

**Files:**
- Modify: `features/document-analysis.feature`, `features/import-wizard.feature`
- Modify: `e2e/steps/documentAnalysis.steps.ts`, `e2e/document-analysis.spec.ts`

**Interfaces:**
- Produces: the `ChatReply` status variant becomes `{ status: number; error: string; headers?: Record<string, string> }`.

- [ ] **Step 1: Gherkin**

In `features/document-analysis.feature`, replace the "Handle rate limiting" scenario with:

```gherkin
  Scenario: Handle rate limiting
    Given the AI service rate limits requests
    When multiple documents are analyzed
    Then requests should be queued appropriately
    And the rate-limited file should show "Waiting for the AI provider (rate limited)"
    And the request should be retried after waiting
    And progress should be shown to the user

  Scenario: Rate limiting does not stop
    Given the AI service keeps rate limiting requests
    When a document is analyzed
    Then the request should be retried 3 times
    And the file should fail with a message to wait and try again
    And manual entry should be offered as alternative

  Scenario: Enter values manually after a failed analysis
    Given a document could not be analyzed
    When I choose "Enter values manually"
    Then I should see the review step with the file's name and no values
    And I should be able to add values and a lab date myself

  Scenario: OCR works without internet access
    Given the app's own files have loaded
    And no external servers can be reached
    When I upload a scanned lab report
    Then OCR should extract its text
    And English and Italian text should be recognized
```

In `features/import-wizard.feature`, after "User adds a missing value", add:

```gherkin
  Scenario: User enters a biomarker that is not in the dictionary
    Given I am editing a value on the review step
    When I type a biomarker name that matches no dictionary entry
    Then the name should be kept as I typed it
    And the value should be saved as an unknown biomarker

  Scenario: User must set a missing lab date
    Given a reviewed file has no lab date
    When I try to continue
    Then I should be asked to enter the lab date
```

- [ ] **Step 2: Mocked replies with headers**

In `e2e/steps/documentAnalysis.steps.ts`:
- The type: `| { status: number; error: string; headers?: Record<string, string> }`.
- In the `'status' in reply` branch of `scriptOllamaChat`, add `headers: reply.headers,` to `route.fulfill({ … })`.

- [ ] **Step 3: E2E for rate limits, manual entry and bundled OCR**

In `e2e/document-analysis.spec.ts`:

**"should handle rate limiting gracefully":** after `await expectStageShown(page, 'Analyzing with AI');`, add:

```ts
    await expectStageShown(page, 'Waiting for the AI provider (rate limited)');
```

**New tests** in the "Document Analysis - Error Handling" describe, after "should handle rate limiting gracefully". Add to the imports, if missing, `continueToConfirm` and `reviewRow` from `./steps/importWizard.steps`, and `main` wherever the spec already gets it.

```ts
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

    // A lab date is required before continuing
    await main(page).getByRole('button', { name: 'Add Biomarker' }).click();
    const editing = main(page)
      .getByRole('row')
      .filter({ has: page.getByRole('button', { name: 'Save changes' }) });
    await editing.getByPlaceholder('Biomarker name').fill('Gluc');
    await page.getByRole('option', { name: 'Glucose', exact: true }).click();
    await editing.getByPlaceholder('Value', { exact: true }).fill('95');
    await editing.getByPlaceholder('Unit', { exact: true }).fill('mg/dL');
    await editing.getByRole('button', { name: 'Save changes' }).click();
    await main(page).getByRole('button', { name: /continue/i }).click();
    await expect(main(page).getByText('Enter the lab date for "blank.pdf"')).toBeVisible();

    await main(page).getByRole('textbox', { name: 'Lab Date' }).fill('2024-03-01');
    await continueToConfirm(page);
    await expect(main(page).getByText('2024-03-01').first()).toBeVisible();
  });
```

Before writing the last two lines, read `continueToConfirm` in `e2e/steps/importWizard.steps.ts`. Use the same button name it clicks for the "Continue" check, instead of `/continue/i`, if that name is more specific.

**OCR test:** in the "Document Analysis - AI Processing" describe, extend "should show progress indicator during OCR". Insert right after `const ai = await loginWithOllama(page);`:

```ts
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
```

At the end of the test, add:

```ts
    expect(external).toEqual([]);
    expect(ocrAssets).toEqual(
      expect.arrayContaining(['/tesseract/lang/eng.traineddata.gz', '/tesseract/lang/ita.traineddata.gz'])
    );
```

The Ollama mock talks to `localhost:11434`, so the external block does not affect it.

- [ ] **Step 4: Run the import and analysis E2E to see what fails**

Run: `npx playwright test e2e/document-analysis.spec.ts e2e/import-wizard.spec.ts --project=chromium --workers=2 --reporter=line`
Expected: FAIL for these tests:
- the 3 already known in `document-analysis.spec.ts`
- the 3 already known in `import-wizard.spec.ts`
- "should fail with a clear message when rate limiting does not stop"
- "should open an empty review for manual entry"
- "should show progress indicator during OCR" (the external block catches the CDN request)
- "should handle rate limiting gracefully"

Record the failing names in the ledger.

- [ ] **Step 5: Commit**

```bash
git add features e2e
git commit -m "test(import): specify retries, manual entry and bundled OCR end to end"
```

---

### Task 2: Shared rate-limit retry helper

**Files:**
- Create: `src/services/ai/rateLimitedFetch.ts`, `src/services/ai/rateLimitedFetch.test.ts`
- Modify: `src/services/ai/index.ts` (export)

**Interfaces:**
- Produces:

  ```ts
  export const RATE_LIMIT_DELAYS_MS: readonly number[]; // [2000, 4000, 8000]
  export const MAX_RETRY_AFTER_MS: number; // 60_000
  export const RATE_LIMIT_MESSAGE: string; // 'The AI provider is rate limiting requests. Wait a minute, then try again.'
  export interface RateLimitOptions {
    onWait?: (delayMs: number, retry: number) => void;
    onResume?: () => void;
    /** For tests */
    sleep?: (ms: number) => Promise<void>;
  }
  export function retryAfterMs(header: string | null, now?: number): number | null;
  export function fetchWithRateLimitRetry(url: string, init: RequestInit, options?: RateLimitOptions): Promise<Response>;
  ```

- [ ] **Step 1: Write the failing tests**

`src/services/ai/rateLimitedFetch.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchWithRateLimitRetry,
  retryAfterMs,
  RATE_LIMIT_DELAYS_MS,
} from './rateLimitedFetch';

function reply(status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ status }), { status, headers });
}

describe('retryAfterMs', () => {
  it('reads seconds and HTTP dates, capped at a minute', () => {
    const now = Date.parse('2024-01-01T00:00:00Z');
    expect(retryAfterMs('30', now)).toBe(30_000);
    expect(retryAfterMs('0', now)).toBe(0);
    expect(retryAfterMs('Mon, 01 Jan 2024 00:00:10 GMT', now)).toBe(10_000);
    expect(retryAfterMs('3600', now)).toBe(60_000);
  });

  it('ignores missing or unreadable values', () => {
    expect(retryAfterMs(null)).toBeNull();
    expect(retryAfterMs('soon')).toBeNull();
    expect(retryAfterMs('-5')).toBeNull();
  });
});

describe('fetchWithRateLimitRetry', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const sleep = vi.fn(async () => {});

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    sleep.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retries a 429 with exponential backoff and returns the success', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(429))
      .mockResolvedValueOnce(reply(429))
      .mockResolvedValueOnce(reply(200));
    const onWait = vi.fn();
    const onResume = vi.fn();

    const response = await fetchWithRateLimitRetry('https://ai.test', {}, { sleep, onWait, onResume });

    expect(response.status).toBe(200);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([2000, 4000]);
    expect(onWait.mock.calls).toEqual([
      [2000, 1],
      [4000, 2],
    ]);
    expect(onResume).toHaveBeenCalledTimes(2);
  });

  it('honours retry-after over the backoff', async () => {
    fetchMock.mockResolvedValueOnce(reply(429, { 'retry-after': '7' })).mockResolvedValueOnce(reply(200));
    await fetchWithRateLimitRetry('https://ai.test', {}, { sleep });
    expect(sleep).toHaveBeenCalledWith(7000);
  });

  it('gives up after 3 retries and returns the last 429', async () => {
    fetchMock.mockImplementation(async () => reply(429));

    const response = await fetchWithRateLimitRetry('https://ai.test', {}, { sleep });

    expect(response.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1 + RATE_LIMIT_DELAYS_MS.length);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([2000, 4000, 8000]);
  });

  it('never retries other errors', async () => {
    fetchMock.mockResolvedValueOnce(reply(503));
    const response = await fetchWithRateLimitRetry('https://ai.test', {}, { sleep });
    expect(response.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('passes the request through unchanged', async () => {
    fetchMock.mockResolvedValueOnce(reply(200));
    const init = { method: 'POST', body: '{}' };
    await fetchWithRateLimitRetry('https://ai.test/x', init, { sleep });
    expect(fetchMock).toHaveBeenCalledWith('https://ai.test/x', init);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/services/ai/rateLimitedFetch.test.ts`
Expected: FAIL. The module does not exist.

- [ ] **Step 3: Implement**

`src/services/ai/rateLimitedFetch.ts`:

```ts
/**
 * One place for the AI providers' rate-limit handling: a request answered
 * with HTTP 429 is retried after a wait, so a busy provider delays an
 * import instead of failing it.
 */

/** Waits before the 1st, 2nd and 3rd retry */
export const RATE_LIMIT_DELAYS_MS: readonly number[] = [2000, 4000, 8000];

/** A provider's retry-after is honoured up to this long */
export const MAX_RETRY_AFTER_MS = 60_000;

export const RATE_LIMIT_MESSAGE =
  'The AI provider is rate limiting requests. Wait a minute, then try again.';

export interface RateLimitOptions {
  /** Called before waiting: how long, and which retry follows (1-based) */
  onWait?: (delayMs: number, retry: number) => void;
  /** Called when the wait is over and the request is sent again */
  onResume?: () => void;
  /** Replaces the timer, for tests */
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** A retry-after header (seconds or an HTTP date) in milliseconds, capped */
export function retryAfterMs(header: string | null, now: number = Date.now()): number | null {
  if (header === null) return null;
  const value = header.trim();
  const ms = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.min(ms, MAX_RETRY_AFTER_MS);
}

/**
 * fetch, retrying HTTP 429 up to RATE_LIMIT_DELAYS_MS.length times. Returns
 * the last response either way; callers report a final 429 themselves.
 */
export async function fetchWithRateLimitRetry(
  url: string,
  init: RequestInit,
  options: RateLimitOptions = {}
): Promise<Response> {
  const sleep = options.sleep ?? wait;
  for (let retry = 0; ; retry++) {
    const response = await fetch(url, init);
    if (response.status !== 429 || retry >= RATE_LIMIT_DELAYS_MS.length) return response;

    const delay = retryAfterMs(response.headers.get('retry-after')) ?? RATE_LIMIT_DELAYS_MS[retry];
    // Release the connection: the body of a 429 is not needed
    await response.body?.cancel().catch(() => undefined);
    options.onWait?.(delay, retry + 1);
    await sleep(delay);
    options.onResume?.();
  }
}
```

In `src/services/ai/index.ts`, add:

```ts
export {
  fetchWithRateLimitRetry,
  retryAfterMs,
  RATE_LIMIT_MESSAGE,
  RATE_LIMIT_DELAYS_MS,
  type RateLimitOptions,
} from './rateLimitedFetch';
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/services/ai/rateLimitedFetch.test.ts && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/rateLimitedFetch.ts src/services/ai/rateLimitedFetch.test.ts src/services/ai/index.ts
git commit -m "feat(ai): add a shared retry for rate-limited AI requests"
```

---

### Task 3: Providers retry on 429, and the wait is shown

**Files:**
- Modify: `src/services/ai/types.ts` (`AnalysisOptions`)
- Modify: `src/services/ai/AnthropicProvider.ts`, `OpenAIProvider.ts`, `OllamaProvider.ts`
- Modify: `src/services/analysis/LabReportAnalyzer.ts`
- Test: `src/services/ai/{Anthropic,OpenAI,Ollama}Provider.test.ts`, `src/services/analysis/LabReportAnalyzer.test.ts`

**Interfaces:**
- Consumes: `fetchWithRateLimitRetry`, `RATE_LIMIT_MESSAGE`, `RateLimitOptions` (Task 2)
- Produces:
  - `AnalysisOptions.rateLimit?: RateLimitOptions`
  - `RATE_LIMIT_STAGE = 'Waiting for the AI provider (rate limited)'`, exported from `LabReportAnalyzer.ts`

- [ ] **Step 1: Write the failing tests**

Add the same three tests to each provider test file, adapted to that file's existing setup:
- how it mocks `fetch` (`global.fetch = vi.fn()` or `vi.stubGlobal`)
- how it builds a provider (e.g. `new AnthropicProvider({ apiKey: 'test-key', model: 'claude-sonnet-5-5' })`)
- the success-response helper it already uses

For the Anthropic tests, a successful response body is the one the file already uses in its "should analyze lab report" test. Reuse it as `successBody`.

```ts
  describe('rate limiting', () => {
    const rateLimited = () =>
      new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
        status: 429,
        headers: { 'retry-after': '0' },
      });

    it('retries a rate-limited request and reports the wait', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(rateLimited())
        .mockResolvedValueOnce(new Response(JSON.stringify(successBody), { status: 200 }));
      const onWait = vi.fn();

      const result = await provider.analyzeLabReport('Glucose 95 mg/dL', { rateLimit: { onWait } });

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(onWait).toHaveBeenCalledWith(0, 1);
      expect(result.biomarkers.length).toBeGreaterThan(0);
    });

    it('fails with a clear message when the rate limit does not lift', async () => {
      vi.mocked(fetch).mockImplementation(async () => rateLimited());

      await expect(provider.analyzeLabReport('Glucose 95 mg/dL')).rejects.toThrow(
        'The AI provider is rate limiting requests. Wait a minute, then try again.'
      );
      expect(fetch).toHaveBeenCalledTimes(4);
    });

    it('does not retry other errors', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'down' } }), { status: 503 })
      );
      await expect(provider.analyzeLabReport('Glucose 95 mg/dL')).rejects.toThrow();
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });
```

For Ollama, the analysis request goes to `/v1/chat/completions`, and the provider may first call `/api/tags` to pick a model. Make the `fetch` mock route by URL, the way the file's existing analysis tests do. Count only chat-completion calls:

```ts
const chatCalls = () => vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes('/chat/completions'));
```

Then assert `chatCalls()` has length 2, 4 and 1.

In `src/services/analysis/LabReportAnalyzer.test.ts`, the provider is mocked through the factory. Following the file's existing mock of `getAIProvider` / `analyzeLabReport`, add:

```ts
  it('shows the rate-limit wait as a progress stage', async () => {
    mockAnalyzeLabReport.mockImplementationOnce(async (_text, options) => {
      options?.rateLimit?.onWait?.(2000, 1);
      options?.rateLimit?.onResume?.();
      return SUCCESSFUL_AI_RESULT;
    });
    const stages: string[] = [];

    await analyzeLabReport(textPdf, { ...baseOptions, onProgress: (stage) => stages.push(stage) });

    expect(stages).toContain('Waiting for the AI provider (rate limited)');
    expect(stages.indexOf('Analyzing with AI')).toBeLessThan(
      stages.indexOf('Waiting for the AI provider (rate limited)')
    );
    expect(stages.lastIndexOf('Analyzing with AI')).toBeGreaterThan(
      stages.indexOf('Waiting for the AI provider (rate limited)')
    );
  });
```

Use the file's existing names in place of `mockAnalyzeLabReport`, `SUCCESSFUL_AI_RESULT`, `textPdf` and `baseOptions`. Read the file first, and adapt names, not assertions.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/services/ai src/services/analysis`
Expected: FAIL. Providers make one request on 429, and their messages are the raw provider errors. The analyzer never reports the stage.

- [ ] **Step 3: Implement**

**`types.ts`:** in `AnalysisOptions`, add:

```ts
  /** Retry hooks for rate-limited requests (HTTP 429) */
  rateLimit?: RateLimitOptions;
```

Also add `import type { RateLimitOptions } from './rateLimitedFetch';`.

**`AnthropicProvider.ts`**
- Add `rateLimit?: RateLimitOptions` as a third parameter of `makeRequest`.
- Replace `const response = await fetch(url, {` with `const response = await fetchWithRateLimitRetry(url, {`, closing with `}, rateLimit);`.
- Insert before the `if (!response.ok)` block:

  ```ts
      if (response.status === 429) {
        throw new AIAnalysisError(RATE_LIMIT_MESSAGE, 'anthropic', 'rate_limited');
      }
  ```

- In `analyzeLabReport`, call `this.makeRequest(messages, ENHANCED_SYSTEM_PROMPT, options.rateLimit)`. Use the method's actual options parameter name.
- Import: `import { fetchWithRateLimitRetry, RATE_LIMIT_MESSAGE, type RateLimitOptions } from './rateLimitedFetch';`

**`OpenAIProvider.ts`:** the same changes.
- `makeRequest(messages, options: { maxTokens?: number; rateLimit?: RateLimitOptions } = {})`, passing `options.rateLimit` to the helper.
- `analyzeLabReport` calls `this.makeRequest(messages, { rateLimit: options.rateLimit })`.
- The 429 check throws `new AIAnalysisError(RATE_LIMIT_MESSAGE, 'openai', 'rate_limited')`.

**`OllamaProvider.ts`**
- `makeChatRequest(messages, model, rateLimit?: RateLimitOptions)` uses `fetchWithRateLimitRetry(url, { … , signal: controller.signal }, rateLimit)`.
- Before its `if (!response.ok)`, add `if (response.status === 429) throw new AIAnalysisError(RATE_LIMIT_MESSAGE, 'ollama', 'rate_limited');`.
- Both callers (lines 116 and 192) pass `options.rateLimit`.
- The request timeout keeps covering the whole call, waits included. An `AbortError` during a retry therefore still becomes the timeout message.

**`LabReportAnalyzer.ts`:** export `export const RATE_LIMIT_STAGE = 'Waiting for the AI provider (rate limited)';`. Then add to the options of the `provider.analyzeLabReport(extractedText, { … })` call:

```ts
      rateLimit: {
        onWait: () => options.onProgress?.(RATE_LIMIT_STAGE, 0.6),
        onResume: () => options.onProgress?.('Analyzing with AI', 0.6),
      },
```

If the analyzer also calls `provider.analyzeImage`, pass the same `rateLimit` object there. Extract it into a `const rateLimit` defined once above both calls.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/services && npx tsc -b && npx eslint src/services`
Expected: PASS, with no console output.

- [ ] **Step 5: Commit**

```bash
git add src/services
git commit -m "feat(ai): retry rate-limited analysis requests and show the wait"
```

---

### Task 4: Manual entry and the required lab date

**Files:**
- Create: `src/utils/labDate.ts`, `src/utils/labDate.test.ts`
- Modify: `src/components/import/AnalysisStep.tsx`, `src/components/import/AnalysisStep.test.tsx`
- Modify: `src/components/import/ReviewStep.tsx`, `src/components/import/ReviewStep.test.tsx`

**Interfaces:**
- Produces:
  - `AnalysisResult.manualEntry?: boolean`
  - `normalizeLabDate(value: string | null | undefined): string | null`. Returns `YYYY-MM-DD` for a valid date that starts that way, else `null`.
  - `manualEntryResult(result: AnalysisResult): AnalysisResult`, exported from `AnalysisStep.tsx`

- [ ] **Step 1: Write the failing tests**

`src/utils/labDate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeLabDate } from './labDate';

describe('normalizeLabDate', () => {
  it('keeps ISO days', () => {
    expect(normalizeLabDate('2024-01-15')).toBe('2024-01-15');
    expect(normalizeLabDate('2024-01-15T00:00:00Z')).toBe('2024-01-15');
  });

  it.each(['15/01/2024', 'Jan 15 2024', '2024-13-01', '2024-02-30', '', null, undefined])(
    'rejects %s',
    (value) => {
      expect(normalizeLabDate(value)).toBeNull();
    }
  );
});
```

Append to `src/components/import/AnalysisStep.test.tsx`, following its existing mock of `analyzeLabReport` (`vi.mocked(analyzeLabReport)`) and its render helper. The file already shows how to make an analysis reject and how to wait for "Processing complete"; reuse that.

```tsx
  it('offers manual entry for a file that could not be analyzed', async () => {
    vi.mocked(analyzeLabReport).mockRejectedValueOnce(new Error('No readable text found in document'));
    const onComplete = vi.fn();
    renderAnalysisStep({ files: [mockFile('blank.pdf')], onComplete });

    await userEvent.click(await screen.findByRole('button', { name: 'Enter values manually' }));

    expect(onComplete).toHaveBeenCalledWith([
      expect.objectContaining({ fileName: 'blank.pdf', success: true, manualEntry: true, biomarkers: [] }),
    ]);
  });

  it('keeps the files that succeeded when entering another one manually', async () => {
    vi.mocked(analyzeLabReport)
      .mockResolvedValueOnce(successfulAnalysis())
      .mockRejectedValueOnce(new Error('AI analysis failed: down'));
    const onComplete = vi.fn();
    renderAnalysisStep({ files: [mockFile('good.pdf'), mockFile('bad.pdf')], onComplete });

    await userEvent.click(await screen.findByRole('button', { name: 'Enter values manually' }));

    expect(onComplete.mock.calls[0][0].map((r: { fileName: string }) => r.fileName)).toEqual([
      'good.pdf',
      'bad.pdf',
    ]);
  });

  it('offers manual entry when the analysis found no values', async () => {
    vi.mocked(analyzeLabReport).mockResolvedValueOnce({ ...successfulAnalysis(), matchedBiomarkers: [] });
    renderAnalysisStep({ files: [mockFile('empty.pdf')] });
    expect(await screen.findByRole('button', { name: 'Enter values manually' })).toBeInTheDocument();
  });
```

The helpers `renderAnalysisStep`, `mockFile` and `successfulAnalysis` stand for the file's existing ones (it renders `AnalysisStep` with `files`, `aiProvider: 'ollama'`, `getApiKey`, `onComplete`, `onBack`). Create a small local helper only if the file has none.

Append to `src/components/import/ReviewStep.test.tsx`, using its existing fixture for a reviewed result:

```tsx
  it('asks for a lab date before continuing when a file has none', async () => {
    const onComplete = vi.fn();
    renderReviewStep({
      reviewedResults: [{ ...reviewedResultFixture(), fileName: 'scan.pdf', labDate: undefined, editedLabDate: undefined }],
      onComplete,
    });

    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(screen.getByText('Enter the lab date for "scan.pdf"')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('labels a manual entry instead of showing a confidence', () => {
    renderReviewStep({
      reviewedResults: [{ ...reviewedResultFixture(), manualEntry: true, editedBiomarkers: [], biomarkers: [] }],
    });
    expect(screen.getByText('Entered manually')).toBeInTheDocument();
    expect(screen.queryByText(/confidence$/)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/utils/labDate.test.ts src/components/import`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/utils/labDate.ts`:

```ts
/**
 * Lab dates are calendar days, written YYYY-MM-DD. The AI usually returns
 * that form, but not always; anything else is treated as "no date" so the
 * user is asked for it instead of a wrong day being saved.
 */
export function normalizeLabDate(value: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value?.trim() ?? '');
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  const real = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return real ? `${match[1]}-${match[2]}-${match[3]}` : null;
}
```

**`AnalysisStep.tsx`**
- Add `manualEntry?: boolean` to `AnalysisResult`, documented as `/** Values are typed in by the user, not extracted */`.
- Export:

  ```tsx
  /** An empty result for a file whose values the user will type in */
  export function manualEntryResult(result: AnalysisResult): AnalysisResult {
    return {
      ...result,
      success: true,
      error: undefined,
      biomarkers: [],
      confidence: 1,
      warnings: [],
      duplicateConflicts: undefined,
      manualEntry: true,
    };
  }
  ```

- In the component:

  ```tsx
    const enterManually = useCallback(
      (fileId: string) => {
        const next = results
          .map((r) => (r.fileId === fileId ? manualEntryResult(r) : r))
          .filter((r) => r.success);
        onComplete(next);
      },
      [results, onComplete]
    );
  ```

- In the file list, after the error `<Text>` and inside the same `<div>`, add the button for finished files that failed or found nothing:

  ```tsx
                {!isProcessing &&
                  results.find(
                    (r) => r?.fileId === file.id && (!r.success || r.biomarkers.length === 0)
                  ) && (
                    <Button
                      size="compact-xs"
                      variant="light"
                      mt={4}
                      onClick={() => enterManually(file.id)}
                    >
                      Enter values manually
                    </Button>
                  )}
  ```

- Change the "Analysis Failed" alert text to `No files could be processed. Check your files and try again, or type the values in yourself.` The E2E regex must match only the button.

**`ReviewStep.tsx`**
- In the Accordion control, show `<Badge color="gray" variant="light">Entered manually</Badge>` when `result.manualEntry`, and the confidence badge otherwise.
- In `handleContinue`, before the biomarker checks:

  ```tsx
      const missingDates = reviewedResults
        .filter((r) => !normalizeLabDate(r.editedLabDate ?? r.labDate))
        .map((r) => `Enter the lab date for "${r.fileName}"`);
  ```

  Then merge them into the error: `const problems = [...missingDates, ...invalidBiomarkers];`. Use `problems` where the code used `invalidBiomarkers` to build `validationError`.
- Make sure the validation `Alert` renders each problem line as its own text element, so `getByText('Enter the lab date for "scan.pdf"')` matches exactly. If it renders the joined string inside one `<Text>`, change it to map the lines, e.g. `{validationError.split('\n').map((line) => <Text key={line} size="sm">{line}</Text>)}`.
- Import `normalizeLabDate` from `@/utils/labDate`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/utils src/components/import && npx tsc -b`
Expected: PASS. If an existing ReviewStep test continued with a fixture lacking a lab date, give the fixture `labDate: '2024-01-15'` and ledger it. That test's expectation stands; it just never had a date.

- [ ] **Step 5: Commit**

```bash
git add src/utils/labDate.ts src/utils/labDate.test.ts src/components/import
git commit -m "feat(import): offer manual entry and require a lab date before saving"
```

---

### Task 5: Biomarker name autocomplete and unit options

**Files:**
- Create: `src/utils/biomarkerSuggestions.ts`, `src/utils/biomarkerSuggestions.test.ts`
- Modify: `src/components/import/ReviewStep.tsx`, `src/components/import/ReviewStep.test.tsx`

**Interfaces:**
- Produces:

  ```ts
  suggestBiomarkerNames(search: string, limit?: number): string[] // dictionary names; name matches before alias matches
  unitOptionsFor(name: string): string[] // the matched biomarker's canonical and alternative units, or []
  applyBiomarkerName<T extends MatchedBiomarker>(biomarker: T, name: string): T
  ```

- [ ] **Step 1: Write the failing tests**

`src/utils/biomarkerSuggestions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyBiomarkerName, suggestBiomarkerNames, unitOptionsFor } from './biomarkerSuggestions';
import { findBiomarker } from '@data/biomarkers/dictionary';
import type { MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';

const base: MatchedBiomarker = {
  name: 'Glucose',
  value: 95,
  unit: 'mg/dL',
  confidence: 0.9,
  isExactMatch: true,
  normalizedUnit: 'mg/dL',
  dictionaryMatch: findBiomarker('Glucose'),
};

describe('suggestBiomarkerNames', () => {
  it('suggests names that contain the text, names first', () => {
    const names = suggestBiomarkerNames('cholest');
    expect(names).toContain('Total Cholesterol');
    expect(names.every((n) => typeof n === 'string')).toBe(true);
  });

  it('finds a biomarker by its alias, e.g. Italian names', () => {
    expect(suggestBiomarkerNames('Globuli Bianchi')).toContain('White Blood Cell Count');
  });

  it('suggests nothing for empty text and limits the list', () => {
    expect(suggestBiomarkerNames('  ')).toEqual([]);
    expect(suggestBiomarkerNames('e', 5)).toHaveLength(5);
  });
});

describe('unitOptionsFor', () => {
  it('lists the dictionary units of a known biomarker', () => {
    const def = findBiomarker('Glucose')!;
    expect(unitOptionsFor('Glucose')).toEqual(
      [...new Set([def.canonicalUnit, ...def.alternativeUnits].filter(Boolean))]
    );
    expect(unitOptionsFor('Not a biomarker')).toEqual([]);
  });
});

describe('applyBiomarkerName', () => {
  it('matches a dictionary name and fills an empty unit', () => {
    const next = applyBiomarkerName({ ...base, name: '', unit: '', dictionaryMatch: undefined }, 'Hematocrit');
    expect(next.dictionaryMatch?.name).toBe('Hematocrit');
    expect(next.isExactMatch).toBe(true);
    expect(next.unit).toBe(findBiomarker('Hematocrit')!.canonicalUnit);
  });

  it('keeps a unit the user already typed', () => {
    expect(applyBiomarkerName({ ...base, unit: 'mmol/L' }, 'Glucose').unit).toBe('mmol/L');
  });

  it('clears the match when the name no longer matches the dictionary', () => {
    const next = applyBiomarkerName(base, 'Glucose fasting');
    expect(next.name).toBe('Glucose fasting');
    expect(next.dictionaryMatch).toBeUndefined();
    expect(next.isExactMatch).toBe(false);
  });
});
```

If `Hematocrit`'s canonical unit is empty in the dictionary, pick another biomarker with a non-empty unit for that test. Don't weaken the assertion.

Append to `ReviewStep.test.tsx`:

```tsx
  it('suggests dictionary biomarkers while editing a name', async () => {
    renderReviewStep();
    await userEvent.click(screen.getAllByRole('button', { name: 'Edit biomarker' })[0]);
    const name = screen.getByPlaceholderText('Biomarker name');

    await userEvent.clear(name);
    await userEvent.type(name, 'Hemato');

    expect(await screen.findByRole('option', { name: 'Hematocrit' })).toBeInTheDocument();
  });

  it('forgets the dictionary match when the name is changed to free text', async () => {
    const onReviewChange = vi.fn();
    renderReviewStep({ onReviewChange });
    await userEvent.click(screen.getAllByRole('button', { name: 'Edit biomarker' })[0]);
    const name = screen.getByPlaceholderText('Biomarker name');

    await userEvent.clear(name);
    await userEvent.type(name, 'X');

    const last = onReviewChange.mock.calls.at(-1)?.[0];
    expect(last[0].editedBiomarkers[0].dictionaryMatch).toBeUndefined();
  });
```

`renderReviewStep` stands for the file's render helper. `ReviewStep` is controlled (`reviewedResults` and `onReviewChange`), so with a plain `vi.fn()` the input does not update between keystrokes. That is why the second test types one character. Wrap the first test in a stateful harness, as the file's other typing tests do. If it has none, add:

```tsx
function StatefulReview(props: Partial<ReviewStepProps>) {
  const [reviewed, setReviewed] = useState(props.reviewedResults ?? [reviewedResultFixture()]);
  return (
    <ReviewStep
      results={[]}
      reviewedResults={reviewed}
      onReviewChange={setReviewed}
      onComplete={vi.fn()}
      onBack={vi.fn()}
      {...props}
    />
  );
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/utils/biomarkerSuggestions.test.ts src/components/import/ReviewStep.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/utils/biomarkerSuggestions.ts`:

```ts
/**
 * Dictionary suggestions for typing a biomarker name in review
 */
import { findBiomarker, searchBiomarkers } from '@data/biomarkers/dictionary';
import type { MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';

/** Dictionary names containing the text, by name first, then by alias */
export function suggestBiomarkerNames(search: string, limit = 10): string[] {
  const term = search.trim().toLowerCase();
  if (!term) return [];
  const matches = searchBiomarkers(term);
  const byName = matches.filter((b) => b.name.toLowerCase().includes(term));
  const byAlias = matches.filter((b) => !b.name.toLowerCase().includes(term));
  return [...byName, ...byAlias].slice(0, limit).map((b) => b.name);
}

/** Units the dictionary knows for a biomarker name or alias */
export function unitOptionsFor(name: string): string[] {
  const definition = findBiomarker(name);
  if (!definition) return [];
  return [...new Set([definition.canonicalUnit, ...definition.alternativeUnits].filter(Boolean))];
}

/**
 * Rename a value: the dictionary match follows the name, so free text is
 * saved as an unknown biomarker rather than under its previous match
 */
export function applyBiomarkerName<T extends MatchedBiomarker>(biomarker: T, name: string): T {
  const match = findBiomarker(name);
  return {
    ...biomarker,
    name,
    dictionaryMatch: match,
    isExactMatch: match !== undefined,
    unit: biomarker.unit || match?.canonicalUnit || '',
  };
}
```

In `ReviewStep.tsx`:
- Add `Autocomplete` to the `@mantine/core` import.
- Add a replace-style updater next to `updateBiomarker`:

  ```tsx
    const renameBiomarker = useCallback(
      (resultIndex: number, biomarkerIndex: number, name: string) => {
        const newResults = [...reviewedResults];
        newResults[resultIndex] = {
          ...newResults[resultIndex],
          editedBiomarkers: newResults[resultIndex].editedBiomarkers.map((b, i) =>
            i === biomarkerIndex ? applyBiomarkerName(b, name) : b
          ),
        };
        onReviewChange(newResults);
      },
      [reviewedResults, onReviewChange]
    );
  ```

- Replace the editing name `<TextInput … placeholder="Biomarker name" />` with:

  ```tsx
                              <Autocomplete
                                size="xs"
                                value={biomarker.name}
                                onChange={(name) => renameBiomarker(resultIndex, bioIndex, name)}
                                data={BIOMARKER_NAMES}
                                // Searches names and aliases; options are dictionary names
                                filter={({ search }) =>
                                  suggestBiomarkerNames(search).map((value) => ({ value, label: value }))
                                }
                                placeholder="Biomarker name"
                                aria-label="Biomarker name"
                              />
  ```

  Define `BIOMARKER_NAMES` at module level: `const BIOMARKER_NAMES = BIOMARKER_DEFINITIONS.map((b) => b.name);` (import `BIOMARKER_DEFINITIONS` beside `findBiomarker`).

- Replace the editing unit `<TextInput … placeholder="Unit" />` with an `Autocomplete`. Keep its existing `value` and `onChange` semantics (`onChange={(unit) => updateBiomarker(resultIndex, bioIndex, { unit })}`), add `data={unitOptionsFor(biomarker.name)}`, and keep `placeholder="Unit"` and `size="xs"`.
- Import `applyBiomarkerName`, `suggestBiomarkerNames` and `unitOptionsFor` from `@/utils/biomarkerSuggestions`.

Free text stays possible: Autocomplete accepts any typed value, and `applyBiomarkerName` drops the match.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/utils src/components/import && npx tsc -b && npx eslint src/utils src/components/import`
Expected: PASS, with no console output.

- [ ] **Step 5: Commit**

```bash
git add src/utils/biomarkerSuggestions.ts src/utils/biomarkerSuggestions.test.ts src/components/import
git commit -m "feat(import): suggest dictionary biomarkers and units while reviewing"
```

---

### Task 6: Lab date picker

**Files:**
- Modify: `src/components/import/ReviewStep.tsx`, `src/components/import/ReviewStep.test.tsx`

**Interfaces:**
- Consumes: `normalizeLabDate` (Task 4)

- [ ] **Step 1: Write the failing tests**

Append to `ReviewStep.test.tsx`. Wrap renders in `DatesProvider` only if `DateInput` requires it; Mantine works without one.

```tsx
  it('picks the lab date from a calendar that opens on the detected month', async () => {
    render(<MantineProvider env="test"><StatefulReview reviewedResults={[{ ...reviewedResultFixture(), labDate: '2024-01-15' }]} /></MantineProvider>);
    const labDate = screen.getByRole('textbox', { name: 'Lab Date' });
    expect(labDate).toHaveValue('2024-01-15');

    await userEvent.click(labDate);
    await userEvent.click(await screen.findByRole('button', { name: '20 January 2024' }));

    expect(labDate).toHaveValue('2024-01-20');
  });

  it('accepts a typed lab date', async () => {
    render(<MantineProvider env="test"><StatefulReview reviewedResults={[{ ...reviewedResultFixture(), labDate: '2024-01-15' }]} /></MantineProvider>);
    const labDate = screen.getByRole('textbox', { name: 'Lab Date' });

    await userEvent.clear(labDate);
    await userEvent.type(labDate, '2024-01-16');
    await userEvent.tab();

    expect(labDate).toHaveValue('2024-01-16');
  });

  it('leaves the field empty for a lab date it cannot read', () => {
    render(<MantineProvider env="test"><StatefulReview reviewedResults={[{ ...reviewedResultFixture(), labDate: '15/01/2024' }]} /></MantineProvider>);
    expect(screen.getByRole('textbox', { name: 'Lab Date' })).toHaveValue('');
  });
```

Use the file's own render wrapper in place of `render(<MantineProvider …>)` if it has one.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/import/ReviewStep.test.tsx`
Expected: FAIL. There is no calendar, and the unreadable date is shown as typed.

- [ ] **Step 3: Implement**

Replace the Lab Date `TextInput` with Mantine's `DateInput` (import from `@mantine/dates`):

```tsx
                  <DateInput
                    label="Lab Date"
                    leftSection={<IconCalendar size={16} />}
                    placeholder="YYYY-MM-DD"
                    valueFormat="YYYY-MM-DD"
                    // Typed dates use the same YYYY-MM-DD form
                    dateParser={(input) => normalizeLabDate(input)}
                    value={normalizeLabDate(result.editedLabDate ?? result.labDate)}
                    onChange={(value) => updateLabDate(resultIndex, normalizeLabDate(value) ?? undefined)}
                    clearable
                  />
```

`value` and `onChange` use Mantine 8's `YYYY-MM-DD` strings. If the installed version passes `Date` objects instead, convert with `dayjs(value).format('YYYY-MM-DD')` (dayjs is a Mantine dates dependency) and ledger it.

The calendar dropdown's role must be `dialog` and its day buttons named `D MMMM YYYY`, as the E2E test expects. If Mantine's `DateInput` dropdown lacks `role="dialog"`, pass `popoverProps={{ ... }}` or wrap per the Mantine docs, and ledger what you did.

Also make sure `@mantine/dates/styles.css` is imported once in the app. Trends already uses date pickers, so check `src/main.tsx` or `src/App.tsx` before adding it.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/import && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/import
git commit -m "feat(import): choose the lab date from a calendar"
```

---

### Task 7: Bundled OCR (English and Italian)

**Files:**
- Modify: `package.json` / `package-lock.json` (add `@tesseract.js-data/eng`, `@tesseract.js-data/ita`, dev `vite-plugin-static-copy`)
- Create: `src/services/ocr/ocrAssets.ts`, `src/services/ocr/ocrAssets.test.ts`
- Modify: `src/services/ocr/tesseractService.ts`, `src/services/ocr/tesseractService.test.ts`
- Modify: `vite.config.ts`

**Interfaces:**
- Produces:

  ```ts
  export const OCR_LANGUAGES: readonly string[]; // ['eng', 'ita']
  export const OCR_ASSET_DIR = 'tesseract';
  export const OCR_CORE_FILES: readonly string[]; // the three LSTM .wasm.js cores
  export function ocrAssetUrls(origin: string, base: string): { workerPath: string; corePath: string; langPath: string };
  export function ocrCopyTargets(): Array<{ src: string; dest: string }>; // for vite-plugin-static-copy
  ```

- [ ] **Step 1: Install the packages**

```bash
npm install @tesseract.js-data/eng@1.0.0 @tesseract.js-data/ita@1.0.0
npm install --save-dev vite-plugin-static-copy@4.1.1
ls node_modules/@tesseract.js-data/eng/4.0.0_best_int/ node_modules/@tesseract.js-data/ita/4.0.0_best_int/
du -h node_modules/@tesseract.js-data/*/4.0.0_best_int/*.gz
```

Expected: each directory holds `<lang>.traineddata.gz`. Note the largest file size; Step 4 needs it.

If `npm install` reports a peer conflict between `vite-plugin-static-copy` and the project's Vite version, pick the newest plugin release whose peer range includes it (`npm view vite-plugin-static-copy versions` and `peerDependencies`), and ledger the version.

- [ ] **Step 2: Write the failing tests**

`src/services/ocr/ocrAssets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { OCR_LANGUAGES, ocrAssetUrls, ocrCopyTargets } from './ocrAssets';

describe('OCR assets', () => {
  it('bundles English and Italian', () => {
    expect(OCR_LANGUAGES).toEqual(['eng', 'ita']);
  });

  it('serves everything from the app origin', () => {
    expect(ocrAssetUrls('https://app.example', '/')).toEqual({
      workerPath: 'https://app.example/tesseract/worker.min.js',
      corePath: 'https://app.example/tesseract/core',
      langPath: 'https://app.example/tesseract/lang',
    });
    expect(ocrAssetUrls('https://app.example', '/hemo/').langPath).toBe(
      'https://app.example/hemo/tesseract/lang'
    );
  });

  it('copies files that exist, including one data file per language', () => {
    const targets = ocrCopyTargets();
    for (const target of targets) {
      expect(existsSync(target.src), target.src).toBe(true);
    }
    for (const lang of OCR_LANGUAGES) {
      expect(targets.some((t) => t.src.endsWith(`${lang}.traineddata.gz`))).toBe(true);
    }
  });
});
```

The test file uses `node:fs`. The suite runs in jsdom, which has Node built-ins available in Vitest. If imports from `node:fs` fail under jsdom, add `// @vitest-environment node` as the file's first line.

In `src/services/ocr/tesseractService.test.ts`:
- Update the two existing `toHaveBeenCalledWith('deu', undefined, expect.any(Object))` expectations: the second argument becomes `1` (LSTM only).
- Add:

```ts
    it('loads the worker, core and languages from the app itself', async () => {
      await recognizeImage(new Blob(['x']));
      expect(Tesseract.createWorker).toHaveBeenCalledWith(
        'eng+ita',
        1,
        expect.objectContaining({
          workerPath: expect.stringMatching(/\/tesseract\/worker\.min\.js$/),
          corePath: expect.stringMatching(/\/tesseract\/core$/),
          langPath: expect.stringMatching(/\/tesseract\/lang$/),
        })
      );
    });
```

Place it where a fresh worker is created. The service caches its worker per language, so if a previous test left an `eng+ita` worker, use the file's existing reset (e.g. `terminateWorker()` in `beforeEach`).

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/services/ocr`
Expected: FAIL. `./ocrAssets` does not exist, and `createWorker` gets the CDN defaults.

- [ ] **Step 4: Implement**

`src/services/ocr/ocrAssets.ts`. Keep it free of browser APIs and path aliases: `vite.config.ts` imports it.

```ts
/**
 * OCR assets served by the app itself (copied at build time, precached by
 * the service worker), so OCR needs no CDN and works offline.
 *
 * To add a language: add its Tesseract code here and install
 * @tesseract.js-data/<code>.
 */

export const OCR_LANGUAGES: readonly string[] = ['eng', 'ita'];

export const OCR_ASSET_DIR = 'tesseract';

/** tesseract.js picks one of these LSTM cores by the browser's SIMD support */
export const OCR_CORE_FILES: readonly string[] = [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
];

/** Where the browser loads the assets from */
export function ocrAssetUrls(
  origin: string,
  base: string
): { workerPath: string; corePath: string; langPath: string } {
  const root = `${origin}${base.endsWith('/') ? base : `${base}/`}${OCR_ASSET_DIR}`;
  return {
    workerPath: `${root}/worker.min.js`,
    corePath: `${root}/core`,
    langPath: `${root}/lang`,
  };
}

/** Files to copy into the build, relative to the project root */
export function ocrCopyTargets(): Array<{ src: string; dest: string }> {
  return [
    { src: 'node_modules/tesseract.js/dist/worker.min.js', dest: OCR_ASSET_DIR },
    ...OCR_CORE_FILES.map((file) => ({
      src: `node_modules/tesseract.js-core/${file}`,
      dest: `${OCR_ASSET_DIR}/core`,
    })),
    ...OCR_LANGUAGES.map((lang) => ({
      src: `node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,
      dest: `${OCR_ASSET_DIR}/lang`,
    })),
  ];
}
```

`tesseractService.ts`:

```ts
import { OCR_LANGUAGES, ocrAssetUrls } from './ocrAssets';

const DEFAULT_LANGUAGE = OCR_LANGUAGES.join('+');
```

- Change the defaults of `getWorker(language = DEFAULT_LANGUAGE)` and `recognizeImage`'s `language = DEFAULT_LANGUAGE`.
- Create the worker with:

```ts
  workerInstance = await createWorker(language, 1 /* OEM.LSTM_ONLY */, {
    ...ocrAssetUrls(window.location.origin, import.meta.env.BASE_URL),
    logger: () => {},
  });
```

Check `recognizeImages` and any other entry point for an `'eng'` default, and change those to `DEFAULT_LANGUAGE` too.

`vite.config.ts`:

```ts
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { ocrCopyTargets } from './src/services/ocr/ocrAssets';
```

- **Copying:** add `viteStaticCopy({ targets: ocrCopyTargets() })` to `plugins`, before `VitePWA(...)`, so the files exist when Workbox builds its precache manifest.
- **Precache patterns:** in `workbox`, set `globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}', 'tesseract/**/*']`.
- **Size limit:** set `maximumFileSizeToCacheInBytes` to the next whole MiB above the largest OCR file from Step 1 (the cores are about 3.8 MB). For example `maximumFileSizeToCacheInBytes: 8 * 1024 * 1024`, with the comment `// OCR cores and language data are a few MB each`.
- **Old rule:** remove the `tesseract.*worker|tesseract.*lang-data` runtime-caching rule; those files are precached now.

The dev server serves the copied files too: `vite-plugin-static-copy` serves its targets in `vite dev`. The E2E suite runs against the dev server, which therefore has no service worker. Offline use is covered by the precache manifest check in Step 5.

- [ ] **Step 5: Run the tests and check the build**

Run:

```bash
npx vitest run src/services/ocr && npx tsc -b && npm run build
ls dist/tesseract dist/tesseract/core dist/tesseract/lang
grep -o 'tesseract/[^"]*' dist/sw.js | sort -u
```

Expected:
- the tests pass
- the build succeeds without new warnings
- `dist/tesseract` holds `worker.min.js`, the three cores and both `.traineddata.gz` files
- `dist/sw.js` lists all six

Note the precache size Workbox reports in the build output in the ledger. It grows by roughly 15 MB. That is the cost of offline OCR, and it is downloaded once.

- [ ] **Step 6: Run the OCR E2E**

Run: `npx playwright test e2e/document-analysis.spec.ts -g "OCR" --workers=2 --reporter=line`
Expected: PASS in both browsers, with no external requests.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vite.config.ts src/services/ocr
git commit -m "feat(ocr): bundle Tesseract with English and Italian, with no CDN"
```

---

### Task 8: Full verification and progress

**Files:**
- Modify: `docs/superpowers/specs/2026-10-17-gherkin-completion-design.md` ("Progress" section)

- [ ] **Step 1: Run the import and analysis E2E in both browsers**

Run: `npx playwright test e2e/document-analysis.spec.ts e2e/import-wizard.spec.ts --workers=2 --reporter=line`
Expected: all pass.

If a test fails, debug it with superpowers:systematic-debugging. Fix the app when the app is wrong. Change a test only when it contradicts the Gherkin or this plan's Global Constraints, and ledger the reason.

- [ ] **Step 2: Run every gate**

Run: `npm run build && npm run lint && npx vitest run --maxWorkers=4`
Expected: all succeed. The vitest output contains nothing besides test results.

Run: `npx playwright test --workers=2 --reporter=line`
Expected: the only failures are the 8 preferred-unit tests of sub-project 5 (4 per browser).

- [ ] **Step 3: Update the progress section**

In the spec's "Progress" section:
- Set sub-project 4 to `Done and reviewed`, with a link to this plan.
- Remove sub-project 4's row from the expected-failures table.
- Remove the note about the CDN-dependent OCR test.

Commit:

```bash
git add docs/superpowers/specs/2026-10-17-gherkin-completion-design.md
git commit -m "docs(spec): mark import and OCR done"
```

Do this commit after the final review and its fix pass, once the Outcome section of this plan is written.


---

## Outcome (2026-10-23)

Executed inline. A fresh reviewer reviewed the whole branch, followed by one fix pass (commits f62b087..d1fef37).

The fix pass covered:
- **OpenAI quota:** an exhausted OpenAI quota is reported at once instead of being retried as a rate limit.
- **Leaving the step:** AI requests and rate-limit waits stop when the analysis step is left.
- **OCR workers:** one shared OCR worker, with progress reported through it; this removes the worker leak.
- **Manual entry:** one action covers every file without values, and empty manual results are skipped.
- **Dates:**
  - Unclear report dates are shown so they can be typed.
  - Year-first slashed dates are read.
  - Confirm shows the saved date.
- **Units:** a unit the renamed biomarker cannot have is replaced.
- **Accessibility:** the lab date clear button is named and file stages are announced.
- **Offline PDFs:** the PDF.js worker is precached, so PDFs open offline.

Found during verification:
- Persistence saved `15/01/2024` in March 2025. One date parser now serves review and saving.
- A second OCR worker still used the CDN.
- The Italian data logged a missing word list.

Gates:
- build, lint, and 1590 unit tests with clean output
- import and analysis E2E 128/128 in both browsers
- full E2E: only the 8 preferred-unit tests of sub-project 5 fail

Precache: 24 entries, about 19 MB (OCR worker, 3 cores, English and Italian data, PDF.js worker).

Deferred minors (not fixed; candidates for later work):
- the 3 parallel cloud slots retry on the same fixed 2/4/8 s schedule (no shared backoff or jitter); OpenAI's retry-after-ms is ignored
- every visitor precaches ~19 MB, including 3 SIMD core variants of which a browser uses one (runtime-caching cores would save ~8 MB)
- the OCR file check in vite.config.ts resolves paths from the shell's directory, not the project root
- src/utils/biomarkerSuggestions.ts depends on the data layer and ReviewStep imports BIOMARKER_DEFINITIONS directly; belongs in a services/biomarkers module
- offline OCR from the service-worker cache is not tested end to end (the E2E blocks external hosts on the dev server, which has no service worker)
