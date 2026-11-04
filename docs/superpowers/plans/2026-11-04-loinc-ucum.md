# LOINC and UCUM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Identify every imported value by a LOINC code and read its unit as UCUM. This replaces the hand-kept biomarker dictionary, so a report from a new lab imports with no code change.

**Architecture:**
- A build-time script turns the local LOINC release into a committed, lazy-loaded catalog of about 18,000 common lab tests, with English and Italian names, units and groups.
- Matching runs in three steps: a local search over that catalog, filtered by the property the UCUM unit implies and by the sample type; then the AI choosing among candidates; then the user. Choices are learned on save.
- A small add-on table keyed by LOINC code keeps our ranges, descriptions and units. Conversions are keyed by the LOINC component, the substance.

**Tech Stack:** React 19, TypeScript strict, Mantine 8, Dexie (encrypted records), Vitest, Playwright, Node 24 for scripts, `@lhncbc/ucum-lhc`.

**Spec:** `docs/superpowers/specs/2026-11-04-loinc-ucum-design.md`

## Global Constraints

- Never contact loinc.org from code, tests or tooling. Only the user runs `npm run loinc:download`.
- LOINC input lives in `~/loinc/<version>/files` (now `/home/daniel/loinc/2.83/files`). Tests use small fixtures cut from it into `scripts/__fixtures__/loinc/`.
- Never run prettier.
- Never commit `test-data/2019-02-18.pdf` or any real report or its text.
- CLAUDE.md applies:
  - Gherkin first, then E2E (with `// Scenario:` comments, steps in `e2e/steps/`), then co-located unit tests;
  - the layer rules;
  - EAA/WCAG AA;
  - never log health data or keys;
  - conventional commits ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No backwards compatibility: the database starts empty, and old backups are refused with a clear message.
- Keep the LOINC notice (README, Settings → About), and show each code with its LOINC long common name.
- Add the UCUM notice that the library's and UCUM's terms require.
- Field name: values keep the stored field `biomarkerKey`, now holding a LOINC code (`"2345-7"`) or `unknown:<nameKey>` for "not a LOINC test". This limits churn across about 60 consumers.
- Gates before the branch closes:
  - `npm run build`
  - `npm run lint`
  - noise-free `npx vitest run --maxWorkers=4`
  - `npx playwright test --workers=2` on all four projects
  - the simplify, code-review and security-review skills.
- Work on branch `feature/loinc-ucum` from main. Commit per task. Run the full gate once at the end, unless a task says otherwise.

## Review Focus

1. **A value with no unit or an unreadable unit**, such as "Proteine < 15" or "/campo". It must not be matched on name alone to a quantitative code with a different property. It goes to the AI or the user with candidates of any property. (Task 4 test `unitless value is never auto-matched`.)
2. **A sample prefix that is also part of a name**: "S-" in "S-AFP" versus "Sodio". Prefix stripping must only take known prefixes followed by "-" or ".". (Task 4 test `strips only known sample prefixes`.)
3. **Two values of one report resolving to the same code**: the serum and 24-hour urine forms of one substance. They must stay separate codes, not merge, because the system differs. (Task 4 test `urine-24h and serum forms resolve to different codes`.)
4. **The AI returning a code that wasn't in its candidate list, or malformed JSON.** It must be ignored, and the value goes to the user. (Task 5 test `rejects a code outside the candidates`.)
5. **The catalog failing to load** (a chunk fetch error offline before it was cached). The app must say so and offer a retry instead of a blank page. (Task 3 test `shows an error with retry when the catalog cannot load`.)

---

### Task 1: Catalog generator

