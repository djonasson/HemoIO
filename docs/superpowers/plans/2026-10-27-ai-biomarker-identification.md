# AI Biomarker Identification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import files every value under the right dictionary test: the AI that reads the report identifies each test by key, the app checks it, and a fallback of exact aliases, learned aliases and a small in-browser model covers values the AI leaves unidentified.

**Architecture:** The extraction prompt carries a compact list of the dictionary's tests; each provider parses an optional `biomarkerKey` with one shared helper; the analyzer chooses each value's test by fixed rules and records how it was identified and which checks it needs; review shows the chosen test with a Change control and text labels; saving teaches the user's own aliases; a lazily loaded multilingual embedding model matches the remaining names by meaning.

**Tech Stack:** React 19, Mantine 8, TypeScript (strict), Dexie (sealed records), Vitest + Testing Library, Playwright, Vite + vite-plugin-pwa (Workbox), `@huggingface/transformers` 4.2.0 (new), Ollama native `/api/chat`.

**Spec:** `docs/superpowers/specs/2026-10-27-ai-biomarker-identification-design.md`

## Global Constraints

- A wrong match is worse than no match: every match must fit the value's unit (listed, or convertible to the test's standard unit: `unitFitsBiomarker`).
- Labels are text with an icon, never colour alone (EAA/WCAG AA).
- Never log or expose API keys, health data, encryption keys or salts; no report data leaves the device for the fallback model (only the model is downloaded).
- Learned aliases are stored only in the sealed preferences record (encrypted at rest), on this device.
- In development: no migration, no backwards compatibility for saved data or backups.
- TDD: Gherkin first, then E2E, then unit tests; every test is seen failing before the code that passes it.
- Gates before closing: `npm run build`, `npm run lint`, `npx vitest run --maxWorkers=4` with no console output, `npx playwright test --workers=2` across all projects, then simplify, code-review and security-review.
- Format new files with `npx prettier --single-quote --print-width 100 --trailing-comma es5`; do not reformat lines a task does not change.
- Commits: conventional, explicit `git add` of the task's files, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Do not edit `src` while a Playwright run is in progress (the dev server reloads).

## Review Focus

1. A model that returns a key with a unit the key's test does not take (the AI says `urine-creatinine` for 1.55 g/24h): the value must not be saved under that test; review flags "Unit doesn't fit" and Continue is blocked until the user resolves it. (Task 5 and Task 6 tests.)
2. Keys the dictionary does not have, in other casing, with whitespace, or as non-strings (`"Glucose"`, `" glucose "`, `42`, `null`): unknown or malformed keys fall back to name matching and are never trusted. (Task 3 tests.)
3. Two values the AI gives the same key but different units that convert (117 mmol/L and 7 g/L urine urea): still merged as one measurement; deduplication groups by the chosen test whichever rule chose it. (Task 5 test.)
4. The fallback model failing to download or load (offline on first use, blocked host): the import still completes, the values are "Not identified", and the notes say the matching model could not load. (Task 8 tests.)
5. A learned alias whose test the user later saves as "Not in dictionary", or a learned name that collides with a built-in alias of another test: the built-in alias wins and "Not in dictionary" removes the learned one. (Task 7 tests.)

---

### Task 1: Gherkin scenarios and an E2E fixture that never downloads the model

**Files:**
- Create: `features/ai-biomarker-identification.feature`
- Create: `e2e/fixtures.ts`
- Modify: every `e2e/**/*.spec.ts` that imports `test` from `@playwright/test` (import from `./fixtures` or `../fixtures` instead)

**Interfaces:**
- Produces: `e2e/fixtures.ts` exporting `test` (Playwright `test` whose `page` aborts requests to the model host) and `expect`; `MODEL_HOST_PATTERN = 'https://huggingface.co/**'`.

- [ ] **Step 1: Write the feature file**

```gherkin
Feature: AI biomarker identification
  As a user importing lab reports in any language
  I want each value filed under the right test
  So that my trends and alerts are correct without fixing names by hand

  Background:
    Given I am logged in
    And an AI provider is configured

  Scenario: The AI identifies the test of each value
    Given the AI identifies "Creatinina/L (urine 24h)" in µmol/L as Urine Creatinine
    When the report is analyzed
    Then the value should be saved as Urine Creatinine
    And it should carry no label that asks for a check

  Scenario: The unit does not fit the test the AI chose
    Given the AI identifies a value in g/24h as Urine Creatinine
    When the report is analyzed
    Then the row should be labelled "Unit doesn't fit"
    And Continue should be blocked until I choose a fitting unit, another test, or "Not in dictionary"

  Scenario: The printed name suggests a different test
    Given the AI identifies "Creatinina 24h" in µmol/L as Urine Creatinine
    When the report is analyzed
    Then the value should be saved as Urine Creatinine
    And the row should be labelled "Name suggests 24-Hour Urine Creatinine"

  Scenario: The model identifies no tests
    Given the AI returns no test for any value
    When the report is analyzed
    Then the analysis notes should say the model did not identify the tests
    And values matched by their name should be labelled "Matched by name only"
    And values with no match should be labelled "Not identified"

  Scenario: Change the test a value is saved as
    Given a value is saved as Urine Creatinine
    When I change its test to 24-Hour Urine Creatinine
    Then the value should be saved as 24-Hour Urine Creatinine
    And its unit choices should be those of 24-Hour Urine Creatinine

  Scenario: Editing the printed name keeps the test
    Given the AI identified a value as Urine Urea
    When I edit its printed name
    Then it should still be saved as Urine Urea

  Scenario: A confirmed name is learned
    Given I saved "Zorblatina (urine)" as Urine Urea
    When I import a report where the AI gives no test for "Zorblatina (urine)"
    Then the value should be saved as Urine Urea
    And the row should be labelled "Matched by name only"

  Scenario: Remove a learned name
    Given I saved "Zorblatina (urine)" as Urine Urea
    When I remove it from the learned names in Settings
    Then a later import of "Zorblatina (urine)" should not be identified by it

  Scenario: Saving as "Not in dictionary" forgets a learned name
    Given I saved "Zorblatina (urine)" as Urine Urea
    When I save it as "Not in dictionary" in a later import
    Then the learned name should be removed

  Scenario: The matching model cannot load
    Given the AI gives no test for a name no alias knows
    And the matching model cannot be downloaded
    When the report is analyzed
    Then the value should be labelled "Not identified"
    And the analysis notes should say the matching model could not load
```

- [ ] **Step 2: Write the fixture**

```typescript
/**
 * Playwright test with a page that never downloads the fallback matching
 * model: E2E runs stay fast and offline-safe, and the "model cannot load"
 * path is the one every test sees unless it serves the model itself.
 */
import { test as base, expect } from '@playwright/test';

export const MODEL_HOST_PATTERN = 'https://huggingface.co/**';

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(MODEL_HOST_PATTERN, (route) => route.abort());
    await use(page);
  },
});

export { expect };
```

- [ ] **Step 3: Switch the specs to the fixture**

Run:
```bash
grep -rl "from '@playwright/test'" e2e --include='*.spec.ts' | while read f; do
  rel=$(python3 -c "import os,sys; print(os.path.relpath('e2e/fixtures', os.path.dirname(sys.argv[1])))" "$f")
  case "$rel" in .*) ;; *) rel="./$rel";; esac
  sed -i -E "s#import \{ test, expect(, type ([A-Za-z]+))? \} from '@playwright/test';#import { test, expect } from '$rel';\nimport type { \2 } from '@playwright/test';#" "$f"
done
grep -rn "from '@playwright/test'" e2e --include='*.spec.ts' | head
```
Expected: each spec imports `test, expect` from the fixture; remaining `@playwright/test` imports are type-only. Fix any spec the sed did not cover by hand (empty `import type {  }` lines are deleted).

- [ ] **Step 4: Verify nothing changed in behaviour**

Run: `npx tsc --noEmit -p tsconfig.app.json && npx playwright test --workers=2 --project=chromium`
Expected: all pass (the model is not used yet).

- [ ] **Step 5: Commit**

```bash
git add features/ai-biomarker-identification.feature e2e
git commit -m "test(identification): scenarios, and an E2E page that never downloads the matching model"
```

---

### Task 2: The test list in the extraction prompt

**Files:**
- Create: `src/services/ai/testList.ts`
- Test: `src/services/ai/testList.test.ts`
- Modify: `src/services/ai/prompts.ts` (identification instructions, test list, response schema; remove `BIOMARKER_CONTEXT`, whose "BUN: Blood Urea Nitrogen, Urea" files urea as BUN)
- Test: `src/services/ai/prompts.test.ts` (create if missing)

**Interfaces:**
- Consumes: `BIOMARKER_DEFINITIONS`, `BiomarkerDefinition` from `@data/biomarkers/dictionary`.
- Produces: `buildTestList(definitions: readonly BiomarkerDefinition[]): string`; `ENHANCED_SYSTEM_PROMPT` now contains the section `KNOWN TESTS`; `RESPONSE_SCHEMA.properties.biomarkers.items.properties.biomarkerKey = { type: ['string', 'null'] }`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/services/ai/testList.test.ts
import { describe, it, expect } from 'vitest';
import { buildTestList } from './testList';
import { BIOMARKER_DEFINITIONS, getBiomarkerByKey } from '@data/biomarkers/dictionary';

