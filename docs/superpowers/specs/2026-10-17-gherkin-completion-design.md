# Gherkin Completion — Design

**Date:** 2026-10-17
**Status:** Approved. Sub-projects 1–4 built; 5–6 to do. See [Progress](#progress) at the end.
**Branch:** `feature/gherkin-completion` (stacked on `fix/ai-model-selection`)

## Purpose

The Gherkin files are HemoIO's product specification, but several scenarios
describe behavior the app never had. E2E tests now exist for every scenario and
fail where the app falls short. This design covers building the missing
behavior so every quality gate passes. It does not cover new ideas beyond the
Gherkin.

Out of scope (removed from the Gherkin by decision): custom biomarker creation,
automatic advance from analysis to review.

## Sub-projects and order

Each sub-project gets its own implementation plan and is built test-first:
Gherkin, then E2E, then unit tests, then code. They are committed in this order:

| # | Sub-project | Why this position |
|---|---|---|
| 1 | Stable biomarker keys | Alerts, notes, unit preferences and targets all store data per biomarker. The key scheme must be fixed before they store more. |
| 2 | Alerts | Largest gap (20 failing scenarios) |
| 3 | Notes | Depends on 1 (notes on biomarkers / measurements) |
| 4 | Import and OCR | Independent |
| 5 | Preferred units and biomarker detail | Depends on 1 |
| 6 | Change password | Already specified (`2026-10-16-change-password-design.md`); independent |

Shared building blocks, built where first needed:
- `formatRelativeTime(date, now?)` returns "just now", "5 minutes ago" or
  "2 months ago". It is shown with a tooltip carrying the full date and time.
  Used by alerts (2) and notes (3).
- `navigateTo({ view, biomarkerKey?, highlightTestValueId? })` in AppShell, for
  cross-view navigation (alert → trend, note → its result).

---

## 1. Stable biomarker keys

**Problem.** A stored `biomarkerId` is the biomarker's 1-based position in
`BIOMARKER_DEFINITIONS`. Inserting an entry anywhere but at the end silently
re-labels every stored value after it. Unknown biomarkers get a hash-based
ID of 10000 or more.

**Design.**
- Every `BiomarkerDefinition` gets a permanent `key`, a kebab-case slug of its
  name (e.g. `glucose`, `white-blood-cell-count`). A unit test asserts that
  keys are unique and match a frozen snapshot, so a key can never change or be
  reused.
- Stored references use `biomarkerKey: string` instead of `biomarkerId: number`:
  - `testValues` (indexed, including the `[labResultId+biomarkerKey]` index)
  - `userNotes`
  - `userPreferences.personalTargets` and `userPreferences.unitPreferences`
  - alert acknowledgements (sub-project 2)
- Unknown biomarkers use `unknown:<normalized extracted name>`: the name is
  NFKC-normalised, lower-cased, and reduced to letters, combining marks,
  digits, `%` and `#` (the last two distinguish e.g. "Reticulocytes %" from
  "Reticulocytes #"). The same unknown name
  therefore always gets the same key. That keeps working when a user maps it
  to a known biomarker later: the stored value is rewritten to the known key.
- **Dexie version 3 upgrade.** Converts stored numeric IDs to keys using
  `LEGACY_ID_ORDER`. This is a frozen copy of the dictionary's name order at
  migration time, kept in the migration module and never edited. Numeric IDs of
  10000 or more (hashes of the extracted name) first become
  `unknown:legacy-<id>`. Because the hash input is the stored `rawText`, which
  is encrypted, a pass after unlock then rewrites each to
  `unknown:<normalized rawText>`, so its history joins later imports of the
  same name. v1 backups do this during import, since their `rawText` is
  plaintext. The upgrade
  only touches unencrypted fields, so it runs without the encryption key.
- **Backups.** Backup schema version 2 writes keys. Restoring a version-1
  backup converts IDs with the same `LEGACY_ID_ORDER` mapping, through the
  existing migration slot in `jsonImport.ts`. The filesystem sync file has
  its own format (`{ version, exportedAt, data }`); its version becomes 2, so a
  future reader can tell numeric-ID files (v1) from key-based ones.
- **Lookup.** `getBiomarkerByKey(key)` and `getBiomarkerForTestValue(tv)`
  (key first, then `rawText`) replace the numeric helpers added in the
  previous fix.

**Risks:** an upgrade bug would mislabel data. Mitigations:
- Unit tests run the upgrade against a database built at version 2.
- A test round-trips a version-1 backup.
- The migration is idempotent; rows that already have a key are skipped.

---

## 2. Alerts

The existing `useAlerts` / `OutOfRangeAlerts` are mounted and completed.

- **Navigation:**
  - An **Alerts** nav item (between Trends and Biomarkers) opens an Alerts view
    containing `OutOfRangeAlerts`.
  - The nav item carries a red badge with the number of active
    (unacknowledged) out-of-range values. The badge is announced in the item's
    accessible name, e.g. "Alerts, 3 abnormal values".
  - The "{n} alerts" text in Trends becomes a link to the Alerts view.
- **Direction and severity are separate.**
  - Indicator colour shows direction: high is red, low is orange, an
    improvement is green. Trend alerts are coloured by their direction.
  - Severity is **Critical** when the value is ≥50% beyond the nearest bound,
    otherwise **Warning**. The `info` level is removed.
  - Critical alerts sort first and get stronger styling: a filled severity
    badge and a heavier border.
  - Each alert card has `role="article"` and an accessible name that includes
    severity, biomarker and direction.
- **Content:**
  - Value, unit and the full reference range ("70–100 mg/dL").
  - The lab result date as relative time, with the full date on hover.
  - Grouped by biomarker with an occurrence count, most recent first.
- **Messages:**
  - Trend alerts read "Consistently increasing" or "Consistently decreasing",
    with a timeframe such as "over 4 months (Jan–Apr 2024)". They require at
    least 4 consecutive values moving in the same direction.
  - Improvement alerts read "Improved: {Biomarker} now within range".
- **Dismiss and acknowledge:**
  - **Dismiss** hides an alert until the next page load (in-memory state, as
    today).
  - **Acknowledge** is stored in `userPreferences.acknowledgedAlerts` as
    `{ [biomarkerKey]: ISO date of the acknowledged alert }`. The alert
    reappears when a newer abnormal value for that biomarker exists.
- **Category filter:** the existing category select, with an accessible label.
- **Click-through:** clicking an alert, or pressing Enter on it, opens Trends
  with that biomarker selected and its data point highlighted (an enlarged
  ring and `aria-current="true"`).

---

## 3. Notes

- **(a) Chart markers.**
  - A trend data point whose test value has notes is drawn with a distinct
    marker (a ring plus a note glyph), and its accessible label gains ", has
    notes".
  - Hovering or focusing the point shows a tooltip previewing the first note
    (up to 120 characters).
- **(b) Notes on a measurement.**
  - Data points are focusable buttons. Clicking one, or pressing Enter,
    opens a popover with the value, date and an "Add Note" action.
  - The note editor opens in a modal headed "Note for {value} {unit} on
    {date}".
  - Saved notes carry `testValueId`, `labResultId` and `biomarkerKey`.
- **(c) A Notes view**, added to the navigation:
  - All notes, newest first. Each card shows what it is attached to: a lab
    result's lab name and date, or a biomarker's name, with value and date when
    the note is on a measurement. Clicking that label navigates there.
  - Filters: text search, date range, biomarker and tag.
  - Search matches are highlighted with `<mark>`.
  - Filtering happens client-side, after decryption.
- **(d) Formatting.**
  - A toolbar above the editor with Bold, Italic, Bullet list and Numbered
    list. The buttons wrap or prefix the selection; Ctrl/Cmd+B and Ctrl/Cmd+I
    also work. Each button has an accessible label and the toolbar has
    `role="toolbar"`.
  - Notes are stored as a Markdown subset: `**bold**`, `*italic*`, `- ` and
    `1. ` lists.
  - They are rendered by an in-house renderer that produces React elements.
    No HTML is parsed or injected, and unsupported syntax renders as text.
  - Existing plain-text notes render unchanged.
  - Timestamps are relative ("just now"), with the full date on hover. The
    edit time is shown the same way.

---

## 4. Import and OCR

- **Biomarker autocomplete.** In review, the name field for an edited or added
  value becomes an Autocomplete over dictionary names and aliases. Choosing a
  suggestion sets the dictionary match, its specimen and its unit options.
  Free text stays allowed: an unmatched name remains "unknown".
- **Lab date picker.** The lab date becomes a Mantine `DatePickerInput`
  (calendar dialog, keyboard accessible), pre-filled from the extraction.
- **Manual entry.** When analysis yields no values, because of an empty
  document, an AI failure or a refusal, the analysis step offers
  "Enter values manually". It opens review with an empty table and the
  file's name as context.
- **Rate limits.**
  - An AI request answered with HTTP 429 is retried up to 3 times with
    exponential backoff (2 s, 4 s, 8 s), honouring `retry-after` when present.
  - While waiting, the file shows "Waiting for the AI provider (rate
    limited)".
  - After the last retry the file fails with a clear message.
  - Implemented once, in a shared request helper used by all providers.