**Files:**
- Create: `scripts/loinc-catalog.mjs`, `scripts/loinc-catalog.test.ts`, `scripts/__fixtures__/loinc/` (a mini `Loinc.csv`, `itIT16LinguisticVariant.csv`, `Group.csv`, `ParentGroup.csv` and `GroupLoincTerms.csv` with about 15 real rows each: glucose serum, blood, urine and 24-hour urine, mass and molar; hemoglobin; neutrophils count and %; one inactive row; one CLASSTYPE 2 row; one row without a rank)
- Create (generated, committed): `src/data/loinc/catalog.generated.json`
- Modify: `package.json`, adding the script `"loinc:catalog": "node scripts/loinc-catalog.mjs"`; `docs/LOINC.md`, adding the update steps (download → catalog → commit)

**Interfaces:**
- Produces: the JSON shape (also the TS types in Task 3):

```ts
interface CatalogTest {
  code: string; name: string; shortName: string;     // LONG_COMMON_NAME, SHORTNAME
  component: string; property: string; system: string; scale: string; method: string;
  classCode: string;                                   // CLASS, e.g. "CHEM", "HEM/BC", "UA"
  names: string[];  // English COMPONENT, related names, short name, Italian COMPONENT and RELATEDNAMES2: all nameKey-normalised and de-duplicated
  units: string[];  // EXAMPLE_UCUM_UNITS split on ";"
  rank: number;     // COMMON_TEST_RANK
  groups: string[]; // GroupIds
}
interface CatalogGroup { id: string; parentId: string; parentName: string; name: string }
interface CatalogFile { version: string; tests: CatalogTest[]; groups: CatalogGroup[] }
```

- CLI: `node scripts/loinc-catalog.mjs [--from <files dir>] [--out <path>]`. By default it reads the latest complete version under `~/loinc`, the same rule as `latest_local` in `loinc-download.sh`.

- [ ] **Step 1: Write failing tests** in `scripts/loinc-catalog.test.ts` that call the exported `buildCatalog(dir: string): CatalogFile` on the fixtures:
  - `keeps only active laboratory codes with a common-test rank`: the inactive, CLASSTYPE 2 and unranked rows are absent.
  - `adds Italian names`: `tests.find(t => t.code === '2345-7').names` contains `'glucosio'`.
  - `lists example UCUM units`: 2345-7 has `units` containing `'mg/dL'`.
  - `links groups`: 2345-7 `groups` contains its fixture group id, and `groups` has its parent name.
  - `reads the version from the folder`: `version === '2.83'`.
- [ ] **Step 2: Run** `npx vitest run scripts/loinc-catalog.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `buildCatalog` and the CLI in `scripts/loinc-catalog.mjs`.
  - Use a streaming CSV parser written inline (quoted fields, `""` escapes). No new dependency.
  - Normalise names the same way as `nameKey` in `src/data/biomarkers/dictionary.ts`: NFC, lowercase, collapsed spaces. Duplicate that logic in the script and say why in a comment: the script is plain Node.
  - Write sorted, minified JSON.
- [ ] **Step 4: Run tests**. Expected: PASS. Then run `npm run loinc:catalog` and check the generated file: about 18k tests and a size noted in the commit message. Over 4 MB gzip, split it by `classCode` into `catalog.<class>.generated.json` and note that in `docs/LOINC.md`.
- [ ] **Step 5: Commit** `feat(loinc): generate the app's LOINC catalog from the local release`.

### Task 2: UCUM layer

**Files:**
- Modify: `package.json` (add `@lhncbc/ucum-lhc`, exact version). Read its LICENSE in `node_modules` and record the license in the commit body. If it needs a notice, add it to `README.md` Third-Party Notices and `src/components/settings/AboutSettings.tsx`, with a scenario line in `features/settings.feature` and an assertion in the existing About test in `e2e/settings.spec.ts`.
- Create: `src/services/units/ucum.ts`, `src/services/units/ucum.test.ts`
- Keep: `src/utils/unitSpelling.ts` (lab spellings → canonical spellings)