describe('buildTestList', () => {
  it('gives one line per test: key, name, specimen and units', () => {
    const lines = buildTestList([getBiomarkerByKey('urine-creatinine')!]).split('\n');
    expect(lines).toEqual(['urine-creatinine: Urine Creatinine [urine; mg/dL, µmol/L, umol/L, g/L, mmol/L]']);
  });

  it('lists every dictionary test, in dictionary order', () => {
    const keys = buildTestList(BIOMARKER_DEFINITIONS)
      .split('\n')
      .map((line) => line.slice(0, line.indexOf(':')));
    expect(keys).toEqual(BIOMARKER_DEFINITIONS.map((d) => d.key));
  });

  it('marks a unitless test', () => {
    const ph = BIOMARKER_DEFINITIONS.find((d) => d.canonicalUnit === '' && d.alternativeUnits.length === 0)!;
    expect(buildTestList([ph])).toMatch(/\[[^;]*; no unit\]$/);
  });
});
```

```typescript
// src/services/ai/prompts.test.ts
import { describe, it, expect } from 'vitest';
import { ENHANCED_SYSTEM_PROMPT, RESPONSE_SCHEMA } from './prompts';

describe('the extraction prompt', () => {
  it('lists the known tests and asks for the key of each value', () => {
    expect(ENHANCED_SYSTEM_PROMPT).toContain('KNOWN TESTS');
    expect(ENHANCED_SYSTEM_PROMPT).toContain('urine-creatinine: Urine Creatinine');
    expect(ENHANCED_SYSTEM_PROMPT).toContain('biomarkerKey');
  });

  it('no longer tells the AI that urea is blood urea nitrogen', () => {
    expect(ENHANCED_SYSTEM_PROMPT).not.toMatch(/BUN: Blood Urea Nitrogen, Urea/);
  });

  it('accepts a key or null in the response schema', () => {
    expect(RESPONSE_SCHEMA.properties.biomarkers.items.properties).toHaveProperty('biomarkerKey');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/services/ai/testList.test.ts src/services/ai/prompts.test.ts`
Expected: FAIL — `testList` does not exist; the prompt has no KNOWN TESTS.

- [ ] **Step 3: Implement `testList.ts`**

```typescript
/**
 * The dictionary's tests as the AI is shown them, one line each:
 * "urine-creatinine: Urine Creatinine [urine; mg/dL, µmol/L, g/L]". The
 * units let the AI tell a concentration from an amount per day, and a
 * count from a percentage.
 */
import type { BiomarkerDefinition } from '@data/biomarkers/dictionary';

export function buildTestList(definitions: readonly BiomarkerDefinition[]): string {
  return definitions
    .map((d) => {
      const units = [...new Set([d.canonicalUnit, ...d.alternativeUnits].filter(Boolean))];
      return `${d.key}: ${d.name} [${d.specimenType ?? 'unspecified'}; ${units.join(', ') || 'no unit'}]`;
    })
    .join('\n');
}
```

- [ ] **Step 4: Change `prompts.ts`**

Add to the per-biomarker field list in `LAB_REPORT_SYSTEM_PROMPT`, after `- name: Biomarker name as found in report`:

```
- biomarkerKey: the key of the test this value is, from KNOWN TESTS, or null when none fits
```

Replace `BIOMARKER_CONTEXT` and `ENHANCED_SYSTEM_PROMPT` with:

```typescript
/**
 * How the AI identifies each value's test, and the tests it chooses from
 */
export const IDENTIFICATION_CONTEXT = `
IDENTIFYING THE TEST:
For each value, set "biomarkerKey" to the key of the test it is, from KNOWN TESTS below.
- Judge by the report, not only the printed name: section headings (e.g. "Raccolte urinarie temporizzate", "Urine delle 24 ore"), the specimen, whether a urine sample is a spot sample or a 24-hour collection, and the unit.
- The unit tells apart tests a report names alike: a concentration (per litre, e.g. µmol/L, g/L) from an amount per day (e.g. µmol/24h, g/24h), and a count (e.g. 10^9/L) from a percentage (%).
- Use null when no test in the list fits. Never invent a key, and never use a test's name instead of its key.
- Keep "name" as printed in the report.

KNOWN TESTS (key: name [specimen; units]):
${buildTestList(BIOMARKER_DEFINITIONS)}
`;

/**
 * System prompt with identification
 */
export const ENHANCED_SYSTEM_PROMPT = `${LAB_REPORT_SYSTEM_PROMPT}

${IDENTIFICATION_CONTEXT}`;
```

with the imports:

```typescript
import { BIOMARKER_DEFINITIONS } from '@data/biomarkers/dictionary';
import { buildTestList } from './testList';
```

In `RESPONSE_SCHEMA.properties.biomarkers.items.properties` add `biomarkerKey: { type: ['string', 'null'] },` after `name`. Remove the duplicated header comment at the top of the file.

- [ ] **Step 5: Run the tests to verify they pass, then the AI suite**

Run: `npx vitest run src/services/ai`
Expected: PASS (fix any test asserting the removed `BIOMARKER_CONTEXT`).

- [ ] **Step 6: Commit**

```bash
git add src/services/ai/testList.ts src/services/ai/testList.test.ts src/services/ai/prompts.ts src/services/ai/prompts.test.ts
git commit -m "feat(ai): show the AI the dictionary's tests and ask for each value's key"
```

---

### Task 3: One parser for the AI's key, used by every provider

**Files:**
- Create: `src/services/ai/biomarkerKey.ts`
- Test: `src/services/ai/biomarkerKey.test.ts`
- Modify: `src/services/ai/types.ts` (`ExtractedBiomarker.biomarkerKey?: string`)
- Modify: `src/services/ai/OpenAIProvider.ts`, `src/services/ai/AnthropicProvider.ts`, `src/services/ai/OllamaProvider.ts` (each `parseResponse` mapping)
- Test: the three `*Provider.test.ts` files (one case each)

**Interfaces:**
- Produces: `readBiomarkerKey(raw: Record<string, unknown>): string | undefined`; `ExtractedBiomarker.biomarkerKey?: string` — the trimmed string the model gave, not yet checked against the dictionary (the analyzer checks it).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/services/ai/biomarkerKey.test.ts
import { describe, it, expect } from 'vitest';
import { readBiomarkerKey } from './biomarkerKey';

describe('readBiomarkerKey', () => {
  it('reads the key the model gave, trimmed', () => {
    expect(readBiomarkerKey({ biomarkerKey: ' urine-creatinine ' })).toBe('urine-creatinine');
  });

  it('treats null, empty and non-string keys as absent', () => {
    for (const biomarkerKey of [null, '', '   ', 42, true, {}, undefined]) {
      expect(readBiomarkerKey({ biomarkerKey })).toBeUndefined();
    }
  });
});
```

In each of `OpenAIProvider.test.ts`, `AnthropicProvider.test.ts`, `OllamaProvider.test.ts`, add a case to the existing response-parsing describe (use the file's existing helper that mocks a response with given content; the mocked JSON gains `"biomarkerKey": "glucose"` on one biomarker and `"biomarkerKey": null` on another):

```typescript
it('passes on the test key the model gave', async () => {
  // response content: {"biomarkers":[{"name":"Glicemia","value":95,"unit":"mg/dL","confidence":0.9,"biomarkerKey":"glucose"},{"name":"Zorb","value":1,"unit":"U","confidence":0.9,"biomarkerKey":null}],"warnings":[]}
  const result = await provider.analyzeLabReport('Glicemia 95 mg/dL');
  expect(result.biomarkers.map((b) => b.biomarkerKey)).toEqual(['glucose', undefined]);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/services/ai`
Expected: FAIL — `biomarkerKey` module missing; providers drop the field.

- [ ] **Step 3: Implement**

```typescript
// src/services/ai/biomarkerKey.ts
/**
 * The test key a model gave for a value: a non-empty string, trimmed. It is
 * not checked against the dictionary here; the analyzer does that.
 */
export function readBiomarkerKey(raw: Record<string, unknown>): string | undefined {
  const key = raw.biomarkerKey;
  if (typeof key !== 'string') return undefined;
  const trimmed = key.trim();
  return trimmed === '' ? undefined : trimmed;
}
```

In `types.ts`, `ExtractedBiomarker` after `name`:

```typescript
  /** The dictionary key the model identified, as given (checked by the analyzer) */
  biomarkerKey?: string;
```

In each provider's `parseResponse` mapping, after `name: String(b.name || ''),`:

```typescript
            ...withBiomarkerKey(b),
```

and add to `biomarkerKey.ts`:

```typescript
/** The key as an optional property, absent when the model gave none */
export function withBiomarkerKey(raw: Record<string, unknown>): { biomarkerKey?: string } {
  const biomarkerKey = readBiomarkerKey(raw);
  return biomarkerKey === undefined ? {} : { biomarkerKey };
}
```

with `import { withBiomarkerKey } from './biomarkerKey';` in each provider.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/services/ai`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/ai
git commit -m "feat(ai): every provider passes on the test key the model identified"
```

---

### Task 4: Ollama with a context large enough for the prompt

Ollama's OpenAI-compatible endpoint cannot set the context size ("The OpenAI API does not have a way of setting the context size for a model", docs.ollama.com/api/openai-compatibility). The native `POST /api/chat` takes `options.num_ctx`, `format: "json"` and `stream: false`, and answers `{ message: { content }, done_reason, ... }`.

**Files:**
- Modify: `src/services/ai/OllamaProvider.ts` (`makeChatRequest` → native `/api/chat`; callers read `message.content`, a `done_reason` of `"length"` is treated as the cut-off answer the OpenAI path treated `finish_reason: "length"` as)
- Create: `src/services/ai/ollamaContext.ts`
- Test: `src/services/ai/ollamaContext.test.ts`, `src/services/ai/OllamaProvider.test.ts`
- Modify: `e2e/steps/ai.steps.ts`, `e2e/steps/documentAnalysis.steps.ts`, `e2e/ollama-integration.spec.ts` (mock `/api/chat` with the native response shape)

**Interfaces:**
- Produces: `ollamaContextSize(promptCharacters: number, maxTokens: number): number`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/services/ai/ollamaContext.test.ts
import { describe, it, expect } from 'vitest';
import { ollamaContextSize } from './ollamaContext';

describe('ollamaContextSize', () => {
  it('fits the prompt and the answer, rounded up to a multiple of 1024', () => {
    // 35,000 characters ≈ 10,000 tokens, plus 4,096 for the answer
    expect(ollamaContextSize(35_000, 4096)).toBe(14_336);
  });

  it('never asks for less than 4096', () => {
    expect(ollamaContextSize(100, 256)).toBe(4096);
  });
});
```

In `OllamaProvider.test.ts` (with its existing fetch mock):

```typescript
it('sends the chat to the native API with a context that fits the prompt', async () => {
  fetchMock.mockResolvedValueOnce(
    jsonResponse({ message: { role: 'assistant', content: '{"biomarkers":[],"warnings":[]}' }, done_reason: 'stop' })
  );
  await provider.analyzeLabReport('x'.repeat(35_000));

  const [url, init] = fetchMock.mock.calls.at(-1)!;
  expect(String(url)).toMatch(/\/api\/chat$/);
  const body = JSON.parse(String(init.body));
  expect(body).toMatchObject({ stream: false, format: 'json' });
  expect(body.options.num_ctx).toBeGreaterThan(10_000);
});
```

(`fetchMock`/`jsonResponse` stand for the file's existing fetch-mocking helpers; use those names.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/services/ai/ollamaContext.test.ts src/services/ai/OllamaProvider.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// src/services/ai/ollamaContext.ts
/** Roughly how many characters a token holds in lab report text */
const CHARACTERS_PER_TOKEN = 3.5;
const MINIMUM_CONTEXT = 4096;

/**
 * The context size to request from Ollama: the prompt's estimated tokens
 * plus room for the answer, rounded up to a multiple of 1024. Ollama's
 * default is smaller, and it cuts longer prompts off silently.
 */
export function ollamaContextSize(promptCharacters: number, maxTokens: number): number {
  const tokens = Math.ceil(promptCharacters / CHARACTERS_PER_TOKEN) + maxTokens;
  return Math.max(MINIMUM_CONTEXT, Math.ceil(tokens / 1024) * 1024);
}
```

In `OllamaProvider.makeChatRequest`: `const url = \`${this.baseUrl}/api/chat\`;` and body

```typescript
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          format: 'json',
          options: {
            temperature: this.temperature,
            num_predict: this.maxTokens,
            num_ctx: ollamaContextSize(
              messages.reduce((sum, m) => sum + String(m.content).length, 0),
              this.maxTokens
            ),
          },
        }),
```

Change its response type to `{ message?: { content?: string }; done_reason?: string }` and update the callers that read `choices[0].message.content` / `finish_reason` to read `message.content` / `done_reason`. Images for the vision path go in the native message's `images: string[]` (base64 without the data URL prefix) instead of OpenAI content parts; adapt `createVisionPrompt`'s message accordingly.

- [ ] **Step 4: Update the E2E mocks**

In `e2e/steps/ai.steps.ts` replace the `/v1/chat/completions` branch with:

```typescript
    if (url.includes('/api/chat')) {
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
```

Make the same change in `e2e/steps/documentAnalysis.steps.ts` (`OLLAMA_CHAT_URL = '**/localhost:11434/api/chat'`, response shape as above, request prompts read from `body.messages`) and `e2e/ollama-integration.spec.ts`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/services/ai && npx playwright test e2e/document-analysis.spec.ts e2e/ollama-integration.spec.ts e2e/import-wizard.spec.ts --project=chromium --workers=2`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/ai e2e
git commit -m "fix(ai): Ollama gets a context large enough for the prompt (native chat API)"
```

---

### Task 5: The analyzer chooses each value's test and says how

**Files:**
- Modify: `src/services/analysis/LabReportAnalyzer.ts`
- Test: `src/services/analysis/LabReportAnalyzer.identification.test.ts` (new; real dictionary, mocked text extraction and AI as in `LabReportAnalyzer.dualUnits.test.ts`)

**Interfaces:**
- Consumes: `ExtractedBiomarker.biomarkerKey?` (Task 3); `getBiomarkerByKey`, `findBiomarker` (dictionary); `unitFitsBiomarker` (`@/utils/biomarkerSuggestions`).
- Produces (exported from `LabReportAnalyzer.ts`):
  ```typescript
  export type IdentifiedBy = 'ai' | 'name' | 'model' | 'user';
  export type IdentificationFlag =
    | 'unit-mismatch' | 'name-disagrees' | 'name-only' | 'similar-name' | 'not-identified';
  // MatchedBiomarker gains:
  identifiedBy?: IdentifiedBy;
  /** Checks the identification needs; absent means none (manual rows, fixtures) */
  identificationFlags?: IdentificationFlag[];
  /** With 'name-disagrees': the test the printed name is an exact alias of */
  nameSuggests?: BiomarkerDefinition;
  export const NO_KEYS_NOTE =
    'This model did not identify the tests; they were matched by name. Check the Saved as column.';
  ```
  and `matchBiomarkerToDictionary(biomarker, fallback?)` where `fallback` is filled by Tasks 7 and 8 (`NameFallback`, below).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/services/analysis/LabReportAnalyzer.identification.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeLabReport, NO_KEYS_NOTE } from './LabReportAnalyzer';
import type { ExtractedBiomarker } from '../ai';
import * as aiModule from '../ai';

// vi.mock('../ocr', …) and vi.mock('../ai', …) exactly as in LabReportAnalyzer.dualUnits.test.ts

function extracted(name: string, value: number, unit: string, biomarkerKey?: string): ExtractedBiomarker {
  return { name, value, unit, confidence: 0.95, ...(biomarkerKey && { biomarkerKey }) };
}

async function analyze(biomarkers: ExtractedBiomarker[]) {
  // as in LabReportAnalyzer.dualUnits.test.ts
}

describe('analyzeLabReport: identifying each value', () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the AI's key when the unit fits it", async () => {
    const [value] = (await analyze([extracted('Creatinina/L (urine 24h)', 4582, 'µmol/L', 'urine-creatinine')]))
      .matchedBiomarkers;
    expect(value.dictionaryMatch?.key).toBe('urine-creatinine');
    expect(value.identifiedBy).toBe('ai');
    expect(value.identificationFlags).toEqual([]);
  });

  it("only proposes the AI's key when the unit does not fit it", async () => {
    const [value] = (await analyze([extracted('Creatinina', 1.55, 'g/24h', 'urine-creatinine')]))
      .matchedBiomarkers;
    expect(value.dictionaryMatch).toBeUndefined();
    expect(value.suggestedMatch?.key).toBe('urine-creatinine');
    expect(value.identificationFlags).toEqual(['unit-mismatch']);
  });

  it('flags a printed name that is an exact alias of another test', async () => {
    const [value] = (await analyze([extracted('Creatinina 24h', 4582, 'µmol/L', 'urine-creatinine')]))
      .matchedBiomarkers;
    expect(value.dictionaryMatch?.key).toBe('urine-creatinine');
    expect(value.identificationFlags).toEqual(['name-disagrees']);
    expect(value.nameSuggests?.key).toBe('24-hour-urine-creatinine');
  });

  it('falls back to the name for unknown and malformed keys', async () => {
    const result = await analyze([
      extracted('Glucose', 95, 'mg/dL', 'Glucose'),
      extracted('Glucose', 95, 'mg/dL', 'not-a-key'),
    ]);
    for (const value of result.matchedBiomarkers) {
      expect(value.dictionaryMatch?.key).toBe('glucose');
      expect(value.identifiedBy).toBe('name');
      expect(value.identificationFlags).toEqual(['name-only']);
    }
  });

  it('labels a value nothing identifies', async () => {
    const [value] = (await analyze([extracted('Zorblatin', 1, 'U/L')])).matchedBiomarkers;
    expect(value.identifiedBy).toBeUndefined();
    expect(value.identificationFlags).toEqual(['not-identified']);
  });

  it('notes when the model identified no test at all', async () => {
    const result = await analyze([extracted('Glucose', 95, 'mg/dL'), extracted('Zorblatin', 1, 'U/L')]);
    expect(result.warnings).toContain(NO_KEYS_NOTE);
  });

  it('does not note it when the model identified some', async () => {
    const result = await analyze([extracted('Glucose', 95, 'mg/dL', 'glucose'), extracted('Zorblatin', 1, 'U/L')]);
    expect(result.warnings).not.toContain(NO_KEYS_NOTE);
  });

  it('merges one value the AI keyed in two units that convert', async () => {
    const result = await analyze([
      extracted('Urea/L (urine)', 117, 'mmol/L', 'urine-urea'),
      extracted('Urea/L (urine)', 7, 'g/L', 'urine-urea'),
    ]);
    expect(result.duplicateConflicts).toEqual([]);
    expect(result.matchedBiomarkers).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/services/analysis/LabReportAnalyzer.identification.test.ts`
Expected: FAIL — no `identifiedBy`, no flags, no note.

- [ ] **Step 3: Implement**

In `LabReportAnalyzer.ts`, add the types above to `MatchedBiomarker`, and:

```typescript
/** Names matched after the dictionary's own aliases: learned aliases, then the model (Tasks 7, 8) */
export interface NameFallback {
  /** A learned alias of the printed name */
  learned?: (name: string) => BiomarkerDefinition | undefined;
  /** Tests whose names mean the same as the printed name, closest first */
  similar?: (name: string) => Promise<BiomarkerDefinition[]>;
}

export const NO_KEYS_NOTE =
  'This model did not identify the tests; they were matched by name. Check the Saved as column.';
```

Rename the existing `matchBiomarkerToDictionary` to `matchByName` (unchanged body) and add:

```typescript
async function matchBiomarkerToDictionary(
  biomarker: ExtractedBiomarker,
  fallback: NameFallback = {}
): Promise<MatchedBiomarker> {
  const normalizedUnit = normalizeUnit(biomarker.unit);
  const fits = (d: BiomarkerDefinition) => unitFitsBiomarker(d, biomarker.unit);
  const aiChoice = biomarker.biomarkerKey ? getBiomarkerByKey(biomarker.biomarkerKey) : undefined;

  // Rules 1 and 2: the AI's key, when the dictionary has it
  if (aiChoice) {
    if (!fits(aiChoice)) {
      return { ...biomarker, suggestedMatch: aiChoice, isExactMatch: false, normalizedUnit, identificationFlags: ['unit-mismatch'] };
    }
    const named = findBiomarker(biomarker.name);
    const disagrees = named !== undefined && named.key !== aiChoice.key;
    return {
      ...biomarker,
      dictionaryMatch: aiChoice,
      isExactMatch: true,
      normalizedUnit,
      identifiedBy: 'ai',
      identificationFlags: disagrees ? ['name-disagrees'] : [],
      ...(disagrees && { nameSuggests: named }),
    };
  }

  // Rule 3: the fallback, first that matches with a fitting unit
  const byName = matchByName(biomarker);
  if (byName.dictionaryMatch) return { ...byName, identifiedBy: 'name', identificationFlags: ['name-only'] };
  const learned = fallback.learned?.(biomarker.name);
  if (learned && fits(learned)) {
    return { ...byName, dictionaryMatch: learned, suggestedMatch: undefined, isExactMatch: false, identifiedBy: 'name', identificationFlags: ['name-only'] };
  }
  const similar = (await fallback.similar?.(biomarker.name))?.find(fits);
  if (similar) {
    return { ...byName, dictionaryMatch: similar, suggestedMatch: undefined, isExactMatch: false, identifiedBy: 'model', identificationFlags: ['similar-name'] };
  }
  return { ...byName, identificationFlags: ['not-identified'] };
}
```

In `analyzeLabReport`, the matching stage becomes:

```typescript
    const initialMatches = await Promise.all(
      aiAnalysis.biomarkers.map((biomarker) => matchBiomarkerToDictionary(biomarker, options.nameFallback))
    );
```

with `nameFallback?: NameFallback` added to `AnalyzerOptions`, and after the unmatched-count warning:

```typescript
    if (aiAnalysis.biomarkers.length > 0 && aiAnalysis.biomarkers.every((b) => !b.biomarkerKey)) {
      warnings.push(NO_KEYS_NOTE);
    }
```

Deduplication keeps `identifiedBy`/`identificationFlags` on the value it keeps (it already spreads the kept value). Update `LabReportAnalyzer.test.ts`'s dictionary mock with `getBiomarkerByKey: () => undefined` if it fails on the new import.

- [ ] **Step 4: Run the tests to verify they pass, then the analysis suite**

Run: `npx vitest run src/services/analysis src/components/import`
Expected: PASS (existing tests adjusted only where they assert the exact shape of a matched value with `toEqual`: add `identificationFlags`).

- [ ] **Step 5: Commit**

```bash
git add src/services/analysis
git commit -m "feat(import): use the AI's identification, checked by unit, and say how each value was matched"
```

---

### Task 6: Review shows the test each value is saved as

**Files:**
- Create: `src/components/import/SavedAsCell.tsx`, `src/components/import/IdentificationLabels.tsx`
- Test: `src/components/import/SavedAsCell.test.tsx`, `src/components/import/IdentificationLabels.test.tsx`
- Modify: `src/components/import/ReviewStep.tsx` (new "Saved as" column; labels; Continue rule), `src/utils/biomarkerSuggestions.ts` (`chooseTest`, name-edit rule)
- Test: `src/utils/biomarkerSuggestions.test.ts`, `src/components/import/ReviewStep.test.tsx`
- Create: `e2e/ai-biomarker-identification.spec.ts`, `e2e/steps/identification.steps.ts`

**Interfaces:**
- Consumes: `MatchedBiomarker.identifiedBy`, `identificationFlags`, `nameSuggests` (Task 5).
- Produces:
  - `chooseTest<T extends MatchedBiomarker>(biomarker: T, definition: BiomarkerDefinition | null): T` — sets `dictionaryMatch` (or clears it for `null`), `suggestedMatch: undefined`, `identifiedBy: 'user'` (or `undefined` for null), `identificationFlags: definition ? [] : ['not-identified']`, `savedAsUnknown: definition === null`.
  - `MatchedBiomarker.savedAsUnknown?: boolean` — the user chose "Not in dictionary" (persistence then saves the unknown key; Task 7 uses it to forget an alias).
  - `IDENTIFICATION_LABELS: Record<IdentificationFlag, (b: MatchedBiomarker) => string>` in `IdentificationLabels.tsx`: `'unit-mismatch' → "Unit doesn't fit"`, `'name-disagrees' → \`Name suggests ${b.nameSuggests?.name}\``, `'name-only' → 'Matched by name only'`, `'similar-name' → 'Matched by similar name'`, `'not-identified' → 'Not identified'`.

- [ ] **Step 1: Write the failing E2E test**

```typescript
// e2e/ai-biomarker-identification.spec.ts
/**
 * E2E: AI biomarker identification (features/ai-biomarker-identification.feature)
 */
import { test, expect } from './fixtures';
import { setupOrUnlock } from './steps/app.steps';
import { analyzeReport } from './steps/unitConversion.steps';
import { savedAsCell, rowFor, changeTest } from './steps/identification.steps';

test.describe('AI biomarker identification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
  });

  test('uses the test the AI identified', async ({ page }) => {
    // Scenario: The AI identifies the test of each value
    await analyzeReport(page, [
      { name: 'Creatinina/L (urine 24h)', value: 4582, unit: 'µmol/L', confidence: 0.95, biomarkerKey: 'urine-creatinine' },
    ]);
    await expect(savedAsCell(rowFor(page, '4582'))).toHaveText(/Urine Creatinine/);
    await expect(rowFor(page, '4582').getByText(/Unit doesn't fit|Name suggests|Matched by|Not identified/)).toHaveCount(0);
  });

  test("flags a unit that does not fit the AI's test and blocks Continue", async ({ page }) => {
    // Scenario: The unit does not fit the test the AI chose
    await analyzeReport(page, [
      { name: 'Creatinina', value: 1.55, unit: 'g/24h', confidence: 0.95, biomarkerKey: 'urine-creatinine' },
    ]);
    await expect(rowFor(page, '1.55').getByText("Unit doesn't fit")).toBeVisible();
    await page.getByRole('button', { name: 'Continue to Confirm' }).click();
    await expect(page.getByText(/Choose a fitting unit, another test, or "Not in dictionary"/)).toBeVisible();
  });

  test('says when the name suggests another test', async ({ page }) => {
    // Scenario: The printed name suggests a different test
    await analyzeReport(page, [
      { name: 'Creatinina 24h', value: 4582, unit: 'µmol/L', confidence: 0.95, biomarkerKey: 'urine-creatinine' },
    ]);
    await expect(rowFor(page, '4582').getByText('Name suggests 24-Hour Urine Creatinine')).toBeVisible();
  });

  test('notes and labels values when the model gives no tests', async ({ page }) => {
    // Scenario: The model identifies no tests
    await analyzeReport(page, [
      { name: 'Glucose', value: 95, unit: 'mg/dL', confidence: 0.95 },
      { name: 'Zorblatin', value: 1, unit: 'U/L', confidence: 0.95 },
    ]);
    await expect(page.getByText(/This model did not identify the tests/)).toBeVisible();
    await expect(rowFor(page, '95').getByText('Matched by name only')).toBeVisible();
    await expect(rowFor(page, '1').getByText('Not identified')).toBeVisible();
  });

  test('changes the test a value is saved as', async ({ page }) => {
    // Scenario: Change the test a value is saved as
    await analyzeReport(page, [
      { name: 'Creatinina', value: 1.55, unit: 'g/24h', confidence: 0.95, biomarkerKey: 'urine-creatinine' },
    ]);
    await changeTest(page, rowFor(page, '1.55'), '24-Hour Urine Creatinine');
    await expect(savedAsCell(rowFor(page, '1.55'))).toHaveText(/24-Hour Urine Creatinine/);
    await expect(rowFor(page, '1.55').getByText("Unit doesn't fit")).toHaveCount(0);
  });

  test('keeps the test when the printed name is edited', async ({ page }) => {
    // Scenario: Editing the printed name keeps the test
    await analyzeReport(page, [
      { name: 'Urea/L (urine)', value: 7, unit: 'g/L', confidence: 0.95, biomarkerKey: 'urine-urea' },
    ]);
    const row = rowFor(page, '7');
    await row.getByRole('button', { name: 'Edit biomarker' }).click();
    await page.getByPlaceholder('Biomarker name').fill('Urea urinaria');
    await row.getByRole('button', { name: 'Save changes' }).click();
    await expect(savedAsCell(rowFor(page, '7'))).toHaveText(/Urine Urea/);
  });
});
```

```typescript
// e2e/steps/identification.steps.ts
import { expect, type Locator, type Page } from '@playwright/test';
import { reviewRows } from './unitConversion.steps';

/** The review row whose value cell shows `value` */
export function rowFor(page: Page, value: string): Locator {
  return reviewRows(page).filter({ has: page.getByRole('cell', { name: value, exact: true }) });
}

/** The row's "Saved as" cell */
export function savedAsCell(row: Locator): Locator {
  return row.getByTestId('saved-as');
}

/** When I change the row's test to `testName` */
export async function changeTest(page: Page, row: Locator, testName: string): Promise<void> {
  await row.getByRole('button', { name: /^Change test for / }).click();
  const dialog = page.getByRole('dialog', { name: /Saved as/ });
  await dialog.getByRole('textbox', { name: 'Search tests' }).fill(testName);
  await dialog.getByRole('option', { name: testName, exact: true }).click();
  await expect(dialog).toBeHidden();
}
```

Add `biomarkerKey?: string` to `ExtractedBiomarkerFixture` in `e2e/steps/ai.steps.ts`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/ai-biomarker-identification.spec.ts --project=chromium --workers=1`
Expected: FAIL — no Saved as column.

- [ ] **Step 3: Write the failing unit tests**

```typescript
// in src/utils/biomarkerSuggestions.test.ts
describe('chooseTest', () => {
  const value: MatchedBiomarker = { ...base, name: 'Creatinina', unit: 'g/24h', dictionaryMatch: undefined,
    suggestedMatch: getBiomarkerByKey('urine-creatinine'), identificationFlags: ['unit-mismatch'] };

  it('saves the value as the chosen test, picked by the user', () => {
    const chosen = chooseTest(value, getBiomarkerByKey('24-hour-urine-creatinine')!);
    expect(chosen).toMatchObject({ identifiedBy: 'user', identificationFlags: [], savedAsUnknown: false });
    expect(chosen.dictionaryMatch?.key).toBe('24-hour-urine-creatinine');
    expect(chosen.suggestedMatch).toBeUndefined();
  });

  it('saves it as not in the dictionary', () => {
    const chosen = chooseTest(value, null);
    expect(chosen.dictionaryMatch).toBeUndefined();
    expect(chosen).toMatchObject({ savedAsUnknown: true, identificationFlags: ['not-identified'] });
  });
});

describe('applyBiomarkerName with a test the AI or the user chose', () => {
  it('keeps the test', () => {
    for (const identifiedBy of ['ai', 'user'] as const) {
      const value = { ...base, identifiedBy, dictionaryMatch: getBiomarkerByKey('urine-urea') };
      expect(applyBiomarkerName(value, 'Urea urinaria').dictionaryMatch?.key).toBe('urine-urea');
    }
  });

  it('still re-matches a value matched by name', () => {
    const value = { ...base, identifiedBy: 'name' as const };
    expect(applyBiomarkerName(value, 'Hematocrit').dictionaryMatch?.name).toBe('Hematocrit');
  });
});
```

```tsx
// src/components/import/IdentificationLabels.test.tsx
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { IdentificationLabels } from './IdentificationLabels';
import { getBiomarkerByKey } from '@data/biomarkers/dictionary';

it('shows each flag as text', () => {
  render(
    <MantineProvider env="test">
      <IdentificationLabels
        biomarker={{ name: 'x', value: 1, unit: 'u', confidence: 1, isExactMatch: false, normalizedUnit: 'u',
          identificationFlags: ['unit-mismatch', 'name-disagrees'], nameSuggests: getBiomarkerByKey('urea') }}
      />
    </MantineProvider>
  );
  expect(screen.getByText("Unit doesn't fit")).toBeInTheDocument();
  expect(screen.getByText('Name suggests Urea')).toBeInTheDocument();
});
```

```tsx
// src/components/import/SavedAsCell.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { vi } from 'vitest';
import { SavedAsCell } from './SavedAsCell';
import { getBiomarkerByKey } from '@data/biomarkers/dictionary';

const value = { name: 'Creatinina', value: 1, unit: 'g/24h', confidence: 1, isExactMatch: false,
  normalizedUnit: 'g/24h', identificationFlags: [], dictionaryMatch: getBiomarkerByKey('urine-creatinine') };

function renderCell(onChoose = vi.fn()) {
  render(<MantineProvider env="test"><SavedAsCell biomarker={value} onChoose={onChoose} /></MantineProvider>);
  return onChoose;
}

it('shows the test, and "Not in dictionary" without one', () => {
  renderCell();
  expect(screen.getByTestId('saved-as')).toHaveTextContent('Urine Creatinine');
});

it('chooses another test from a searchable list', () => {
  const onChoose = renderCell();
  fireEvent.click(screen.getByRole('button', { name: 'Change test for Creatinina' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Search tests' }), { target: { value: '24-Hour Urine Creatinine' } });
  fireEvent.click(screen.getByRole('option', { name: '24-Hour Urine Creatinine' }));
  expect(onChoose).toHaveBeenCalledWith(getBiomarkerByKey('24-hour-urine-creatinine'));
});

it('chooses "Not in dictionary"', () => {
  const onChoose = renderCell();
  fireEvent.click(screen.getByRole('button', { name: 'Change test for Creatinina' }));
  fireEvent.click(screen.getByRole('option', { name: 'Not in dictionary' }));
  expect(onChoose).toHaveBeenCalledWith(null);
});
```

In `ReviewStep.test.tsx` add: a row with `identificationFlags: ['unit-mismatch']` and a `dictionaryMatch` whose units do not include the row's unit blocks Continue with the message `… in "lab-report.pdf": g/24h is not a unit for Urine Creatinine. Choose a fitting unit, another test, or "Not in dictionary".`; a row with `savedAsUnknown: true` and any unit does not block.

- [ ] **Step 4: Run them to verify they fail**

Run: `npx vitest run src/utils/biomarkerSuggestions.test.ts src/components/import`
Expected: FAIL — missing components and helpers.

- [ ] **Step 5: Implement**

`biomarkerSuggestions.ts`:

```typescript
/**
 * Save a value as a test the user chose in review, or as not in the
 * dictionary (null): the choice is final, so name edits no longer move it
 */
export function chooseTest<T extends MatchedBiomarker>(
  biomarker: T,
  definition: BiomarkerDefinition | null
): T {
  return {
    ...biomarker,
    dictionaryMatch: definition ?? undefined,
    suggestedMatch: undefined,
    identifiedBy: definition ? 'user' : undefined,
    identificationFlags: definition ? [] : ['not-identified'],
    nameSuggests: undefined,
    savedAsUnknown: definition === null,
  };
}
```

and at the top of `applyBiomarkerName`:

```typescript
  // A test the AI identified or the user picked stays: only the label changes
  if (biomarker.identifiedBy === 'ai' || biomarker.identifiedBy === 'user') {
    return { ...biomarker, name, renamedInReview: true };
  }
```

`IdentificationLabels.tsx`:

```tsx
import { Badge, Group } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { IdentificationFlag, MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';

export const IDENTIFICATION_LABELS: Record<IdentificationFlag, (b: MatchedBiomarker) => string> = {
  'unit-mismatch': () => "Unit doesn't fit",
  'name-disagrees': (b) => `Name suggests ${b.nameSuggests?.name ?? 'another test'}`,
  'name-only': () => 'Matched by name only',
  'similar-name': () => 'Matched by similar name',
  'not-identified': () => 'Not identified',
};

interface IdentificationLabelsProps {
  biomarker: MatchedBiomarker;
}

/** What a value's identification needs checked, as text */
export function IdentificationLabels({ biomarker }: IdentificationLabelsProps) {
  const flags = biomarker.identificationFlags ?? [];
  if (flags.length === 0) return null;
  return (
    <Group gap={4}>
      {flags.map((flag) => (
        <Badge key={flag} size="xs" variant="light" color="yellow" leftSection={<IconAlertTriangle size={10} />}>
          {IDENTIFICATION_LABELS[flag](biomarker)}
        </Badge>
      ))}
    </Group>
  );
}
```

`SavedAsCell.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { Button, Group, Modal, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { BIOMARKER_DEFINITIONS, searchBiomarkers, type BiomarkerDefinition } from '@data/biomarkers/dictionary';
import type { MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';
import { IdentificationLabels } from './IdentificationLabels';

interface SavedAsCellProps {
  biomarker: MatchedBiomarker;
  /** A dictionary test, or null for "Not in dictionary" */
  onChoose: (definition: BiomarkerDefinition | null) => void;
}

/** The test a value will be saved as, with a list to change it */
export function SavedAsCell({ biomarker, onChoose }: SavedAsCellProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const options = useMemo(
    () => (search.trim() ? searchBiomarkers(search) : BIOMARKER_DEFINITIONS),
    [search]
  );
  const choose = (definition: BiomarkerDefinition | null) => {
    setOpen(false);
    setSearch('');
    onChoose(definition);
  };

  return (
    <Stack gap={4}>
      <Group gap="xs" wrap="nowrap">
        <Text size="sm" data-testid="saved-as">
          {biomarker.dictionaryMatch?.name ?? 'Not in dictionary'}
        </Text>
        <Button size="compact-xs" variant="subtle" onClick={() => setOpen(true)} aria-label={`Change test for ${biomarker.name}`}>
          Change
        </Button>
      </Group>
      <IdentificationLabels biomarker={biomarker} />
      <Modal opened={open} onClose={() => setOpen(false)} title={`Saved as: ${biomarker.name}`}>
        <TextInput label="Search tests" value={search} onChange={(e) => setSearch(e.currentTarget.value)} data-autofocus />
        <Stack gap={2} mt="sm" role="listbox" aria-label="Tests" mah={320} style={{ overflowY: 'auto' }}>
          <UnstyledButton role="option" aria-selected={!biomarker.dictionaryMatch} onClick={() => choose(null)}>
            Not in dictionary
          </UnstyledButton>
          {options.map((definition) => (
            <UnstyledButton key={definition.key} role="option" aria-selected={biomarker.dictionaryMatch?.key === definition.key} onClick={() => choose(definition)}>
              {definition.name}
            </UnstyledButton>
          ))}
        </Stack>
      </Modal>
    </Stack>
  );
}
```

`ReviewStep.tsx`: add `<Table.Th>Saved as</Table.Th>` after `Biomarker`, and per row after the name cell:

```tsx
<Table.Td>
  <SavedAsCell
    biomarker={biomarker}
    onChoose={(definition) => updateBiomarker(resultIndex, bioIndex, chooseTest(biomarker, definition))}
  />
</Table.Td>
```

The Continue check (replacing the renamed-only unit check):

```tsx
        // Every matched value must be in a unit of its test
        if (missing.length === 0 && b.dictionaryMatch && !unitFitsBiomarker(b.dictionaryMatch, b.unit)) {
          invalidBiomarkers.push(
            `${b.name} in "${r.fileName}": ${b.unit} is not a unit for ${b.dictionaryMatch.name}. Choose a fitting unit, another test, or "Not in dictionary".`
          );
        }
```

Rows with only a `suggestedMatch` and the flag `unit-mismatch` are also blocked: before that check add

```tsx
        if (missing.length === 0 && !b.dictionaryMatch && !b.savedAsUnknown && b.identificationFlags?.includes('unit-mismatch') && b.suggestedMatch) {
          invalidBiomarkers.push(
            `${b.name} in "${r.fileName}": ${b.unit} is not a unit for ${b.suggestedMatch.name}. Choose a fitting unit, another test, or "Not in dictionary".`
          );
        }
```

and the unit Autocomplete's onChange: when the row has the flag `unit-mismatch` and the new unit fits `suggestedMatch`, promote it (`dictionaryMatch: suggestedMatch, suggestedMatch: undefined, identificationFlags: []`). In `LabResultPersistence.resolveBiomarkerKey`, return `unknownBiomarkerKey(name)` when `savedAsUnknown` is true, before any lookup (unit test in `LabResultPersistence.test.ts`).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/utils src/components/import src/services/persistence && npx playwright test e2e/ai-biomarker-identification.spec.ts e2e/import-wizard.spec.ts e2e/unit-conversion.spec.ts --project=chromium --workers=2`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/import src/utils src/services/persistence e2e
git commit -m "feat(import): review shows and changes the test each value is saved as"
```

---

### Task 7: Learned aliases

**Files:**
- Create: `src/data/biomarkers/learnedAliases.ts`
- Test: `src/data/biomarkers/learnedAliases.test.ts`
- Modify: `src/types/index.ts` (`UserPreferences.learnedAliases?: Record<string, string>`)
- Modify: `src/contexts/PreferencesContext.tsx`, `src/hooks/usePreferences.ts` (`learnedAliases`, `learnAliases`, `removeLearnedAlias`)
- Test: `src/contexts/PreferencesContext.test.tsx`
- Modify: `src/components/import/AnalysisStep.tsx` (pass `nameFallback.learned`)
- Modify: `src/components/layout/AppShell.tsx` (learn after a successful save)
- Create: `src/components/settings/LearnedAliases.tsx`, test `LearnedAliases.test.tsx`
- Modify: `src/components/settings/SettingsPage.tsx` (tab "Biomarkers")
- Modify: `e2e/ai-biomarker-identification.spec.ts`

**Interfaces:**
- Produces:
  ```typescript
  export function learnedAliasName(name: string): string; // lower case, single spaces, trimmed
  export function lookupLearnedAlias(aliases: Readonly<Record<string, string>>, name: string): BiomarkerDefinition | undefined;
  /** The aliases after saving these values: names saved under a test are learned, "Not in dictionary" forgets */
  export function learnFromSaved(
    aliases: Readonly<Record<string, string>>,
    values: ReadonlyArray<{ name: string; key?: string; savedAsUnknown?: boolean }>
  ): Record<string, string>;
  // PreferencesState gains:
  learnedAliases: Readonly<Record<string, string>>;
  learnAliases(values: ReadonlyArray<{ name: string; key?: string; savedAsUnknown?: boolean }>): Promise<void>;
  removeLearnedAlias(name: string): Promise<void>;
  ```

- [ ] **Step 1: Write the failing E2E tests** (append to `e2e/ai-biomarker-identification.spec.ts`)

```typescript
  test('learns a name saved under a test', async ({ page }) => {
    // Scenario: A confirmed name is learned
    await analyzeReport(page, [{ name: 'Zorblatina (urine)', value: 7, unit: 'g/L', confidence: 0.95, biomarkerKey: 'urine-urea' }]);
    await saveReviewed(page);
    await analyzeReport(page, [{ name: 'Zorblatina (urine)', value: 6, unit: 'g/L', confidence: 0.95 }]);
    await expect(savedAsCell(rowFor(page, '6'))).toHaveText(/Urine Urea/);
    await expect(rowFor(page, '6').getByText('Matched by name only')).toBeVisible();
  });

  test('forgets a learned name removed in Settings', async ({ page }) => {
    // Scenario: Remove a learned name
    await analyzeReport(page, [{ name: 'Zorblatina (urine)', value: 7, unit: 'g/L', confidence: 0.95, biomarkerKey: 'urine-urea' }]);
    await saveReviewed(page);
    await removeLearnedName(page, 'zorblatina (urine)');
    await analyzeReport(page, [{ name: 'Zorblatina (urine)', value: 6, unit: 'g/L', confidence: 0.95 }]);
    await expect(savedAsCell(rowFor(page, '6'))).toHaveText(/Not in dictionary/);
  });

  test('forgets a learned name saved as not in the dictionary', async ({ page }) => {
    // Scenario: Saving as "Not in dictionary" forgets a learned name
    await analyzeReport(page, [{ name: 'Zorblatina (urine)', value: 7, unit: 'g/L', confidence: 0.95, biomarkerKey: 'urine-urea' }]);
    await saveReviewed(page);
    await analyzeReport(page, [{ name: 'Zorblatina (urine)', value: 6, unit: 'g/L', confidence: 0.95 }]);
    await changeTest(page, rowFor(page, '6'), 'Not in dictionary');
    await saveReviewed(page);
    await expect(learnedNames(page)).not.toContainText('zorblatina (urine)');
  });
```

with, in `e2e/steps/identification.steps.ts`:

```typescript
import { continueToConfirm, saveResults } from './importWizard.steps';

/** When I continue and save the reviewed values */
export async function saveReviewed(page: Page): Promise<void> {
  await continueToConfirm(page);
  await saveResults(page);
  await expect(page.getByPlaceholder('Search by lab name')).toBeVisible();
}

/** The learned names list in Settings → Biomarkers */
export function learnedNames(page: Page): Locator {
  return page.getByRole('list', { name: 'Learned names' });
}

export async function openLearnedNames(page: Page): Promise<void> {
  await page.locator('nav').getByText('Settings', { exact: true }).click();
  await page.getByRole('tab', { name: 'Biomarkers' }).click();
}

export async function removeLearnedName(page: Page, name: string): Promise<void> {
  await openLearnedNames(page);
  await learnedNames(page).getByRole('button', { name: `Remove ${name}` }).click();
  await expect(learnedNames(page)).not.toContainText(name);
}
```

(`changeTest` with `'Not in dictionary'` clicks that option.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx playwright test e2e/ai-biomarker-identification.spec.ts --project=chromium --workers=1 -g "learn|forget"`
Expected: FAIL.

- [ ] **Step 3: Write the failing unit tests**

```typescript
// src/data/biomarkers/learnedAliases.test.ts
import { describe, it, expect } from 'vitest';
import { learnFromSaved, learnedAliasName, lookupLearnedAlias } from './learnedAliases';

describe('learned aliases', () => {
  it('learns a printed name saved under a test', () => {
    expect(learnFromSaved({}, [{ name: ' Zorblatina  (urine) ', key: 'urine-urea' }])).toEqual({
      'zorblatina (urine)': 'urine-urea',
    });
  });

  it('does not learn names the dictionary already knows, or unknown keys', () => {
    expect(learnFromSaved({}, [
      { name: 'Urea (urine)', key: 'urine-urea' },
      { name: 'Zorb', key: 'unknown:zorb' },
      { name: 'Zorb', key: undefined },
    ])).toEqual({});
  });

  it('replaces a learned name with a newer test, and forgets it when saved as not in the dictionary', () => {
    const learned = { 'zorblatina (urine)': 'urine-urea' };
    expect(learnFromSaved(learned, [{ name: 'Zorblatina (urine)', key: 'urine-creatinine' }])).toEqual({
      'zorblatina (urine)': 'urine-creatinine',
    });
    expect(learnFromSaved(learned, [{ name: 'Zorblatina (urine)', savedAsUnknown: true }])).toEqual({});
  });

  it('looks a name up as it was learned, ignoring case and spacing', () => {
    expect(lookupLearnedAlias({ 'zorblatina (urine)': 'urine-urea' }, 'ZORBLATINA  (urine)')?.key).toBe('urine-urea');
    expect(lookupLearnedAlias({ 'x': 'no-such-key' }, 'x')).toBeUndefined();
    expect(learnedAliasName('  A   b ')).toBe('a b');
  });
});
```

In `PreferencesContext.test.tsx`: `learnAliases([{ name: 'Zorb (urine)', key: 'urine-urea' }])` stores `{ 'zorb (urine)': 'urine-urea' }` in `learnedAliases` and in the db preferences; `removeLearnedAlias('zorb (urine)')` removes it; a failed save restores the previous map (as for targets).

`LearnedAliases.test.tsx`: renders the learned names as a list named "Learned names", each with the test's name and a button "Remove <name>" that calls `removeLearnedAlias`; with none, says "No learned names yet."

In `analyzeLabReport` tests (identification test file): with `nameFallback.learned` returning `urine-urea` for "Zorb", the value is matched with `identifiedBy: 'name'` and `['name-only']`; with a built-in alias for the name, the built-in wins.

- [ ] **Step 4: Run them to verify they fail**

Run: `npx vitest run src/data/biomarkers/learnedAliases.test.ts src/contexts src/components/settings src/services/analysis`
Expected: FAIL.

- [ ] **Step 5: Implement**

```typescript
// src/data/biomarkers/learnedAliases.ts
/**
 * The user's own aliases: printed names they saved under a dictionary test.
 * Consulted only after the dictionary's aliases, so they never override
 * them. Stored in the (sealed) preferences record.
 */
import { findBiomarker, getBiomarkerByKey, type BiomarkerDefinition } from './dictionary';

export function learnedAliasName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function lookupLearnedAlias(
  aliases: Readonly<Record<string, string>>,
  name: string
): BiomarkerDefinition | undefined {
  const key = aliases[learnedAliasName(name)];
  return key ? getBiomarkerByKey(key) : undefined;
}

export function learnFromSaved(
  aliases: Readonly<Record<string, string>>,
  values: ReadonlyArray<{ name: string; key?: string; savedAsUnknown?: boolean }>
): Record<string, string> {
  const next = { ...aliases };
  for (const { name, key, savedAsUnknown } of values) {
    const learned = learnedAliasName(name);
    if (!learned) continue;
    if (savedAsUnknown) {
      delete next[learned];
      continue;
    }
    if (!key || !getBiomarkerByKey(key) || findBiomarker(name)?.key === key) continue;
    next[learned] = key;
  }
  return next;
}
```

`PreferencesContext`: add `learnedAliases` to `Maps` and `fromStored`; `removeLearnedAlias = (name) => setEntry('learnedAliases', learnedAliasName(name), null)`; `learnAliases(values)` computes `learnFromSaved(mapsRef.current.learnedAliases, values)`, sets it, and saves with `db.updatePreferences((stored) => ({ learnedAliases: learnFromSaved(stored?.learnedAliases ?? {}, values) }))`, restoring the previous map on failure.

`AnalysisStep.tsx`: `const { learnedAliases } = usePreferences();` and pass `nameFallback: { learned: (name) => lookupLearnedAlias(learnedAliases, name) }` to `analyzeLabReport`.

`AppShell.handleImportComplete`, after `saveImportResults` succeeds:

```typescript
        // Names saved under a test are this user's aliases from now on
        await learnAliases(
          results.flatMap((r) =>
            r.editedBiomarkers.map((b) => ({ name: b.name, key: b.dictionaryMatch?.key, savedAsUnknown: b.savedAsUnknown }))
          )
        ).catch(() => console.error('Failed to save learned names'));
```

`LearnedAliases.tsx` (Settings → Biomarkers): a `List` with `aria-label="Learned names"`, items `"<name> → <test name>"` and an `ActionIcon` `aria-label={\`Remove ${name}\`}`; empty state "No learned names yet." `SettingsPage.tsx`: tab `value="biomarkers"` label "Biomarkers" with `<LearnedAliases />`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/data src/contexts src/components src/services && npx playwright test e2e/ai-biomarker-identification.spec.ts e2e/settings.spec.ts --project=chromium --workers=2`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/data/biomarkers src/types/index.ts src/contexts src/hooks src/components e2e
git commit -m "feat(import): names saved under a test become the user's own aliases"
```

---

### Task 8: The fallback model

**Files:**
- Modify: `package.json` (`"@huggingface/transformers": "4.2.0"`, exact)
- Create: `src/services/matching/similarNames.ts`, `src/services/matching/transformersEmbedder.ts`, `src/services/matching/index.ts`, `src/services/matching/labelledNames.ts`
- Test: `src/services/matching/similarNames.test.ts`
- Create: `src/services/matching/similarNames.calibration.ts`, `vitest.calibration.config.ts`
- Modify: `src/components/import/AnalysisStep.tsx` (pass `nameFallback.similar`)
- Modify: `src/services/analysis/LabReportAnalyzer.ts` (load note, stage text)
- Modify: `vite.config.ts` (onnxruntime-web wasm self-hosted next to the OCR files, runtime caching; transformers.js in its own chunk)
- Modify: `e2e/ai-biomarker-identification.spec.ts`

**Interfaces:**
- Consumes: `NameFallback.similar` (Task 5).
- Produces:
  ```typescript
  export interface Embedder { embed(texts: string[]): Promise<number[][]> } // unit-length vectors
  export interface SimilarNameMatcher { similar(name: string): Promise<BiomarkerDefinition[]> }
  export function createSimilarNameMatcher(
    embedder: Embedder, definitions: readonly BiomarkerDefinition[], threshold: number
  ): SimilarNameMatcher;
  export function getSimilarNameMatcher(onLoading?: () => void): Promise<SimilarNameMatcher>; // lazy singleton
  export const MATCHING_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'; // or the calibration winner
  export const SIMILARITY_THRESHOLD: number; // from calibration
  export const MODEL_LOAD_NOTE = 'The matching model could not load, so names no alias knows were not identified.';
  export const MODEL_LOADING_STAGE = 'Matching model loading';
  ```

- [ ] **Step 1: Write the failing E2E test** (append)

```typescript
  test('says when the matching model cannot load', async ({ page }) => {
    // Scenario: The matching model cannot load (the fixture blocks the model host)
    await analyzeReport(page, [{ name: 'Zorblatina sierica', value: 3, unit: 'mg/dL', confidence: 0.95 }]);
    await expect(rowFor(page, '3').getByText('Not identified')).toBeVisible();
    await expect(page.getByText(/The matching model could not load/)).toBeVisible();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/ai-biomarker-identification.spec.ts --project=chromium --workers=1 -g "cannot load"`
Expected: FAIL — no note.

- [ ] **Step 3: Write the failing unit tests**

```typescript
// src/services/matching/similarNames.test.ts
import { describe, it, expect } from 'vitest';
import { createSimilarNameMatcher, type Embedder } from './similarNames';
import { getBiomarkerByKey } from '@data/biomarkers/dictionary';

/** Embeds by a fixed table: each text is a unit vector on one axis */
function tableEmbedder(axes: Record<string, number>): Embedder & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    async embed(texts) {
      calls.push(texts);
      return texts.map((t) => {
        const v = [0, 0, 0];
        v[axes[t.toLowerCase()] ?? 2] = 1;
        return v;
      });
    },
  };
}

const urea = getBiomarkerByKey('urine-urea')!;
const creatinine = getBiomarkerByKey('urine-creatinine')!;

describe('createSimilarNameMatcher', () => {
  it('returns the tests whose names mean the same, above the threshold', async () => {
    const embedder = tableEmbedder({ 'urine urea': 0, 'urea urinaria': 0, 'urine creatinine': 1 });
    const matcher = createSimilarNameMatcher(embedder, [urea, creatinine], 0.8);
    expect(await matcher.similar('Urea urinaria')).toEqual([urea]);
  });

  it('returns nothing below the threshold', async () => {
    const matcher = createSimilarNameMatcher(tableEmbedder({ 'urine urea': 0 }), [urea], 0.8);
    expect(await matcher.similar('Zorblatin')).toEqual([]);
  });

  it("embeds the dictionary's names and aliases once", async () => {
    const embedder = tableEmbedder({});
    const matcher = createSimilarNameMatcher(embedder, [urea], 0.8);
    await matcher.similar('a');
    await matcher.similar('b');
    expect(embedder.calls.filter((c) => c.length > 1)).toHaveLength(1);
  });
});
```

In `LabReportAnalyzer.identification.test.ts`: with `nameFallback.similar` resolving `[urine-urea]` for a value in g/L, the value is `identifiedBy: 'model'`, flags `['similar-name']`; in mg/dL... (a unit urine urea lists) also; in `10^9/L` (does not fit) it is `not-identified`; with `similar` rejecting, the value is `not-identified` and `warnings` contains `MODEL_LOAD_NOTE`.

- [ ] **Step 4: Run them to verify they fail**

Run: `npx vitest run src/services/matching src/services/analysis`
Expected: FAIL.

- [ ] **Step 5: Implement the matcher**

```typescript
// src/services/matching/similarNames.ts
/**
 * Tests whose names mean the same as a printed name, by a sentence
 * embedding model: the fallback for names no alias knows. The unit check
 * happens in the analyzer.
 */
import type { BiomarkerDefinition } from '@data/biomarkers/dictionary';

export interface Embedder {
  /** One unit-length vector per text */
  embed(texts: string[]): Promise<number[][]>;
}

export interface SimilarNameMatcher {
  /** Tests above the threshold, closest first */
  similar(name: string): Promise<BiomarkerDefinition[]>;
}

function dot(a: number[], b: number[]): number {
  return a.reduce((sum, x, i) => sum + x * b[i], 0);
}

export function createSimilarNameMatcher(
  embedder: Embedder,
  definitions: readonly BiomarkerDefinition[],
  threshold: number
): SimilarNameMatcher {
  const entries = definitions.flatMap((d) => [d.name, ...d.aliases].map((text) => ({ text, definition: d })));
  let vectors: Promise<number[][]> | undefined;

  return {
    async similar(name) {
      vectors ??= embedder.embed(entries.map((e) => e.text));
      const [query] = await embedder.embed([name]);
      const best = new Map<string, { definition: BiomarkerDefinition; score: number }>();
      (await vectors).forEach((vector, i) => {
        const score = dot(query, vector);
        const { definition } = entries[i];
        if (score >= threshold && score > (best.get(definition.key)?.score ?? -Infinity)) {
          best.set(definition.key, { definition, score });
        }
      });
      return [...best.values()].sort((a, b) => b.score - a.score).map((b) => b.definition);
    },
  };
}
```

```typescript
// src/services/matching/transformersEmbedder.ts
/**
 * The embedding model in the browser. Imported only when first needed, so
 * transformers.js and the model stay out of the app's start-up. The model
 * is downloaded once and kept in the browser's cache for offline use.
 */
import type { Embedder } from './similarNames';

export async function loadTransformersEmbedder(model: string): Promise<Embedder> {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  env.backends.onnx.wasm!.wasmPaths = `${import.meta.env.BASE_URL}onnx/`;
  const extract = await pipeline('feature-extraction', model, { dtype: 'q8' });
  return {
    async embed(texts) {
      const output = await extract(texts, { pooling: 'mean', normalize: true });
      return output.tolist() as number[][];
    },
  };
}
```

```typescript
// src/services/matching/index.ts
import { BIOMARKER_DEFINITIONS } from '@data/biomarkers/dictionary';
import { createSimilarNameMatcher, type SimilarNameMatcher } from './similarNames';
import { loadTransformersEmbedder } from './transformersEmbedder';

export const MATCHING_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
/** Calibrated on labelledNames (similarNames.calibration.ts) */
export const SIMILARITY_THRESHOLD = 0.8;
export const MODEL_LOADING_STAGE = 'Matching model loading';
export const MODEL_LOAD_NOTE =
  'The matching model could not load, so names no alias knows were not identified.';

let matcher: Promise<SimilarNameMatcher> | undefined;

/** The matcher, loading the model on first use; a failed load is retried next time */
export function getSimilarNameMatcher(onLoading?: () => void): Promise<SimilarNameMatcher> {
  if (!matcher) {
    onLoading?.();
    matcher = loadTransformersEmbedder(MATCHING_MODEL)
      .then((embedder) => createSimilarNameMatcher(embedder, BIOMARKER_DEFINITIONS, SIMILARITY_THRESHOLD));
    matcher.catch(() => {
      matcher = undefined;
    });
  }
  return matcher;
}

export type { Embedder, SimilarNameMatcher } from './similarNames';
```

In `LabReportAnalyzer.matchBiomarkerToDictionary`, the model step catches a failure:

```typescript
  let similar: BiomarkerDefinition | undefined;
  try {
    similar = (await fallback.similar?.(biomarker.name))?.find(fits);
  } catch {
    modelFailed = true; // a flag the caller passes in (an object { failed: boolean }) so analyzeLabReport adds MODEL_LOAD_NOTE once
  }
```

(implement `modelFailed` as a `{ failed: boolean }` object created per analysis and passed to every call; after matching, `if (state.failed) warnings.push(MODEL_LOAD_NOTE)`; import `MODEL_LOAD_NOTE` from `@services/matching`.)

`AnalysisStep.tsx`: `similar: async (name) => (await getSimilarNameMatcher(() => onProgress(MODEL_LOADING_STAGE, 0.9))).similar(name)` inside `nameFallback`.

- [ ] **Step 6: Self-host the ONNX runtime files**

In `vite.config.ts`, add to the static copy targets `{ src: 'node_modules/onnxruntime-web/dist/*.wasm', dest: 'onnx' }` (and the matching `.mjs` loaders the installed version ships, `ort-wasm-simd-threaded*.mjs`), runtime caching `{ urlPattern: ({ url }) => url.pathname.startsWith(\`${base}onnx/\`), handler: 'CacheFirst', options: { cacheName: 'onnx-runtime' } }`, and `globIgnores` for `onnx/**` so they are not precached. Run `npm run build` and check `dist/onnx/` holds the wasm files.

- [ ] **Step 7: Calibrate on the labelled names**

```typescript
// src/services/matching/labelledNames.ts
/**
 * Printed names seen in real reports, with the test each is (or null when
 * none is). Names only: no values. Used to calibrate the fallback model.
 */
export const LABELLED_NAMES: ReadonlyArray<[name: string, key: string | null]> = [
  ['Urea/L (urine)', 'urine-urea'],
  ['Creatinina/L (urine)', 'urine-creatinine'],
  ['U-Creatinina 24h', '24-hour-urine-creatinine'],
  ['Neutrofili', 'neutrophils'],
  ['Linfociti', 'lymphocytes'],
  ['Reticolociti', 'reticulocytes'],
  ['Acido urico', 'uric-acid'],
  ['Ferro', 'serum-iron'],
  ['Vitamina D (25-OH)', 'vitamin-d'],
  ['Albumina/creatinina (urine)', 'albumin-creatinine-ratio'],
  ['Glicemia', 'glucose'],
  ['Emoglobina glicata', 'hemoglobin-a1c'],
  ['Colesterolo totale', 'total-cholesterol'],
  ['Trigliceridi', 'triglycerides'],
  ['Durata raccolta', null],
  ['Diuresi', 'urine-volume'],
  ['U-Sodio 24h', null],
  ['Zorblatin', null],
];
```

(Extend the list from the dictionary aliases the reports used; keep names only.)

```typescript
// src/services/matching/similarNames.calibration.ts
import { it, expect } from 'vitest';
import { BIOMARKER_DEFINITIONS } from '@data/biomarkers/dictionary';
import { createSimilarNameMatcher } from './similarNames';
import { loadTransformersEmbedder } from './transformersEmbedder';
import { MATCHING_MODEL, SIMILARITY_THRESHOLD } from './index';
import { LABELLED_NAMES } from './labelledNames';

it('files at least 85% of labelled names right and never one the dictionary lacks', async () => {
  const matcher = createSimilarNameMatcher(await loadTransformersEmbedder(MATCHING_MODEL), BIOMARKER_DEFINITIONS, SIMILARITY_THRESHOLD);
  let right = 0;
  for (const [name, key] of LABELLED_NAMES) {
    const [first] = await matcher.similar(name);
    if ((first?.key ?? null) === key) right++;
    if (key === null) expect(first, name).toBeUndefined();
  }
  expect(right / LABELLED_NAMES.length).toBeGreaterThanOrEqual(0.85);
}, 300_000);
```

`vitest.calibration.config.ts` extends `vitest.config.ts` with `test.include: ['src/**/*.calibration.ts']` and `environment: 'node'`. Run: `npx vitest run --config vitest.calibration.config.ts`. Try both `Xenova/paraphrase-multilingual-MiniLM-L12-v2` and `Xenova/multilingual-e5-small` (prefix texts with `query: ` / `passage: ` for e5); set `MATCHING_MODEL` and `SIMILARITY_THRESHOLD` to the best pair (the highest threshold at which the accuracy bar holds and no `null` name matches). Record both results in the commit message. Both models are 118 MB quantized (q8), a little above the spec's "~100 MB": note it to the user.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/services && npx playwright test e2e/ai-biomarker-identification.spec.ts --project=chromium --workers=1`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/services/matching src/services/analysis src/components/import vite.config.ts vitest.calibration.config.ts e2e
git commit -m "feat(import): a small in-browser model matches names no alias knows"
```

---

### Task 9: Documentation and the whole-branch gates

**Files:**
- Modify: `docs/ARCHITECTURE.md` (AI integration: identification by key, the fallback chain, learned aliases, the matching model and its caching)
- Modify: `features/ai-biomarker-identification.feature` (only if a scenario's wording no longer matches the behaviour)

- [ ] **Step 1: Update ARCHITECTURE.md** — a subsection "Biomarker identification" under AI integration describing: the test list in the prompt; the analyzer's rules and flags; learned aliases in the sealed preferences; the fallback model (lazy, cached, self-hosted ONNX runtime, model from Hugging Face, no report data sent).

- [ ] **Step 2: Run every gate**

Run:
```bash
npm run build && npm run lint && npx vitest run --maxWorkers=4
npx playwright test --workers=2
```
Expected: build and lint pass; vitest all pass with no console output; Playwright all projects pass (the Firefox offline OCR check skipped as before).

- [ ] **Step 3: Commit**

```bash
git add docs/ARCHITECTURE.md features
git commit -m "docs(architecture): biomarker identification, learned aliases and the matching model"
```