- **Bundled OCR.**
  - The Tesseract worker, its core (wasm) and the bundled languages' data are
    served from the app's own origin and precached for offline PWA use. No CDN
    requests.
  - Languages: English and Italian, matching the dictionary's aliases.
    Adding a language is a config change.

---

## 5. Preferred units and biomarker detail

- **Preferred unit.**
  - Trends shows a "Preferred unit" select per biomarker, listing only units
    the biomarker can be converted to.
  - The choice is stored in `userPreferences.unitPreferences[biomarkerKey]`.
  - It applies to the trend chart, the statistics, the timeline values and
    the alerts. Reference ranges are converted with the value.
  - Typing an unsupported unit (the control is searchable) shows "Unit not
    supported for {Biomarker}" and keeps the current unit.
- **Biomarker detail** (dictionary view):
  - **Your results:** your latest value with its date and status, your number
    of results, and a "View trend" link.
  - **No recorded values:** when you have no results, the message "You have no
    recorded values for {Biomarker}" replaces that section.
  - **Personal target:** your current target or "Using standard range", with
    an Edit action that reuses the personal-target modal.
  - **Back** button to the list, restoring the previous search and scroll
    position.
  - **Related biomarkers:** a new `related: string[]` (biomarker keys) field
    in the dictionary, curated for these groups: lipids, CBC indices, thyroid,
    kidney, liver, iron, glucose metabolism and electrolytes. Each entry links
    to its detail page. A unit test checks that related keys exist and that
    relations are symmetric.