**Interfaces:**
- Produces:
  - `toUcum(printed: string): string | null`: our spelling layer (`normalizeUnitForLookup`) first, then mapping to UCUM syntax ("10^9/L" → "10*9/L", "mcg" → "ug", "/100 WBC" → "/100{WBCs}", "%" → "%"), then validation by ucum-lhc. Null if invalid.
  - `ucumProperties(ucum: string): string[]`: the LOINC properties a unit implies, decided from the unit's dimension:
    - mass/volume → `['MCnc']`
    - amount/volume → `['SCnc']`
    - count/volume → `['NCnc']`
    - catalytic/volume (U/L) → `['CCnc']`
    - `%` → `['NFr', 'MFr', 'VFr', 'SFr', 'Ratio']`
    - mass/time → `['MRat']`
    - amount/time → `['SRat']`
    - arbitrary units ([IU]/L, {index}) → `['ACnc', 'Ratio', 'Titr']`
    - unitless `1` → `['SpGrav', 'Ratio', 'pH']`
    - `/[HPF]`, `{cells}/[HPF]` → `['Naric', 'NCnc']`
    - unknown → `[]`
  - `convertUcum(value: number, from: string, to: string): number | null`: same-dimension conversion only (mg/dL→g/L). Mass↔molar stays in `services/units/conversion.ts`.
  - `isMassAndMolar(a: string, b: string): boolean`: one is mass and the other amount concentration.

- [ ] **Step 1: Write failing tests**:
  - `toUcum` table: `'mg/dl'→'mg/dL'`, `'mmol/l'→'mmol/L'`, `'10^9/L'→'10*9/L'`, `'x10³/µL'→'10*3/uL'`, `'µg/L'→'ug/L'`, `'mg/gcr'→'mg/g'`, `'/100WBC'→'/100{WBCs}'`, `'U/L'→'U/L'`, `'/campo'→null`, `''→null`.
  - `ucumProperties` table: `mg/dL→MCnc`, `mmol/L→SCnc`, `10*9/L→NCnc`, `U/L→CCnc`, `%` contains `NFr`, `g/(24.h)→MRat`.
  - `convertUcum(100, 'mg/dL', 'g/L') === 1`; `convertUcum(1, 'mg/dL', 'mmol/L') === null`.
- [ ] **Step 2: Run** `npx vitest run src/services/units/ucum.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** with `UcumLhcUtils.getInstance()`: `validateUnitString`, `convertUnitTo`, and `getSpecifiedUnit` to read the dimension. Import it lazily if it is over 300 KB gzip, and note the size in the commit.
- [ ] **Step 4: Run tests.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(units): read and convert units as UCUM`.

### Task 3: Catalog runtime, add-ons, conversions by substance

**Files:**
- Create:
  - `src/data/loinc/catalog.ts`, `src/data/loinc/catalog.test.ts`
  - `src/data/loinc/addons.ts`, `src/data/loinc/addons.test.ts`
  - `src/contexts/CatalogContext.tsx`, `src/contexts/CatalogContext.test.tsx`
- Modify:
  - `src/services/units/definitions.ts`: re-key `UNIT_CONVERSIONS` by LOINC component (`'Glucose'`, `'Cholesterol'` …), and drop alias matching.
  - `src/services/units/conversion.ts`, `displayUnit.ts`, `convertMeasurement.ts`, `unitFit.ts`: take `component: string` where they took a biomarker name.
  - `src/data/biomarkers/loinc.ts`: `loincName` reads the catalog, and `LOINC_VERSION` comes from it.
  - `src/App.tsx` (or the unlocked shell): wrap it in `CatalogProvider`.

