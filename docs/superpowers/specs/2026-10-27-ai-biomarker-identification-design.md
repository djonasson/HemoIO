# AI Biomarker Identification — Design

**Date:** 2026-10-27
**Status:** Design approved in conversation; written spec awaiting review

## Goal

Import should file every value under the right dictionary test, whatever the
language or naming of the lab ("match as much as possible, ideally
everything, correctly"). A wrong match is worse than no match: when the app
is unsure it says so in review instead of guessing silently.

## Why

Today the app identifies a test from the name the AI copied off the report,
with exact aliases and a few patterns ("(urine, 24h)", "(%)"). Labs and even
two runs of the same AI name the same test differently ("Creatinina/L (urine
24h)", "U-Creatinina/L", "Creatinina (urine, 24h)" for one concentration).
Three review rounds of a pattern-based matcher showed that every new pattern
misfiles other values. The AI already reads the whole report — headings such
as "Raccolte urinarie temporizzate", the units, neighbouring rows — so it
should identify the test, and the app should check its answer.

## Decisions

| Topic | Decision |
|---|---|
| Approach | One call: the extraction prompt carries the dictionary's test list; the AI returns a key per value |
| Test list line | `key: Name [specimen; units]`, e.g. `urine-creatinine: Urine Creatinine [urine; mg/dL, µmol/L, g/L, mmol/L]` (~2,000 tokens for 117 tests) |
| Review control | "Saved as" column: the test as text, a "Change" button opens a searchable list with "Not in dictionary" |
| Row labels | "Unit doesn't fit", "Name suggests <test>", "Matched by name only", "Matched by similar name", "Not identified" — text, never colour alone |
| Editing the printed name | Keeps an AI-identified or user-picked test; rows matched by name or with no test re-match as today |
| Continue | Blocked while a row's unit does not fit its test; the message offers a fitting unit, another test, or "Not in dictionary" |
| Ollama context | Requested size from the prompt's estimated length plus room for the answer |
| Model gives no keys | Note in Analysis Notes ("This model did not identify the tests; they were matched by name. Check the Saved as column.") plus row labels |
| Fallback (no usable AI key) | Exact aliases, then learned aliases, then a small in-browser model matching by meaning; the unit check guards each |
| Learned aliases | Printed names saved under a test become this user's aliases, stored encrypted on this device only; built-in aliases are still added in code |
| Fallback model | A small multilingual embedding model (~100 MB), downloaded on first need and cached for offline use |
| Scope | One spec, one plan: AI identification, learned aliases and the fallback model |
| Saved data | Out of scope: in development, no migration or backwards compatibility |

## Components

### 1. Test list for the prompt (`src/services/ai/prompts.ts`)

- `buildTestList(definitions): string` — one line per dictionary entry as in
  the table above, in dictionary order. Pure; unit-tested.
- The system prompt gains a section "KNOWN TESTS" with the list and the
  instruction: set `biomarkerKey` to the key of the test each value is,
  judging by the report's headings, specimen, collection (spot or 24-hour),
  and the unit (a concentration or an amount per day, a count or a
  percentage); use `null` when none fits; never invent a key.
- The existing naming guidance stays: `name` is still the name as printed.

### 2. Extraction format (`src/services/ai/types.ts`, one shared parser)

- `ExtractedBiomarker.biomarkerKey?: string` — absent when the model gave
  none or `null`.
- A shared helper reads it from each provider's parsed JSON (string, trimmed;
  anything else is absent), so OpenAI, Anthropic and Ollama parse it alike.

### 3. Ollama context size (`src/services/ai/OllamaProvider.ts`)

- Estimate tokens of system prompt + report text (characters ÷ 3.5, rounded
  up), add the response budget (`maxTokens`), round up to a multiple of
  1024, and send it as the context size.
- The provider calls Ollama's OpenAI-compatible endpoint, which may ignore a
  context option; the plan verifies against Ollama's API which endpoint and
  field honour it (native `/api/chat` with `options.num_ctx` if needed).

### 4. Identification in the analyzer (`src/services/analysis/LabReportAnalyzer.ts`)

For each extracted value, first that applies:

1. **AI key, known and the unit fits** (listed or convertible to the
   standard unit): the match. `identifiedBy: 'ai'`.
2. **AI key, known but the unit does not fit:** a proposal only
   (`suggestedMatch`), flag `unit-mismatch`.
3. **No usable AI key** (absent, unknown key): the fallback decides, first
   that matches with a fitting unit:
   1. today's name matching (exact aliases, the share and 24-hour pairs);
   2. a learned alias (component 6);
   3. the fallback model (component 7).

   A match by 1 or 2 gets `identifiedBy: 'name'` and flag `name-only`; by 3,
   `identifiedBy: 'model'` and flag `similar-name`; no match gets no
   `identifiedBy` and flag `not-identified`.