---

## 6. Testing and gates (all sub-projects)

- Gherkin first, then E2E (using the shared steps in `e2e/steps/`), then unit
  tests, then implementation.
- No `test.skip`, fixed sleeps or unexpected console output. Tests are
  independent and safe to run in parallel.
- A sub-project is complete when the build, lint, the full unit suite (with
  clean output) and the full E2E suite in both browsers all pass.
- Before the branch is offered for merge, run the simplify, code-review and
  security-review skills and address their findings.

---

## Progress

Last updated 2026-10-24. This section is the place to resume from.

### Sub-projects

| # | Sub-project | State | Plan |
|---|---|---|---|
| 1 | Stable biomarker keys | Done and reviewed | [plan](../plans/2026-10-17-stable-biomarker-keys.md) |
| 2 | Alerts | Done and reviewed | [plan](../plans/2026-10-18-alerts.md) |
| 3 | Notes | Done and reviewed | [plan](../plans/2026-10-18-notes.md) |
| 4 | Import and OCR | Done and reviewed | [plan](../plans/2026-10-23-import-and-ocr.md) |
| 5 | Preferred units and biomarker detail | Done and reviewed | [plan](../plans/2026-10-23-preferred-units-and-biomarker-detail.md) |
| 6 | Change password | Done and reviewed | [spec](2026-10-16-change-password-design.md), [plan](../plans/2026-10-24-change-password.md) |

Each finished plan ends with an **Outcome** section: the gates it passed, and the minor issues deferred for later.

### How each sub-project is done

1. Write the plan with the `superpowers:writing-plans` skill. Save it to `docs/superpowers/plans/`, and get the plan approved.
2. Execute it natively with `superpowers:executing-plans`:
   - Gherkin first, then E2E, then unit tests, then code.
   - Each test is watched failing before the code is written.
3. Have a fresh reviewer on the most capable model review the whole sub-project. Fix every Critical and Important finding test-first, and record the minors in the plan's Outcome.
4. Pass the gates before the sub-project counts as done:
   - `npm run build`
   - `npm run lint`
   - `npx vitest run --maxWorkers=4`, with no output besides test results
   - `npx playwright test --workers=2` in both browsers

   Keep the worker counts low so the machine stays usable.

### E2E failures still expected

None. Any E2E failure is a regression.

### Before the branch can be merged

- Fix the build warning "Some chunks are larger than 500 kB" by code-splitting. The warning predates this branch.
- Address `npm audit`: 32 vulnerabilities, 2 of them critical.
- Run the `simplify`, `code-review` and `security-review` skills over the whole branch and address their findings.
- Pass every gate above, with the full E2E suite green.
- Merge `fix/ai-model-selection` first: this branch is built on it.

### Branches

| Branch | Contents |
|---|---|
| `main` | The CORS fix for Anthropic requests, merged locally only. |
| `fix/ai-model-selection` | The AI model is chosen in the app, never hardcoded. Complete; not merged. |
| `feature/gherkin-completion` | This work, built on `fix/ai-model-selection`. |
| `feature/change-password` | Only the change-password spec, which is also copied here. Sub-project 6 is built on `feature/gherkin-completion`. |

None of these branches has been pushed to `origin`.