**Interfaces:**
- Consumes: `CatalogFile` (Task 1); `toUcum`, `ucumProperties` (Task 2).
- Produces:
  - `loadCatalog(): Promise<Catalog>`, which uses `import('./catalog.generated.json')` and is memoised.
  - `interface Catalog { version: string; test(code: string): CatalogTest | undefined; search(query: string, filter?: { properties?: string[]; systems?: string[] }): CatalogTest[]; trendGroup(code: string): string; classLabel(classCode: string): string; groupCodes(trendGroup: string): string[] }`
    - `search` scores the `names` of each test. Exact matches score 1, token overlap scores below 1. Results are sorted by score, then `rank`.
    - `trendGroup` returns the GroupId of the group whose parent joins mass and molar (parent name contains `ROLLUP:` and its `SAME:` part has no `Prop`). Otherwise it returns the group joining sample types (`ANYBldSerPl`). Otherwise it returns the code itself.
    - `classLabel` maps LOINC class codes to readable names: CHEM→Chemistry, HEM/BC→Hematology, UA→Urinalysis, SERO→Serology, COAG→Coagulation, DRUG/TOX→Drugs and toxicology, MICRO→Microbiology, FERT→Fertility, else the code.
  - `interface TestAddon { description?: string; referenceRange?: { low?: number; high?: number; unit: string }; canonicalUnit?: string; alternativeUnits?: string[]; highIndication?: string; lowIndication?: string }`
  - `getAddon(catalog: Catalog, code: string): TestAddon | undefined`: looks up the code first, then its `trendGroup`.
  - `TEST_ADDONS: Record<string, TestAddon>`: the existing 107 dictionary entries' ranges, descriptions and units, keyed by their LOINC codes. These are the codes pinned in `src/data/biomarkers/loinc.test.ts`.
  - `useCatalog(): Catalog`: throws if used outside the provider. `CatalogProvider` shows a `Loader` while loading, and on failure an `Alert` "Test catalog could not be loaded" with a "Try again" button.
  - `convertValue(component: string, value, from, to, precision?)` and the other conversion functions keep their shapes, with the `component` argument.

- [ ] **Step 1: Write failing tests**, all with a fixture catalog built from Task 1's fixtures:
  - `test('2345-7').name` is the long common name;
  - `search('glucosio', { properties: ['MCnc'] })[0].code === '2345-7'`;
  - `trendGroup('2345-7') === trendGroup('<molar glucose code in fixture>')`;
  - `trendGroup` of a code in no group is the code itself;
  - `classLabel('HEM/BC') === 'Hematology'`;
  - `getAddon` falls back to the group entry;
  - every key of `TEST_ADDONS` is a code in the real generated catalog;
  - every addon `referenceRange.unit` passes `toUcum`;
  - `convertValue('Glucose', 100, 'mg/dL', 'mmol/L')` ≈ 5.55;
  - `CatalogContext`: `shows an error with retry when the catalog cannot load` (mock `loadCatalog` to reject, then resolve on retry).
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** Build the search index once per load: a Map from each name token to its tests. Do not log the queries, because they are health data.
- [ ] **Step 4: Run** `npx vitest run src/data/loinc src/services/units src/contexts/CatalogContext.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(loinc): catalog runtime, add-on ranges and descriptions, conversions by substance`.

### Task 4: Local matcher

**Files:**
- Create: `src/services/analysis/loincMatch.ts`, `src/services/analysis/loincMatch.test.ts`

**Interfaces:**
- Consumes: `Catalog` (Task 3), `toUcum`, `ucumProperties` (Task 2).
- Produces:

```ts
interface PrintedValue { name: string; unit: string; specimenHint?: string } // hint from report section/AI ("urine", "24h urine")
interface Candidate { code: string; name: string; score: number }
type LocalMatch =
  | { status: 'match'; code: string; candidates: Candidate[] }
  | { status: 'ambiguous' | 'none'; candidates: Candidate[] }; // up to 8 candidates
function matchLocally(catalog: Catalog, value: PrintedValue, learned?: (key: string) => string | undefined): LocalMatch;
function learnedKey(value: PrintedValue): string; // `${nameKey(name)}|${toUcum(unit) ?? nameKey(unit)}`
function splitSamplePrefix(name: string): { name: string; systems?: string[] };
```