When rule 1 applies and the printed name is an exact alias of a different
test, the AI's key wins and the row gets flag `name-disagrees` with that
test. Deduplication (one value per test reported in two units) and saving are
unchanged: they use the chosen test.

`MatchedBiomarker` gains `identifiedBy?: 'ai' | 'name' | 'model' | 'user'` and
`identificationFlags: IdentificationFlag[]`. When no extracted value of a
report has an AI key, the analysis adds the note above to its warnings.

### 5. Review (`src/components/import/ReviewStep.tsx` and helpers)

- **Saved as** column: the chosen test's name, or "Not in dictionary", with a
  "Change" button (accessible name "Change test for <printed name>") opening
  a searchable list of all dictionary tests plus "Not in dictionary".
  Picking sets the match, `identifiedBy: 'user'`, clears the flags, and the
  unit choices follow the test.
- **Labels** next to it, as text with an icon, for each flag.
- **Editing the printed name:** with `identifiedBy` `ai` or `user`, only the
  label changes; with `name` or no test, the row re-matches by name as today.
- **Continue:** blocked while any row's unit does not fit its chosen test;
  the per-row message names the three ways out.
- Everything else in review is unchanged.

### 6. Learned aliases (`src/data/biomarkers/learnedAliases.ts`, preferences)

- When a reviewed import is saved, each value saved under a dictionary test
  whose printed name is not already an alias of that test teaches the alias
  printed name → test key. A later import of the same name finds it in the
  fallback.
- Stored in the user's preferences record (sealed, so encrypted at rest) as
  a map from the normalised name (the dictionary's own case and spacing
  rules) to a key; a newer save of the same name replaces it. Saving a
  value as "Not in dictionary" removes that name's learned alias.
- Learned aliases never override the built-in ones: they are consulted only
  after exact aliases (rule 3).
- Settings → Biomarkers lists the learned aliases, each removable.

### 7. Fallback model (`src/services/matching/`)

- A small multilingual sentence-embedding model, run in the browser
  (transformers.js on WebAssembly/WebGPU); the plan picks the model by
  measured accuracy on a labelled list of printed names (Italian and
  English, from the reports seen so far) and size (~100 MB or less).
- Downloaded the first time a value needs it, from the model host, and
  cached by the service worker like the OCR files, so it works offline
  afterwards. Only the model is downloaded; no report data leaves the
  device. While it loads, review shows "Matching model loading".
- The dictionary's names and aliases are embedded once and cached, keyed by
  the dictionary's content, so a dictionary change rebuilds them.
- A printed name (with its specimen qualifier) is embedded and compared to
  them; the closest test is a match only above a similarity threshold the
  plan calibrates on the labelled list, and only when the value's unit fits
  it. Otherwise the value is not identified.
- A failed download or load is not fatal: the value is not identified, and
  the analysis notes say the matching model could not load.

## Data flow

Report text → prompt with test list → AI JSON (name, value, unit, …,
`biomarkerKey`) → shared parser → analyzer identification (rules 1–3, flags)
(fallback: exact aliases → learned aliases → fallback model) →
deduplication → review (Saved as, labels, Change) → save under the chosen
key, or the unknown key of the printed name → learn aliases from the saved
values.

## Error handling

- Unknown or malformed keys are treated as absent (rule 3); never trusted.
- A provider that cannot follow the list still works: name matching, with the
  note and labels telling the user to check.
- The API key is never part of the prompt's test list, labels or notes.

## Testing

Per CLAUDE.md: Gherkin first, then E2E, then unit tests; TDD.

- **Gherkin** (`features/ai-biomarker-identification.feature`): AI key used;
  unit does not fit; name disagrees; model gives no keys; change the test in
  review; editing the name keeps the test; Continue blocked with the three
  ways out; a confirmed name is learned and matched next time, and can be
  removed in Settings; a name matched by the fallback model; the model
  failing to load.
- **E2E** (`e2e/ai-biomarker-identification.spec.ts`, steps in `e2e/steps/`):
  mocked Ollama returning keys; the Saved as column and labels; Change;
  Continue blocking; the saved test as shown in Trends.
- **Unit:** `buildTestList`; the prompt contains it; the shared key parser;
  analyzer rules 1–3 and flags (with the real dictionary); the no-keys note;
  Ollama context size; review helpers and ReviewStep behaviour; learning,
  replacing and removing aliases; the fallback model's matching with a
  stubbed embedder (threshold, unit check, load failure).
- **Model calibration:** a test that runs the chosen model over the labelled
  list and checks its accuracy; it downloads the model, so it runs on demand,
  not in the default suite. E2E serves a stub embedder instead of the real
  model.

## Out of scope

- Re-identifying or changing the test of saved values (a later design).
- Sending the dictionary's aliases to the AI.
- Sharing learned aliases between users or devices, or exporting them.
- Changing how values are deduplicated or saved.