- Rules:
  - A learned key wins.
  - `splitSamplePrefix` knows these prefixes, each followed by "-", "." or ":":

    | Prefix | Systems |
    |---|---|
    | S, Se | Ser, Ser/Plas |
    | P, Pl | Plas, Ser/Plas |
    | Sg, B | Bld |
    | U | Urine |
    | dU, U24 | 24H urine |

    Also "U-Esame standard", plus the words "urine", "urinario", "24h" and "24 ore" anywhere in the name.
  - Without a sample hint, the systems are `Ser/Plas`, `Ser`, `Plas`, `Bld`.
  - The unit gives the properties. With no readable unit, nothing is filtered and the result is never `match`.
  - The result is `match` only if the top candidate's score is at least `MATCH_SCORE = 0.9` and beats the second by `MATCH_MARGIN = 0.15`. Both are exported constants, tuned in Task 9.

- [ ] **Step 1: Write failing tests** against the fixture catalog, using made-up Italian report wordings:
  - `'P-Glucosio' mg/dL → match 2345-7`
  - `'Glucosio' mmol/L → match <molar code>`
  - `'Glucosio' in urine (hint 'urine') mg/dL → urine code`
  - `urine-24h and serum forms resolve to different codes`
  - `strips only known sample prefixes` (`'S-AFP'` → system Ser; `'Sodio'` unchanged)
  - `unitless value is never auto-matched` (`'Proteine'`, unit `''` → status ≠ 'match', candidates non-empty)
  - `'Neutrofili' % → NFr code, 10^9/L → NCnc code`
  - `a learned key wins`
  - `no candidate → status 'none'`
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(analysis): match printed tests to LOINC locally by name, unit and sample`.

### Task 5: AI chooses among candidates

**Files:**
- Modify:
  - `src/services/ai/types.ts`: add to `AIProvider`

    ```ts
    chooseTests(requests: TestChoiceRequest[]): Promise<TestChoice[]>;
    interface TestChoiceRequest { id: string; name: string; unit: string; specimenHint?: string; candidates: Candidate[] }
    interface TestChoice { id: string; code: string | null; confident: boolean }
    ```
  - `src/services/ai/prompts.ts`: remove `IDENTIFICATION_CONTEXT` and the KNOWN TESTS list from extraction, so extraction returns name, value, unit, range and `specimenHint` (rename `biomarkerKey` in `RESPONSE_SCHEMA` to `specimenHint: string|null`). Add `TEST_CHOICE_SYSTEM_PROMPT` and `createTestChoicePrompt(requests)` with a JSON schema `{choices:[{id, code|null, confident}]}`.
  - The three providers implement `chooseTests` with one batched call per report.
  - Delete `src/services/ai/testList.ts` and `src/services/ai/biomarkerKey.ts` with their tests.
- Test: the providers' existing test files and `prompts.test.ts`.

**Interfaces:**
- Consumes: `Candidate` (Task 4).
- Produces: `chooseTests` as above. Parsing is `parseTestChoices(raw: unknown, requests): TestChoice[]` in `src/services/ai/testChoice.ts`, shared by all providers.

- [ ] **Step 1: Write failing tests** for `parseTestChoices`:
  - `keeps a choice from the candidates`;
  - `rejects a code outside the candidates` (→ code null, confident false);
  - `treats malformed JSON as no choice for every request`;
  - `keeps ids that were asked about only`.

  Provider tests: `chooseTests sends one request per report with every candidate's code and name` (mock fetch, assert the body).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** The prompt tells the model to choose only from the listed codes or null, and to set `confident` false when two candidates fit.
- [ ] **Step 4: Run** `npx vitest run src/services/ai`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ai): extract without a test list; choose LOINC codes from candidates`.

### Task 6: Import pipeline and review on LOINC

Gherkin first. Rewrite the identification scenarios in `features/ai-biomarker-identification.feature` and `features/import-wizard.feature` in business language:
- a known test from a new lab is matched with no question;
- an ambiguous one is decided by the AI;
- an uncertain one shows candidates to choose from;
- a choice is remembered after saving and not asked again;
- "Not a LOINC test" saves the value under its printed name;
- a value with no unit is never matched on its name alone.

Then the E2E in the matching spec files, using mocked AI responses (`e2e/steps/ai.steps.ts`) and made-up report text.

**Files:**
- Modify:
  - `src/services/analysis/LabReportAnalyzer.ts`: `MatchedBiomarker` loses `dictionaryMatch`, `suggestedMatch`, `nameSuggests` and `analyzed.modelMatch`. It gains `loincCode?: string`, `candidates: Candidate[]`, `identifiedBy: 'learned' | 'local' | 'ai' | 'user'` and `savedAsUnknown?: boolean`, and keeps `identificationFlags` as `'ambiguous' | 'no-unit' | 'not-identified'`.
  - `analyzeLabReport`: extraction → `matchLocally` per value → one `chooseTests` call for the non-matches (skipped with no AI) → a confident AI choice sets `loincCode`.
  - `src/services/analysis/nameMatching.ts`: delete it, its logic replaced by `loincMatch.ts`.
  - `reviewedSave.ts`: `targetTest(b) = b.loincCode ?? null`. Twin rules: a value with no code next to the same printed name saved with a code, whose unit `toUcum` cannot read, is left out as now (`isPerHundredCounted` stays).
  - `src/components/import/SavedAsCell.tsx`: lists `candidates` (LOINC long name and code), offers a search over the catalog, and offers "Not a LOINC test".
  - `src/utils/biomarkerSuggestions.ts`: `chooseTest(b, code: string | null)`.
  - `ReviewStep.tsx`: a value needs a code or "Not a LOINC test" before Continue, with the problem text `'<name> in "<file>" needs a test: choose one or "Not a LOINC test"'`.
  - `src/services/persistence/LabResultPersistence.ts`: `resolveBiomarkerKey(b) = b.savedAsUnknown || !b.loincCode ? unknownBiomarkerKey(b.name) : b.loincCode`.
  - `src/data/biomarkers/learnedAliases.ts` → move to `src/data/loinc/learnedTests.ts`:
    - `learnFromSaved(learned: Record<string,string>, values: { key: string; code?: string; confirmed: boolean }[])`, where the key is `learnedKey`.
    - It learns every saved value whose code came from `'ai'`, `'user'` or `'local'` after a user edit. Remembering an AI pick once it is saved is the user's decision.
    - `UserPreferences.learnedAliases` is renamed `learnedTests: Record<string, string>`.
  - `src/components/settings/LearnedAliases.tsx`: shows learned wording → LOINC name.
  - `src/hooks/useSaveImport.ts`.

**Interfaces:**
- Consumes: Tasks 3–5.
- Produces: the `MatchedBiomarker` fields above; `learnedTests` preference; `learnedKey`.

- [ ] **Step 1: Write the Gherkin scenarios** above.
- [ ] **Step 2: Write E2E tests** for each scenario and **unit tests**:
  - `analyzeLabReport` with a fake catalog and a fake provider: local match skips the AI; the AI is called once with only the ambiguous values; no AI means candidates are left for the user;
  - `reviewedSave` with the new `targetTest`;
  - `learnFromSaved` learns AI picks only when saved.
- [ ] **Step 3: Run** them. Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** `npx vitest run src/services src/components/import src/data` and the matching E2E specs in chromium and firefox (`E2E_DEV_PORT=5181 npx playwright test e2e/ai-biomarker-identification.spec.ts e2e/import-wizard.spec.ts e2e/document-analysis.spec.ts --project=chromium --project=firefox`). Expected: PASS.
- [ ] **Step 6: Commit** `feat(import): identify values by LOINC: local match, AI choice, user pick, learned on save`.

### Task 7: Data reset and backups

**Files:**
- Modify:
  - `src/data/db/index.ts`: add version 7, whose upgrade clears `labResults`, `testValues`, `userNotes`, and the per-test maps in `userPreferences` (`unitPreferences`, `personalTargets`, `acknowledgedAlerts`, `learnedAliases`). It keeps settings, theme and the AI config. Drop the legacy `biomarkers` table.
  - `src/data/db/encryptedDb.ts`: remove `migrateLegacyRecords`.
  - Delete `src/data/migrations/`.
  - `src/services/export/jsonExport.ts`: `BACKUP_SCHEMA_VERSION = 4`.
  - `src/services/import/jsonImport.ts`: refuse `schemaVersion < 4` with the error `'This backup was made before tests were identified by LOINC and cannot be restored. Re-import your reports instead.'`, and remove `migrateBackupData`.
  - `features/backup-restore.feature` and `e2e/backup-restore.spec.ts`: add the scenario "An older backup is refused" and update fixtures to version 4.
  - `src/data/biomarkers/keys.snapshot.ts`: delete it with its test.

- [ ] **Step 1: Write the Gherkin and E2E for the refusal; write unit tests**:
  - `upgrade to v7 empties values and per-test preferences and keeps settings` (fake-indexeddb, as the existing db tests do);
  - `refuses a version 3 backup with the message`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/data src/services/export src/services/import` and `e2e/backup-restore.spec.ts` (chromium, firefox). Expected: PASS.
- [ ] **Step 5: Commit** `feat(data)!: start empty for LOINC codes; refuse older backups`.

### Task 8: Screens on LOINC

Update Gherkin first:
- `features/trend-charts.feature`: glucose in mg/dL and mmol/L is one line in the preferred unit.
- `features/biomarker-dictionary.feature`: grouped by LOINC class; it lists tests you have values for plus those with descriptions, and searches the whole catalog; a test without a description shows its LOINC name.
- `alerts`, `settings` (personal targets), `user-notes`, `export`, `timeline-view` and `unit-conversion`: names now come from LOINC.

Names on screen:
- **Display name:** the add-on's short name if it has one, else LOINC `shortName`, else the long common name. Add `shortName?: string` to `TestAddon` for the common tests, e.g. "Glucose", "Hemoglobin".
- **Tooltip:** `loincLabel` with the long common name.
- Each value carries one display name; E2E selectors use the display names the add-ons give.

**Files:**
- Modify:
  - `src/data/biomarkers/dictionary.ts` → replace with `src/data/loinc/display.ts`: `testDisplayName(catalog, { biomarkerKey, rawText? }): string`, `testDescription`, `standardRange`.
  - Then every consumer from the map, by area:
    - **Trends:** `TrendsView`, `TrendChartControls` (class instead of category), `biomarkerSummary`. Lines are keyed by `trendGroup`. Values convert to the group's preferred unit through `convertValue(component, …)`, and a value that can't be converted gets a line of its own with a note.
    - **Alerts:** `useAlerts`, `alertGroups` (grouped by `trendGroup`), `OutOfRangeAlerts`, `AlertStateContext`.
    - **Targets and preferences:** `personalTarget.ts` (`toPersonalTarget(catalog, code, range)`), `PersonalTargets`, `PersonalTargetModal`, `SettingsPage`. A personal target applies to the whole `trendGroup`.
    - **Notes:** `NotesView`, `useNotes`, `noteAttachment`, `noteSearch`.
    - **Export:** `csvExport` (adds a `LOINC` column), `useExportData`, `ExportDialog`.
    - **Timeline:** `TestValuesList`, `LabResultCard`.
    - **Navigation:** `useNavigation`, `AppShell`.
    - **Dictionary:** `BiomarkerDictionary`, `BiomarkerDetail`, `DictionaryView`. They group by `classLabel`. The detail shows the code (linked to loinc.org as now), the long name, the description and range from the add-on, and "No description yet" otherwise.
  - Delete `src/data/biomarkers/related.ts` and its tests; the detail shows the other codes of its trend group instead of "related".
  - Update the E2E specs and steps listed under "Dictionary display names" in the code map, where the E2E steps' comments rely on `BIOMARKER_DEFINITIONS`. Use display names from `TEST_ADDONS`.

**Interfaces:**
- Consumes: `Catalog`, `getAddon`, `trendGroup`, `convertValue(component, …)`.
- Produces: `testDisplayName`, `testDescription`, `standardRange` in `src/data/loinc/display.ts`.

- [ ] **Step 1: Write the Gherkin changes.**
- [ ] **Step 2: Write unit tests**:
  - `testDisplayName` prefers the add-on short name, then LOINC short name;
  - `unknown:` keys show the printed name;
  - a trends test: `one line for glucose in mg/dL and mmol/L, in the preferred unit`;
  - an alerts test: `groups alerts by trend group`;
  - a dictionary test: `groups by LOINC class and searches the catalog`.

  Then update the E2E.
- [ ] **Step 3: Run.** Expected: FAIL.
- [ ] **Step 4: Implement**, area by area. Run that area's unit tests after each one.
- [ ] **Step 5: Run** `npx vitest run --maxWorkers=4` and `npm run build`. Expected: PASS. The build has no imports left from `src/data/biomarkers/dictionary.ts`, which is deleted.
- [ ] **Step 6: Commit** `feat: trends, alerts, targets, notes, export and dictionary on LOINC codes`.

### Task 9: Tune on real reports, decide on the embedding matcher, clean up

**Files:**
- Create: `scripts/match-reports.ts`, run with `npx vite-node scripts/match-reports.ts <pdf>...` and never committed with data. It extracts text with the app's PDF/OCR code, runs the AI extraction with the configured Ollama (or a cached extraction JSON in the scratchpad), and prints per value: printed name, unit, local status, top 3 candidates.
  - It must not write anything into the repo.
  - Its output goes only to the terminal.
- Modify: `MATCH_SCORE` and `MATCH_MARGIN` in `loincMatch.ts`, and the prefix list, as the runs show.
- Decide on `src/services/matching` (the ONNX embedding matcher). Run the tuning set with and without it as a re-scorer of the local candidates. If it does not move at least one value from `ambiguous`/`none` to the right `match` without making a wrong one, delete:
  - `src/services/matching/`;
  - `src/services/matching/onnxAssets.ts` and the copy step in `vite.config.ts`;
  - `@huggingface/transformers`;
  - the model download wording in features and E2E.

  Otherwise keep it as a re-scorer and write the numbers in the commit message.
- Delete what remains of `src/data/biomarkers/`, after moving `LOINC_NOTICE` to `src/data/loinc/notice.ts`.

- [ ] **Step 1: Run** the script on the user's local PDFs (`test-data/`; ask the user for others). Record the counts of match, ambiguous and none, with no health values, in the commit message.
- [ ] **Step 2: Adjust thresholds and prefixes.** Add a made-up test case to `loincMatch.test.ts` for every wording that needed a change.
- [ ] **Step 3: Decide the embedding matcher** as above.
- [ ] **Step 4: Run** `git status`. Check that no PDF, extracted text or extraction JSON is staged.
- [ ] **Step 5: Commit** `chore(loinc): tune local matching on real reports; <keep|remove> the embedding matcher`.

### Task 10: Full gate

- [ ] **Step 1: Kill stale servers** on 5181–5185 and 4173 (`lsof -ti tcp:PORT`).
- [ ] **Step 2: Run the checks**: `npm run build`, `npm run lint`, `npx vitest run --maxWorkers=4` (no stderr/stdout noise), and `npx playwright test --workers=2`. Expected: all pass.
- [ ] **Step 3: Review** with the simplify, code-review and security-review skills, telling each to never contact loinc.org. Fix every finding, then re-run the affected tests. If source changed, re-run the full gate.
- [ ] **Step 4: Update** `docs/ARCHITECTURE.md`: the data model (LOINC codes), matching, the catalog and UCUM.
- [ ] **Step 5: Report** to the user. Do not push without their go-ahead.
