# Preferred Units and Biomarker Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pick a preferred unit per biomarker, applied everywhere values are shown, and complete the dictionary's biomarker detail with your results, personal target, related biomarkers and a Back button.

**Architecture:**
- **Preferences:** one `PreferencesProvider` context owns the unit preferences and personal targets in memory. Every write goes through a new atomic `EncryptedDb.updatePreferences(update)`, which reads and writes the record in one Dexie transaction, so the several writers (alerts, settings, trends, dictionary) never overwrite each other.
- **Display units:** pure helpers in `src/services/units/displayUnit.ts` decide which units a biomarker offers and convert a value with its range for display. Trends, the timeline, the alerts and the dictionary all use them.
- **Dictionary:** related biomarkers come from curated groups in `src/data/biomarkers/related.ts`, attached to each definition as `related`. A new `DictionaryView` replaces the list with the detail and restores the list (search, open categories, scroll, focus) on Back. The personal-target modal is extracted from Settings and shared.

**Tech Stack:** React 19, Mantine 8 (`Select`, `Modal`, `NumberInput`), Dexie 4, Vitest + RTL, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-gherkin-completion-design.md`, section "5. Preferred units and biomarker detail".

## Global Constraints

**Preferred unit**
- Trends shows a "Preferred unit" select per biomarker, listing only units the biomarker can be converted to.
- The choice is stored in `userPreferences.unitPreferences[biomarkerKey]`.
- It applies to the trend chart, the statistics, the timeline values and the alerts. Reference ranges are converted with the value.
- Typing an unsupported unit (the control is searchable) shows `Unit not supported for {Biomarker}` and keeps the current unit.

**Biomarker detail**
- **Your results:** your latest value with its date and status, your number of results, and a "View trend" link.
- **No recorded values:** when you have no results, the message `You have no recorded values for {Biomarker}` replaces that section.
- **Personal target:** your current target or `Using standard range`, with an Edit action that reuses the personal-target modal.
- **Back** button to the list, restoring the previous search and scroll position.
- **Related biomarkers:** a new `related: string[]` (biomarker keys) field in the dictionary, curated for these groups: lipids, CBC indices, thyroid, kidney, liver, iron, glucose metabolism and electrolytes. Each entry links to its detail page. A unit test checks that related keys exist and that relations are symmetric.

**Testing and gates (spec section 6)**
- Gherkin first, then E2E (shared steps in `e2e/steps/`), then unit tests, then implementation.
- No `test.skip`, fixed sleeps or unexpected console output. Tests are independent and safe to run in parallel.
- Complete when build, lint, the full unit suite (clean output) and the full E2E suite in both browsers pass.
- Fix the intermittent `unit-conversion.spec.ts:578` keyboard test: let Mantine's 0 ms timer run after the dropdown opens (see `ollama-integration.spec.ts`).

**Project rules (CLAUDE.md)**
- Never log health data. `console.error` messages name the failed action only, never values.
- Status is never shown by colour alone: every status has text.
- Every interactive element has an accessible name.

## Review Focus

1. **A backup restore that brings preferences** (a personal target or a preferred unit) shows them right away, without a page reload: the provider must reload after a restore. Pinned in Task 2 (`reload`) and Task 9 (E2E seeds a personal target through a restore).
2. **A stored preferred unit the biomarker no longer offers** (from an old or edited backup, e.g. `stones` for Glucose) is ignored: values show in the standard unit, and the select shows the standard unit. Pinned in Task 3.
3. **Saving a preference fails** (database error): the screen goes back to the previous unit or target and the user is told it was not saved. Pinned in Tasks 2 and 4.
4. **Back after following related biomarkers** (Glucose → Hemoglobin A1c → Back) returns to the list as it was when Glucose was opened, not to the previous detail. Pinned in Task 9.
5. **A latest value that is not a number** (Positive/Negative, or text) or cannot be converted to the preferred unit is shown as recorded in "Your results", without crashing. Pinned in Task 7.

## File Structure

| File | Responsibility |
|---|---|
| `features/unit-conversion.feature`, `features/biomarker-dictionary.feature` | Scenarios for the preferred unit and the detail sections |
| `e2e/steps/data.steps.ts`, `e2e/steps/unitConversion.steps.ts` | Seeding preferences with a backup |
| `e2e/unit-conversion.spec.ts`, `e2e/biomarker-dictionary.spec.ts` | E2E for the new behaviour |
| `src/data/db/encryptedDb.ts` | `updatePreferences` (atomic read-modify-write) |
| `src/hooks/usePreferences.ts` | `PreferencesContext`, `usePreferences`, `PreferencesState` |
| `src/contexts/PreferencesContext.tsx` | `PreferencesProvider` |
| `src/contexts/AlertStateContext.tsx` | Saves through `updatePreferences` |
| `src/App.tsx`, `src/components/layout/AppShell.tsx` | Provider wiring; reload after restore; `DictionaryView` |
| `src/services/units/displayUnit.ts` | `preferredUnitOptions`, `preferredUnitFor`, `resolveDisplayUnit`, `convertForDisplay` |
| `src/components/trends/PreferredUnitSelect.tsx`, `TrendsView.tsx` | The select, and charts in the chosen unit |
| `src/components/timeline/TestValuesList.tsx` | Timeline values in the preferred unit |
| `src/hooks/useAlerts.ts` | Alerts in the preferred unit |
| `src/data/biomarkers/related.ts`, `dictionary.ts` | Related biomarker groups; `related` on each definition |
| `src/services/statistics/biomarkerSummary.ts` | Latest value and count for a biomarker |
| `src/utils/formatRange.ts` | `formatRange(low, high)` shared by Settings and the detail |
| `src/components/settings/PersonalTargetModal.tsx`, `PersonalTargets.tsx`, `SettingsPage.tsx` | Shared modal; Settings reads targets from the provider |
| `src/components/dictionary/BiomarkerDetail.tsx`, `BiomarkerDictionary.tsx`, `DictionaryView.tsx` | Detail sections, list state kept, Back |

---

### Task 1: Gherkin and E2E

**Files:**
- Modify: `features/unit-conversion.feature`, `features/biomarker-dictionary.feature`
- Modify: `e2e/steps/data.steps.ts`, `e2e/steps/unitConversion.steps.ts`
- Modify: `e2e/unit-conversion.spec.ts`, `e2e/biomarker-dictionary.spec.ts`

**Interfaces:**
- Produces: `SeedData.userPreferences?: unknown`; `seedMeasurements(page, measurements, options?: { userPreferences?: unknown })`.
- Produces (names the app must provide, used by the E2E): the textbox `Preferred unit`; the text `Unit not supported for {Biomarker}`; in the detail, regions named `Your results`, `Personal target`, `Related biomarkers`; buttons `Back to biomarker list`, `View trend`, `Edit personal target`; the badge text `Your target`; the text `Using standard range`.

- [ ] **Step 1: Gherkin**

In `features/unit-conversion.feature`, replace the scenario "User sets preferred unit for a biomarker" with:

```gherkin
  Scenario: User sets preferred unit for a biomarker
    Given I am viewing my glucose results in mg/dL
    When I set my preferred unit to mmol/L
    Then all glucose values should display in mmol/L
    And the timeline and the alerts should show glucose in mmol/L
    And the preference should be saved

  Scenario: User types a unit the biomarker cannot be shown in
    Given I am viewing my glucose results in mg/dL
    When I type "stones" as my preferred unit
    Then I should see "Unit not supported for Glucose"
    And glucose values should still display in mg/dL
```

In `features/biomarker-dictionary.feature`, replace the scenarios "View personal target if set", "Return to category list from detail" and "View my results for a biomarker" with:

```gherkin
  Scenario: View personal target if set
    Given I have set a personal target for "Glucose"
    When I view the detail for "Glucose"
    Then I should see both the standard range and my personal target
    And my personal target should be highlighted

  Scenario: Set a personal target from the detail
    Given I have no personal target for "Glucose"
    When I view the detail for "Glucose"
    Then I should see that the standard range is used
    When I edit the personal target to 70 - 90
    Then I should see my personal target 70 - 90 mg/dL
    And it should still be set after I sign in again

  Scenario: Return to category list from detail
    Given I am viewing the detail for a biomarker
    When I click the back button
    Then I should return to the category or search results
    And my search and scroll position should be kept

  Scenario: View my results for a biomarker
    Given I have lab results containing "Glucose" values
    When I view the detail for "Glucose"
    Then I should see a summary of my historical values
    And I should see my latest value with its date and status
    And I should see how many results I have
    And I should have a link to view the trend chart
```

- [ ] **Step 2: Seeding preferences**

In `e2e/steps/data.steps.ts`, extend `SeedData` and `createBackupData`:

```ts
export interface SeedData {
  labResults?: unknown[];
  testValues?: unknown[];
  userNotes?: unknown[];
  /** Backup preferences; schema version 1, so maps are keyed by legacy biomarker IDs */
  userPreferences?: unknown;
}
```

and in `createBackupData` replace `userPreferences: null,` with `userPreferences: data.userPreferences ?? null,`.

In `e2e/steps/unitConversion.steps.ts`, change `seedMeasurements` to:

```ts
export async function seedMeasurements(
  page: Page,
  measurements: Measurement[],
  options: { userPreferences?: unknown } = {}
): Promise<void> {
```

and its last line to `await seedLabData(page, { labResults, testValues, userNotes: [], userPreferences: options.userPreferences });`.

Replace the doc comment of `preferredUnitControl` with:

```ts
/**
 * The searchable select, on the Trends view, for the unit a biomarker is
 * shown in
 */
```

- [ ] **Step 3: Unit-conversion E2E**

In `e2e/unit-conversion.spec.ts`:

Replace the body of `should show error for unsupported unit conversion` after `await openTrend(page, 'Glucose');` with:

```ts
    await preferredUnitControl(page).fill('stones');
    await expect(
      page.getByRole('main').getByText('Unit not supported for Glucose', { exact: true })
    ).toBeVisible();

    // Values stay in the current unit, and so does the control
    await expectTrendValues(page, [
      { value: '100', unit: 'mg/dL' },
      { value: '110', unit: 'mg/dL' },
    ]);
    await page.keyboard.press('Escape');
    await preferredUnitControl(page).blur();
    await expect(preferredUnitControl(page)).toHaveValue('mg/dL');
```

In `unit preference controls should be keyboard accessible`, between `await page.keyboard.type('mmol');` and `await page.keyboard.press('ArrowDown');`, insert:

```ts
    // Mantine resets the highlighted option in a 0 ms timer after the
    // dropdown opens; let it run so ArrowDown is not undone
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
```

In the `Unit Conversion - With Data` describe, after `should save unit preference per biomarker`, add:

```ts
  test('should show the preferred unit on the timeline and in alerts', async ({ page }) => {
    // Scenario: User sets preferred unit — "the timeline and the alerts
    // should show glucose in mmol/L"
    await openApp(page);
    await seedMeasurements(page, [
      { day: DAY_1, biomarker: GLUCOSE, value: 100, unit: 'mg/dL', low: 70, high: 100 },
      { day: DAY_2, biomarker: GLUCOSE, value: 120, unit: 'mg/dL', low: 70, high: 100 },
    ]);

    await openTrend(page, 'Glucose');
    await setPreferredUnit(page, 'mmol/L');

    await page.getByRole('navigation').getByRole('button', { name: /^Timeline/ }).click();
    const card = await expandLabResult(page, DAY_2);
    await expect(card.getByRole('row', { name: /^Glucose: 6\.66 mmol\/L,/ })).toBeVisible();

    await page.getByRole('navigation').getByRole('button', { name: /^Alerts/ }).click();
    await expect(
      page.getByRole('main').getByText(/Glucose is high at 6\.66 mmol\/L/).first()
    ).toBeVisible();
  });
```

- [ ] **Step 4: Dictionary E2E**

In `e2e/biomarker-dictionary.spec.ts`, add imports:

```ts
import { unlockApp } from './steps/app.steps';
import { biomarkerSelect } from './steps/trends.steps';
import { GLUCOSE, seedMeasurements } from './steps/unitConversion.steps';
```

(merge `unlockApp` into the existing `./steps/app.steps` import). Add after `viewDetail`:

```ts
async function goToDictionary(page: Page): Promise<void> {
  await page.getByRole('navigation').getByRole('button', { name: /^Biomarkers/ }).click();
  await expect(page.getByRole('heading', { name: 'Biomarker Dictionary' })).toBeVisible();
}

function backButton(detail: Locator): Locator {
  return detail.getByRole('button', { name: 'Back to biomarker list' });
}
```

In `should be keyboard navigable`, replace the last block (from `// Enter opens the detail; its close button is reachable too`) with:

```ts
    // Enter opens the detail; its Back button returns focus to the item
    await page.keyboard.press('Enter');
    const detail = biomarkerDetail(page, 'White Blood Cell Count');
    await expect(detail).toBeVisible();
    await backButton(detail).focus();
    await page.keyboard.press('Enter');
    await expect(detail).toHaveCount(0);
    await expect(wbc).toBeFocused();
```

Add these describes inside `test.describe('Biomarker Dictionary', ...)`:

```ts
  test.describe('Related Biomarkers', () => {
    test('should list related biomarkers and open their details', async ({ page }) => {
      const detail = await viewDetail(page, 'Glucose');
      const related = detail.getByRole('region', { name: 'Related biomarkers' });
      const a1c = related.getByRole('button', { name: 'Hemoglobin A1c (HbA1c)' });
      await expect(a1c).toBeVisible();

      await a1c.click();
      const a1cDetail = biomarkerDetail(page, 'Hemoglobin A1c');
      await expect(a1cDetail).toBeVisible();
      // Relations go both ways
      await expect(
        a1cDetail.getByRole('region', { name: 'Related biomarkers' }).getByRole('button', { name: /^Glucose/ })
      ).toBeVisible();
    });
  });

  test.describe('Personal Target', () => {
    test('should show a personal target next to the standard range', async ({ page }) => {
      // Glucose is legacy ID 22 in a schema-version-1 backup
      await seedMeasurements(
        page,
        [{ day: '2024-01-15', biomarker: GLUCOSE, value: 95, unit: 'mg/dL' }],
        {
          userPreferences: {
            unitPreferences: {},
            personalTargets: { 22: { low: 70, high: 90 } },
            theme: 'system',
            dateFormat: 'MM/DD/YYYY',
          },
        }
      );
      await goToDictionary(page);

      const detail = await viewDetail(page, 'Glucose');
      await expect(detail.getByText('70 - 100 mg/dL', { exact: true })).toBeVisible();
      const target = detail.getByRole('region', { name: 'Personal target' });
      await expect(target.getByText('Your target', { exact: true })).toBeVisible();
      await expect(target.getByText('70 - 90 mg/dL', { exact: true })).toBeVisible();
    });

    test('should set a personal target from the detail', async ({ page }) => {
      const detail = await viewDetail(page, 'Glucose');
      const target = detail.getByRole('region', { name: 'Personal target' });
      await expect(target.getByText('Using standard range', { exact: true })).toBeVisible();

      await target.getByRole('button', { name: 'Edit personal target' }).click();
      const dialog = page.getByRole('dialog', { name: 'Set Personal Target for Glucose' });
      await dialog.getByLabel('Personal target low value').fill('70');
      await dialog.getByLabel('Personal target high value').fill('90');
      await dialog.getByRole('button', { name: 'Save Target' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(target.getByText('70 - 90 mg/dL', { exact: true })).toBeVisible();

      // Saved: still there in a new session
      await page.reload();
      await unlockApp(page);
      await goToDictionary(page);
      const again = await viewDetail(page, 'Glucose');
      await expect(
        again.getByRole('region', { name: 'Personal target' }).getByText('70 - 90 mg/dL', { exact: true })
      ).toBeVisible();
    });
  });

  test.describe('Back to the List', () => {
    test('should return to the search results with the search kept', async ({ page }) => {
      await searchField(page).fill('chol');
      const ldl = page.getByRole('button', { name: 'View details for LDL Cholesterol', exact: true });
      await ldl.click();
      const detail = biomarkerDetail(page, 'LDL Cholesterol');
      await expect(detail).toBeVisible();
      // The detail replaces the list
      await expect(searchField(page)).toBeHidden();

      await backButton(detail).click();

      await expect(detail).toHaveCount(0);
      await expect(searchField(page)).toHaveValue('chol');
      await expect(ldl).toBeFocused();
    });

    test('should return to the open category at the same scroll position', async ({ page }) => {
      const panel = await openCategory(page, 'Complete Blood Count');
      const item = panel.getByRole('button', { name: 'View details for Basophils Percentage', exact: true });
      await item.scrollIntoViewIfNeeded();
      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY).toBeGreaterThan(0);

      await item.click();
      const detail = biomarkerDetail(page, 'Basophils Percentage');
      await expect(detail).toBeVisible();
      await backButton(detail).click();

      await expect(categoryControl(page, 'Complete Blood Count')).toHaveAttribute('aria-expanded', 'true');
      await expect(item).toBeFocused();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollY);
    });

    test('should return to the list, not the previous detail, after related biomarkers', async ({ page }) => {
      const detail = await viewDetail(page, 'Glucose');
      await detail
        .getByRole('region', { name: 'Related biomarkers' })
        .getByRole('button', { name: 'Hemoglobin A1c (HbA1c)' })
        .click();
      const a1c = biomarkerDetail(page, 'Hemoglobin A1c');
      await backButton(a1c).click();

      await expect(searchField(page)).toHaveValue('Glucose');
      await expect(page.getByRole('button', { name: 'View details for Glucose', exact: true })).toBeFocused();
    });
  });

  test.describe('Your Results', () => {
    test('should summarise my results and link to the trend', async ({ page }) => {
      await seedMeasurements(page, [
        { day: '2024-01-15', biomarker: GLUCOSE, value: 95, unit: 'mg/dL', low: 70, high: 100 },
        { day: '2024-02-20', biomarker: GLUCOSE, value: 120, unit: 'mg/dL', low: 70, high: 100 },
      ]);
      await goToDictionary(page);

      const detail = await viewDetail(page, 'Glucose');
      const yours = detail.getByRole('region', { name: 'Your results' });
      await expect(yours.getByText('120 mg/dL', { exact: true })).toBeVisible();
      await expect(yours.getByText('Feb 20, 2024', { exact: true })).toBeVisible();
      await expect(yours.getByText('High', { exact: true })).toBeVisible();
      await expect(yours.getByText('2 results', { exact: true })).toBeVisible();

      await yours.getByRole('button', { name: 'View trend' }).click();
      await expect(page.getByRole('main').getByRole('heading', { name: 'Trends', level: 2 })).toBeVisible();
      await expect(biomarkerSelect(page)).toHaveValue(/^Glucose \(/);
    });

    test('should say when I have no recorded values', async ({ page }) => {
      const detail = await viewDetail(page, 'Ferritin');
      const yours = detail.getByRole('region', { name: 'Your results' });
      await expect(yours.getByText('You have no recorded values for Ferritin', { exact: true })).toBeVisible();
      await expect(yours.getByRole('button', { name: 'View trend' })).toHaveCount(0);
      // Reference information is still shown
      await expect(detail.getByText('Reference Range', { exact: true })).toBeVisible();
    });
  });
```

Note: `viewDetail` fills the search with the biomarker's name, so in the related-biomarkers Back test the search is `Glucose`.

The keyboard test focuses the control while it shows `mg/dL` and types `mmol`. That only works if focusing the control selects its text, so typing replaces it; Task 4 builds the select that way.

- [ ] **Step 5: Run the new E2E and watch them fail**

Run: `npx playwright test e2e/unit-conversion.spec.ts e2e/biomarker-dictionary.spec.ts --project=chromium --workers=2 --reporter=line`
Expected: FAIL. The failing tests are the 4 preferred-unit tests plus the new timeline/alerts test, the keyboard-navigable dictionary test (no Back button), and every test in the new Related, Personal Target, Back and Your Results describes. Everything else passes. A failure for another reason (a typo, a wrong import) is fixed before going on.

- [ ] **Step 6: Commit**

```bash
git add features/unit-conversion.feature features/biomarker-dictionary.feature e2e/steps/data.steps.ts e2e/steps/unitConversion.steps.ts e2e/unit-conversion.spec.ts e2e/biomarker-dictionary.spec.ts
git commit -m "test(e2e): specify preferred units and the biomarker detail sections"
```

---

### Task 2: Atomic preference updates and the preferences provider

**Files:**
- Modify: `src/data/db/encryptedDb.ts`
- Create: `src/data/db/encryptedDb.preferences.test.ts`
- Create: `src/hooks/usePreferences.ts`, `src/contexts/PreferencesContext.tsx`, `src/contexts/PreferencesContext.test.tsx`
- Modify: `src/hooks/index.ts`, `src/contexts/index.ts`, `src/App.tsx`
- Modify: `src/contexts/AlertStateContext.tsx`, `src/contexts/AlertStateContext.test.tsx`
- Modify: `src/components/layout/AppShell.tsx` (reload after restore)

**Interfaces:**
- Produces: `EncryptedDb.updatePreferences(update: (current: UserPreferences | undefined) => Partial<Omit<UserPreferences, 'id'>>): Promise<void>`.
- Produces (`@hooks/usePreferences`):

```ts
export interface PersonalTargetRange { low?: number; high?: number }
export interface PreferencesState {
  /** biomarkerKey → preferred unit */
  unitPreferences: Readonly<Record<string, string>>;
  /** biomarkerKey → personal target, in the biomarker's standard unit */
  personalTargets: Readonly<Record<string, PersonalTargetRange>>;
  /** True once the stored preferences have been read */
  isLoaded: boolean;
  setPreferredUnit(biomarkerKey: string, unit: string): Promise<void>;
  /** null removes the target */
  setPersonalTarget(biomarkerKey: string, target: PersonalTargetRange | null): Promise<void>;
  /** Re-read the stored preferences, e.g. after a backup restore */
  reload(): Promise<void>;
}
export function usePreferences(): PreferencesState; // throws outside a PreferencesProvider
```

- Produces: `PreferencesProvider` exported from `@contexts`.

- [ ] **Step 1: Write the failing database test**

Create `src/data/db/encryptedDb.preferences.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import Dexie from 'dexie';
import { HemoIODatabase } from './index';
import { EncryptedDb } from './encryptedDb';

const names: string[] = [];
afterEach(async () => {
  await Promise.all(names.splice(0).map((n) => Dexie.delete(n)));
});

async function openDb(name: string): Promise<EncryptedDb> {
  names.push(name);
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  return new EncryptedDb(key, new HemoIODatabase(name));
}

describe('EncryptedDb.updatePreferences', () => {
  it('creates the record with defaults when there is none', async () => {
    const db = await openDb('prefs-test-1');
    await db.updatePreferences(() => ({ unitPreferences: { glucose: 'mmol/L' } }));

    expect(await db.getPreferences()).toEqual(
      expect.objectContaining({
        unitPreferences: { glucose: 'mmol/L' },
        personalTargets: {},
        theme: 'system',
        dateFormat: 'MM/DD/YYYY',
      })
    );
  });

  it('changes only the fields it returns', async () => {
    const db = await openDb('prefs-test-2');
    await db.savePreferences({
      unitPreferences: {},
      personalTargets: { glucose: { high: 90 } },
      theme: 'dark',
      dateFormat: 'YYYY-MM-DD',
      acknowledgedAlerts: { glucose: '2024-01-01T00:00:00.000Z' },
    });

    await db.updatePreferences((current) => ({
      unitPreferences: { ...current?.unitPreferences, glucose: 'mmol/L' },
    }));

    expect(await db.getPreferences()).toEqual(
      expect.objectContaining({
        unitPreferences: { glucose: 'mmol/L' },
        personalTargets: { glucose: { high: 90 } },
        theme: 'dark',
        acknowledgedAlerts: { glucose: '2024-01-01T00:00:00.000Z' },
      })
    );
  });

  it('keeps both of two updates made at the same time', async () => {
    const db = await openDb('prefs-test-3');
    await Promise.all([
      db.updatePreferences((c) => ({ unitPreferences: { ...c?.unitPreferences, glucose: 'mmol/L' } })),
      db.updatePreferences((c) => ({ unitPreferences: { ...c?.unitPreferences, hemoglobin: 'g/L' } })),
    ]);

    expect((await db.getPreferences())?.unitPreferences).toEqual({ glucose: 'mmol/L', hemoglobin: 'g/L' });
  });
});
```

- [ ] **Step 2: Run it to watch it fail**

Run: `npx vitest run src/data/db/encryptedDb.preferences.test.ts`
Expected: FAIL with `db.updatePreferences is not a function`.

- [ ] **Step 3: Implement `updatePreferences`**

In `src/data/db/encryptedDb.ts`, after `savePreferences`, add:

```ts
  /**
   * Read, change and write the preferences in one transaction, so writers
   * changing different preferences at the same time never undo each other
   */
  async updatePreferences(
    update: (current: UserPreferences | undefined) => Partial<Omit<UserPreferences, 'id'>>
  ): Promise<void> {
    await this.db.transaction('rw', this.db.userPreferences, async () => {
      const existing = await this.db.userPreferences.toCollection().first();
      const changes = update(existing);
      if (existing?.id !== undefined) {
        await this.db.userPreferences.update(existing.id, changes);
      } else {
        await this.db.userPreferences.add({ ...DEFAULT_PREFERENCES, ...changes } as UserPreferences);
      }
    });
  }
```

and near the top of the file (after the imports):

```ts
const DEFAULT_PREFERENCES: Omit<UserPreferences, 'id'> = {
  unitPreferences: {},
  personalTargets: {},
  theme: 'system',
  dateFormat: 'MM/DD/YYYY',
};
```

(`UserPreferences` is already imported there; add it to the type import if not.)

- [ ] **Step 4: Run it to watch it pass**

Run: `npx vitest run src/data/db/encryptedDb.preferences.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing provider test**

Create `src/contexts/PreferencesContext.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { PreferencesProvider } from './PreferencesContext';
import { usePreferences } from '@hooks/usePreferences';
import type { UserPreferences } from '@/types';

let stored: Omit<UserPreferences, 'id'> | undefined;
const mockUpdatePreferences = vi.fn();
const mockDb = {
  getPreferences: vi.fn(async () => stored),
  updatePreferences: (...args: unknown[]) => mockUpdatePreferences(...args),
};
vi.mock('@hooks/useEncryptedDb', () => ({ useEncryptedDb: () => ({ db: mockDb, isReady: true }) }));

const base = { unitPreferences: {}, personalTargets: {}, theme: 'system', dateFormat: 'MM/DD/YYYY' } as const;

async function renderLoaded() {
  const hook = renderHook(() => usePreferences(), { wrapper: PreferencesProvider });
  await waitFor(() => expect(hook.result.current.isLoaded).toBe(true));
  return hook;
}

describe('PreferencesProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stored = { ...base, unitPreferences: { glucose: 'mmol/L' }, personalTargets: { glucose: { high: 90 } } };
    mockUpdatePreferences.mockImplementation(async (update: (c: typeof stored) => Partial<UserPreferences>) => {
      stored = { ...base, ...stored, ...update(stored) };
    });
  });

  it('loads the stored unit preferences and personal targets', async () => {
    const { result } = await renderLoaded();
    expect(result.current.unitPreferences).toEqual({ glucose: 'mmol/L' });
    expect(result.current.personalTargets).toEqual({ glucose: { high: 90 } });
  });

  it('saves a preferred unit without touching other preferences', async () => {
    const { result } = await renderLoaded();
    await act(() => result.current.setPreferredUnit('hemoglobin', 'g/L'));

    expect(result.current.unitPreferences).toEqual({ glucose: 'mmol/L', hemoglobin: 'g/L' });
    expect(stored?.unitPreferences).toEqual({ glucose: 'mmol/L', hemoglobin: 'g/L' });
    expect(stored?.personalTargets).toEqual({ glucose: { high: 90 } });
  });

  it('sets and removes a personal target', async () => {
    const { result } = await renderLoaded();
    await act(() => result.current.setPersonalTarget('ferritin', { low: 50 }));
    expect(stored?.personalTargets).toEqual({ glucose: { high: 90 }, ferritin: { low: 50 } });

    await act(() => result.current.setPersonalTarget('glucose', null));
    expect(result.current.personalTargets).toEqual({ ferritin: { low: 50 } });
    expect(stored?.personalTargets).toEqual({ ferritin: { low: 50 } });
  });

  it('goes back to the previous unit when saving fails', async () => {
    const { result } = await renderLoaded();
    mockUpdatePreferences.mockRejectedValueOnce(new Error('disk full'));

    await act(async () => {
      await expect(result.current.setPreferredUnit('glucose', 'mg/dL')).rejects.toThrow('disk full');
    });
    expect(result.current.unitPreferences).toEqual({ glucose: 'mmol/L' });
  });

  it('re-reads the stored preferences on reload', async () => {
    const { result } = await renderLoaded();
    stored = { ...base, personalTargets: { ferritin: { low: 30 } } };

    await act(() => result.current.reload());

    expect(result.current.unitPreferences).toEqual({});
    expect(result.current.personalTargets).toEqual({ ferritin: { low: 30 } });
  });

  it('throws when used outside the provider', () => {
    // React reports the render error; keep the expected error out of the output
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => usePreferences())).toThrow('PreferencesProvider');
    spy.mockRestore();
  });
});
```

If the console guard in `src/test/setup.ts` fails the last test despite the spy, check how other tests in the repo test hooks that throw outside a provider and do the same.

- [ ] **Step 6: Run it to watch it fail**

Run: `npx vitest run src/contexts/PreferencesContext.test.tsx`
Expected: FAIL, cannot resolve `./PreferencesContext`.

- [ ] **Step 7: Implement the hook and provider**

Create `src/hooks/usePreferences.ts`:

```ts
/**
 * Unit preferences and personal targets, shared by every view. Must be used
 * within a PreferencesProvider so a change in one view shows in all.
 */
import { createContext, useContext } from 'react';

export interface PersonalTargetRange {
  low?: number;
  high?: number;
}

export interface PreferencesState {
  /** biomarkerKey → preferred unit */
  unitPreferences: Readonly<Record<string, string>>;
  /** biomarkerKey → personal target, in the biomarker's standard unit */
  personalTargets: Readonly<Record<string, PersonalTargetRange>>;
  /** True once the stored preferences have been read */
  isLoaded: boolean;
  setPreferredUnit(biomarkerKey: string, unit: string): Promise<void>;
  /** null removes the target */
  setPersonalTarget(biomarkerKey: string, target: PersonalTargetRange | null): Promise<void>;
  /** Re-read the stored preferences, e.g. after a backup restore */
  reload(): Promise<void>;
}

export const PreferencesContext = createContext<PreferencesState | null>(null);

export function usePreferences(): PreferencesState {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
}
```

Create `src/contexts/PreferencesContext.tsx`:

```tsx
/**
 * Preferences Context
 *
 * Holds the unit preferences and personal targets in memory. Changes show at
 * once and are saved through EncryptedDb.updatePreferences; a failed save
 * puts the previous value back and rethrows, so the caller can tell the user.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useEncryptedDb } from '@hooks/useEncryptedDb';
import {
  PreferencesContext,
  type PersonalTargetRange,
  type PreferencesState,
} from '@hooks/usePreferences';
import type { UserPreferences } from '@/types';

interface Maps {
  unitPreferences: Record<string, string>;
  personalTargets: Record<string, PersonalTargetRange>;
}

type MapField = keyof Maps;

function fromStored(prefs: UserPreferences | undefined): Maps {
  return {
    unitPreferences: prefs?.unitPreferences ?? {},
    personalTargets: prefs?.personalTargets ?? {},
  };
}

/** The map with `key` set to `value`, or removed when `value` is null */
function withEntry<T>(map: Record<string, T>, key: string, value: T | null): Record<string, T> {
  const next = { ...map };
  if (value === null) delete next[key];
  else next[key] = value;
  return next;
}

export function PreferencesProvider({ children }: { children: ReactNode }): ReactNode {
  const { db, isReady } = useEncryptedDb();
  const [maps, setMaps] = useState<Maps>({ unitPreferences: {}, personalTargets: {} });
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!db || !isReady) return;
    let cancelled = false;
    db.getPreferences()
      .then((prefs) => {
        if (cancelled) return;
        setMaps(fromStored(prefs));
        setIsLoaded(true);
      })
      .catch(() => console.error('Failed to load preferences'));
    return () => {
      cancelled = true;
    };
  }, [db, isReady]);

  const reload = useCallback(async () => {
    if (!db || !isReady) return;
    setMaps(fromStored(await db.getPreferences()));
    setIsLoaded(true);
  }, [db, isReady]);

  // The latest maps, for reading the value a failed save must put back
  const mapsRef = useRef(maps);
  useEffect(() => {
    mapsRef.current = maps;
  }, [maps]);

  const setEntry = useCallback(
    async <F extends MapField>(field: F, key: string, value: Maps[F][string] | null) => {
      const previous = mapsRef.current[field][key] as Maps[F][string] | undefined;
      setMaps((current) => ({ ...current, [field]: withEntry(current[field], key, value) }));
      try {
        if (!db || !isReady) throw new Error('Database not available');
        await db.updatePreferences((stored) => ({
          [field]: withEntry(fromStored(stored)[field], key, value),
        }));
      } catch (err) {
        // Put back what was there, unless a later change replaced it already
        setMaps((current) =>
          current[field][key] === (value ?? undefined)
            ? { ...current, [field]: withEntry(current[field], key, previous ?? null) }
            : current
        );
        throw err;
      }
    },
    [db, isReady]
  );

  const setPreferredUnit = useCallback(
    (biomarkerKey: string, unit: string) => setEntry('unitPreferences', biomarkerKey, unit),
    [setEntry]
  );
  const setPersonalTarget = useCallback(
    (biomarkerKey: string, target: PersonalTargetRange | null) =>
      setEntry('personalTargets', biomarkerKey, target),
    [setEntry]
  );

  const value = useMemo<PreferencesState>(
    () => ({ ...maps, isLoaded, setPreferredUnit, setPersonalTarget, reload }),
    [maps, isLoaded, setPreferredUnit, setPersonalTarget, reload]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
```

If TypeScript cannot narrow `withEntry(current[field], …)` for the generic `F`, cast the map to `Record<string, Maps[F][string]>`; do not widen the public types.

Add the exports:
- `src/hooks/index.ts`: `export { usePreferences, type PreferencesState, type PersonalTargetRange } from './usePreferences';`
- `src/contexts/index.ts`: `export { PreferencesProvider } from './PreferencesContext';`

In `src/App.tsx`, import `PreferencesProvider` from `@contexts` alongside `AlertStateProvider` and nest it directly inside `<AlertStateProvider>`, around what that provider wraps today.

- [ ] **Step 8: Run it to watch it pass**

Run: `npx vitest run src/contexts/PreferencesContext.test.tsx`
Expected: PASS (6 tests), no other output.

- [ ] **Step 9: Alert acknowledgements save through `updatePreferences`**

In `src/contexts/AlertStateContext.test.tsx`, replace the mock db with one whose `updatePreferences` applies the update to a `stored` record (as in the provider test above), and change the assertions on `mockSavePreferences` to assertions on the stored record, e.g. in "persists an acknowledgement":

```ts
    expect(stored?.acknowledgedAlerts).toEqual({
      glucose: '2024-03-10T10:00:00.000Z',
      hemoglobin: '2024-05-01T10:00:00.000Z',
    });
```

and in "keeps dismissals in memory only": `expect(mockUpdatePreferences).not.toHaveBeenCalled();`. Keep every existing test's intent, including the failure test (make `mockUpdatePreferences` reject once).

Run: `npx vitest run src/contexts/AlertStateContext.test.tsx`
Expected: FAIL, `db.savePreferences` is not a function (the mock no longer has it).

Then in `src/contexts/AlertStateContext.tsx`, replace the body of the queued `save` with:

```ts
      const save = saveQueue.current.then(() =>
        db.updatePreferences((prefs) => ({
          acknowledgedAlerts: {
            ...prefs?.acknowledgedAlerts,
            [biomarkerKey]: through.toISOString(),
          },
        }))
      );
```

Run: `npx vitest run src/contexts/AlertStateContext.test.tsx`
Expected: PASS.

- [ ] **Step 10: Reload preferences after a restore**

In `src/components/layout/AppShell.tsx`, import `usePreferences` from `@hooks` and in `AppShell` add `const { reload: reloadPreferences } = usePreferences();`. In `handleRestore`, right after `const restored = await restoreBackup(db, data);`, add:

```ts
        // A backup can bring unit preferences and personal targets
        await reloadPreferences();
```

and add `reloadPreferences` to the callback's dependency list. (AppShell has no unit test; the E2E "should show a personal target next to the standard range" pins this.)

- [ ] **Step 11: Run the affected suites**

Run: `npx vitest run src/contexts src/data/db --maxWorkers=4`
Expected: PASS, no output besides results.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 12: Commit**

```bash
git add src/data/db/encryptedDb.ts src/data/db/encryptedDb.preferences.test.ts src/hooks/usePreferences.ts src/hooks/index.ts src/contexts/PreferencesContext.tsx src/contexts/PreferencesContext.test.tsx src/contexts/index.ts src/contexts/AlertStateContext.tsx src/contexts/AlertStateContext.test.tsx src/App.tsx src/components/layout/AppShell.tsx
git commit -m "feat(preferences): share unit preferences and targets, saved atomically"
```

---

### Task 3: Display-unit helpers

**Files:**
- Create: `src/services/units/displayUnit.ts`, `src/services/units/displayUnit.test.ts`
- Modify: `src/services/units/index.ts`

**Interfaces:**
- Produces (exported from `@services/units`):

```ts
/** What a biomarker definition needs to offer units */
export interface UnitSource { name: string; canonicalUnit: string; alternativeUnits?: string[] }
/** Standard unit first, then every alternative the standard unit converts to */
export function preferredUnitOptions(definition: UnitSource): string[];
/** The stored preference if the biomarker offers it, else undefined */
export function preferredUnitFor(definition: UnitSource | undefined, preferred: string | undefined): string | undefined;
/** Unit a biomarker is shown in: the offered preference, else the standard unit; undefined when not in the dictionary */
export function resolveDisplayUnit(definition: UnitSource | undefined, preferred: string | undefined): string | undefined;
export interface DisplayableValue { value: unknown; unit: string; referenceRangeLow?: number; referenceRangeHigh?: number; numericValueType?: string }
/** The value and its range in `targetUnit`; unchanged when there is no target, the value is not a plain number, or it cannot be converted */
export function convertForDisplay<T extends DisplayableValue>(biomarkerName: string, item: T, targetUnit: string | undefined): T;
```

- [ ] **Step 1: Write the failing tests**

Create `src/services/units/displayUnit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  convertForDisplay,
  preferredUnitFor,
  preferredUnitOptions,
  resolveDisplayUnit,
} from './displayUnit';

const GLUCOSE = { name: 'Glucose', canonicalUnit: 'mg/dL', alternativeUnits: ['mmol/L'] };

describe('preferredUnitOptions', () => {
  it('lists the standard unit first, then the units it converts to', () => {
    expect(preferredUnitOptions(GLUCOSE)).toEqual(['mg/dL', 'mmol/L']);
  });

  it('leaves out alternatives the standard unit cannot be converted to', () => {
    expect(
      preferredUnitOptions({ ...GLUCOSE, alternativeUnits: ['mmol/L', 'stones'] })
    ).toEqual(['mg/dL', 'mmol/L']);
  });

  it('offers only the standard unit when there are no alternatives', () => {
    expect(preferredUnitOptions({ name: 'Glucose', canonicalUnit: 'mg/dL' })).toEqual(['mg/dL']);
  });
});

describe('preferredUnitFor and resolveDisplayUnit', () => {
  it('uses an offered preference', () => {
    expect(preferredUnitFor(GLUCOSE, 'mmol/L')).toBe('mmol/L');
    expect(resolveDisplayUnit(GLUCOSE, 'mmol/L')).toBe('mmol/L');
  });

  it('ignores a stored preference the biomarker does not offer', () => {
    expect(preferredUnitFor(GLUCOSE, 'stones')).toBeUndefined();
    expect(resolveDisplayUnit(GLUCOSE, 'stones')).toBe('mg/dL');
  });

  it('falls back to the standard unit without a preference', () => {
    expect(preferredUnitFor(GLUCOSE, undefined)).toBeUndefined();
    expect(resolveDisplayUnit(GLUCOSE, undefined)).toBe('mg/dL');
  });

  it('has no display unit for a biomarker outside the dictionary', () => {
    expect(resolveDisplayUnit(undefined, 'mmol/L')).toBeUndefined();
  });
});

describe('convertForDisplay', () => {
  const value = { id: 7, value: 100, unit: 'mg/dL', referenceRangeLow: 70, referenceRangeHigh: 100 };

  it('converts the value and its range, keeping other fields', () => {
    expect(convertForDisplay('Glucose', value, 'mmol/L')).toEqual({
      id: 7,
      value: 5.55,
      unit: 'mmol/L',
      referenceRangeLow: expect.closeTo(3.89, 1),
      referenceRangeHigh: 5.55,
    });
  });

  it('returns the value unchanged without a target unit', () => {
    expect(convertForDisplay('Glucose', value, undefined)).toBe(value);
  });

  it('keeps a value that is not a plain number as recorded', () => {
    const positive = { value: true, unit: '' };
    expect(convertForDisplay('Glucose', positive, 'mmol/L')).toBe(positive);
    const interval = { ...value, numericValueType: 'interval' };
    expect(convertForDisplay('Glucose', interval, 'mmol/L')).toBe(interval);
  });

  it('keeps a value whose unit cannot be converted', () => {
    const odd = { value: 2, unit: '/HPF' };
    expect(convertForDisplay('Glucose', odd, 'mmol/L')).toEqual(odd);
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `npx vitest run src/services/units/displayUnit.test.ts`
Expected: FAIL, cannot resolve `./displayUnit`.

- [ ] **Step 3: Implement**

Create `src/services/units/displayUnit.ts`:

```ts
/**
 * Which unit a biomarker is shown in, and converting a value for display.
 *
 * A preference only counts when the biomarker offers that unit, so a stale
 * or edited preference (from an old backup) can never mislabel a value.
 */
import { canConvert } from './conversion';
import { convertMeasurement } from './convertMeasurement';

/** What a biomarker definition needs to offer units */
export interface UnitSource {
  name: string;
  canonicalUnit: string;
  alternativeUnits?: string[];
}

/** Standard unit first, then every alternative the standard unit converts to */
export function preferredUnitOptions(definition: UnitSource): string[] {
  const units = new Set([definition.canonicalUnit, ...(definition.alternativeUnits ?? [])]);
  return [...units].filter(
    (unit) =>
      unit === definition.canonicalUnit ||
      canConvert(definition.name, definition.canonicalUnit, unit)
  );
}

/** The stored preference if the biomarker offers it, else undefined */
export function preferredUnitFor(
  definition: UnitSource | undefined,
  preferred: string | undefined
): string | undefined {
  if (!definition || !preferred) return undefined;
  return preferredUnitOptions(definition).includes(preferred) ? preferred : undefined;
}

/**
 * Unit a biomarker is shown in: the offered preference, else the standard
 * unit; undefined when the biomarker is not in the dictionary
 */
export function resolveDisplayUnit(
  definition: UnitSource | undefined,
  preferred: string | undefined
): string | undefined {
  return preferredUnitFor(definition, preferred) ?? definition?.canonicalUnit;
}

export interface DisplayableValue {
  value: unknown;
  unit: string;
  referenceRangeLow?: number;
  referenceRangeHigh?: number;
  numericValueType?: string;
}

/**
 * The value and its range in `targetUnit`. Unchanged when there is no
 * target, the value is not a plain number (Positive/Negative, text, an
 * interval), or it cannot be converted.
 */
export function convertForDisplay<T extends DisplayableValue>(
  biomarkerName: string,
  item: T,
  targetUnit: string | undefined
): T {
  if (!targetUnit || typeof item.value !== 'number' || item.numericValueType === 'interval') {
    return item;
  }
  const converted = convertMeasurement(
    biomarkerName,
    {
      value: item.value,
      unit: item.unit,
      referenceRangeLow: item.referenceRangeLow,
      referenceRangeHigh: item.referenceRangeHigh,
    },
    targetUnit
  );
  if (converted.unit === item.unit) return item;
  return {
    ...item,
    value: converted.value,
    unit: converted.unit,
    referenceRangeLow: converted.referenceRange.low,
    referenceRangeHigh: converted.referenceRange.high,
  };
}
```

Add to `src/services/units/index.ts`:

```ts
export {
  preferredUnitOptions,
  preferredUnitFor,
  resolveDisplayUnit,
  convertForDisplay,
  type UnitSource,
  type DisplayableValue,
} from './displayUnit';
```

- [ ] **Step 4: Run them to watch them pass**

Run: `npx vitest run src/services/units`
Expected: PASS. If the converted range bound for 70 mg/dL is not 3.89 within the `closeTo` tolerance, read `getPrecisionForValue` in `conversion.ts` and set the expectation to its actual rounding; the value 5.55 must stay as is (the E2E depends on it).

- [ ] **Step 5: Commit**

```bash
git add src/services/units/displayUnit.ts src/services/units/displayUnit.test.ts src/services/units/index.ts
git commit -m "feat(units): decide and convert the unit a biomarker is shown in"
```

---

### Task 4: Preferred unit in Trends

**Files:**
- Create: `src/components/trends/PreferredUnitSelect.tsx`, `src/components/trends/PreferredUnitSelect.test.tsx`
- Modify: `src/components/trends/TrendsView.tsx`, `src/components/trends/TrendsView.test.tsx`

**Interfaces:**
- Consumes: `usePreferences()` (Task 2); `preferredUnitOptions`, `resolveDisplayUnit` (Task 3).
- Produces: `PreferredUnitSelect({ biomarkerName, units, value, onChange }: PreferredUnitSelectProps)`.

- [ ] **Step 1: Write the failing select test**

Create `src/components/trends/PreferredUnitSelect.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { PreferredUnitSelect } from './PreferredUnitSelect';

function renderSelect(onChange = vi.fn()) {
  render(
    <MantineProvider env="test">
      <PreferredUnitSelect
        biomarkerName="Glucose"
        units={['mg/dL', 'mmol/L']}
        value="mg/dL"
        onChange={onChange}
      />
    </MantineProvider>
  );
  return { onChange, input: screen.getByRole('textbox', { name: 'Preferred unit' }) };
}

describe('PreferredUnitSelect', () => {
  it('shows the current unit', () => {
    const { input } = renderSelect();
    expect(input).toHaveValue('mg/dL');
  });

  it('offers the given units and reports the one chosen', async () => {
    const { input, onChange } = renderSelect();
    await userEvent.click(input);
    await userEvent.click(await screen.findByRole('option', { name: 'mmol/L' }));
    expect(onChange).toHaveBeenCalledWith('mmol/L');
  });

  it('says a typed unit is not supported and keeps the current one', async () => {
    const { input, onChange } = renderSelect();
    await userEvent.clear(input);
    await userEvent.type(input, 'stones');

    expect(screen.getByText('Unit not supported for Glucose')).toBeInTheDocument();
    expect(input).toHaveAccessibleDescription('Unit not supported for Glucose');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('replaces the current unit when typing after focusing', async () => {
    const { input } = renderSelect();
    input.focus();
    await userEvent.keyboard('mmol');
    expect(input).toHaveValue('mmol');
  });

  it('shows no error while the typed text matches a unit', async () => {
    const { input } = renderSelect();
    await userEvent.clear(input);
    await userEvent.type(input, 'mmol');
    expect(screen.queryByText('Unit not supported for Glucose')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to watch it fail**

Run: `npx vitest run src/components/trends/PreferredUnitSelect.test.tsx`
Expected: FAIL, cannot resolve `./PreferredUnitSelect`.

- [ ] **Step 3: Implement the select**

Create `src/components/trends/PreferredUnitSelect.tsx`:

```tsx
/**
 * PreferredUnitSelect Component
 *
 * Searchable select for the unit a biomarker is shown in. Typed text that
 * matches no offered unit shows an error; the current unit stays until an
 * offered one is chosen.
 */

import { useState } from 'react';
import { Select } from '@mantine/core';

export interface PreferredUnitSelectProps {
  /** Biomarker display name, for the error message */
  biomarkerName: string;
  /** Units the biomarker can be shown in */
  units: string[];
  /** The unit shown now */
  value: string;
  onChange: (unit: string) => void;
}

export function PreferredUnitSelect({
  biomarkerName,
  units,
  value,
  onChange,
}: PreferredUnitSelectProps): React.ReactNode {
  // Search stays uncontrolled so Mantine keeps it in step with the value;
  // this copy only decides whether to show the error
  const [search, setSearch] = useState(value);
  const term = search.trim().toLowerCase();
  const unsupported = term !== '' && !units.some((unit) => unit.toLowerCase().includes(term));

  return (
    <Select
      label="Preferred unit"
      data={units}
      value={value}
      onChange={(unit) => {
        if (unit) onChange(unit);
      }}
      onSearchChange={setSearch}
      // Typing after focusing replaces the shown unit instead of appending
      onFocus={(event) => event.currentTarget.select()}
      searchable
      allowDeselect={false}
      error={unsupported ? `Unit not supported for ${biomarkerName}` : undefined}
      w={180}
    />
  );
}
```

- [ ] **Step 4: Run it to watch it pass**

Run: `npx vitest run src/components/trends/PreferredUnitSelect.test.tsx`
Expected: PASS (5 tests). If `toHaveAccessibleDescription` fails, Mantine did not link the error to the input: pass `aria-describedby` is Mantine's job, so check the Mantine version's `error` handling before adding anything by hand.

- [ ] **Step 5: Write the failing Trends tests**

In `src/components/trends/TrendsView.test.tsx`:

Add a preferences mock next to the other `vi.mock` calls:

```tsx
const mockSetPreferredUnit = vi.fn();
let mockUnitPreferences: Record<string, string> = {};
vi.mock('@hooks/usePreferences', () => ({
  usePreferences: () => ({
    unitPreferences: mockUnitPreferences,
    personalTargets: {},
    isLoaded: true,
    setPreferredUnit: mockSetPreferredUnit,
    setPersonalTarget: vi.fn(),
    reload: vi.fn(),
  }),
}));

const mockShowNotification = vi.fn();
vi.mock('@mantine/notifications', () => ({
  notifications: { show: (...args: unknown[]) => mockShowNotification(...args) },
}));
```

In the dictionary mock, give Glucose its alternative unit: `{ name: 'Glucose', category: 'metabolic', canonicalUnit: 'mg/dL', alternativeUnits: ['mmol/L'] }`.

In the file's top-level `beforeEach` (add one if there is none), reset: `mockUnitPreferences = {}; mockSetPreferredUnit.mockReset().mockResolvedValue(undefined); mockShowNotification.mockReset();`.

Add a describe (reuse the file's existing helpers that render TrendsView with two Glucose values in mg/dL and select Glucose; the code below calls them `renderWithGlucose()`; use whatever the file already has for that, and write such a helper if it has none):

```tsx
describe('preferred unit', () => {
  it('shows glucose in the stored preferred unit', async () => {
    mockUnitPreferences = { glucose: 'mmol/L' };
    await renderWithGlucose();

    expect(screen.getByRole('textbox', { name: 'Preferred unit' })).toHaveValue('mmol/L');
    expect(screen.getByText('Glucose (mmol/L)')).toBeInTheDocument();
  });

  it('saves the unit chosen in the select', async () => {
    await renderWithGlucose();
    await userEvent.click(screen.getByRole('textbox', { name: 'Preferred unit' }));
    await userEvent.click(await screen.findByRole('option', { name: 'mmol/L' }));

    expect(mockSetPreferredUnit).toHaveBeenCalledWith('glucose', 'mmol/L');
  });

  it('tells the user when the unit could not be saved', async () => {
    mockSetPreferredUnit.mockRejectedValueOnce(new Error('disk full'));
    await renderWithGlucose();
    await userEvent.click(screen.getByRole('textbox', { name: 'Preferred unit' }));
    await userEvent.click(await screen.findByRole('option', { name: 'mmol/L' }));

    await waitFor(() =>
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Preferred unit not saved', color: 'red' })
      )
    );
  });

  it('offers no unit choice for a biomarker outside the dictionary', async () => {
    await renderWithUnknownBiomarker();
    expect(screen.queryByRole('textbox', { name: 'Preferred unit' })).not.toBeInTheDocument();
  });
});
```

`renderWithUnknownBiomarker()` renders with values whose `rawText` the dictionary mock does not know (e.g. `'Mystery Marker'`) and selects it, the same way the file selects other biomarkers. The biomarker key used for Glucose must be `glucose` in these tests' values.

- [ ] **Step 6: Run them to watch them fail**

Run: `npx vitest run src/components/trends/TrendsView.test.tsx`
Expected: the 4 new tests FAIL (no `Preferred unit` textbox); the existing tests pass.

- [ ] **Step 7: Implement in TrendsView**

In `src/components/trends/TrendsView.tsx`:

Imports:

```tsx
import { notifications } from '@mantine/notifications';
import { usePreferences } from '@hooks/usePreferences';
import { convertMeasurement, preferredUnitOptions, resolveDisplayUnit } from '@services/units';
import { PreferredUnitSelect } from './PreferredUnitSelect';
```

(replace the existing `convertMeasurement` import.)

In the component: `const { unitPreferences, setPreferredUnit } = usePreferences();`

In `biomarkerDataMap`, add `unitOptions: string[]` to the entry type, and when creating an entry replace the `canonicalUnit` lines with:

```tsx
          // The preferred unit when the biomarker offers it, else its standard
          // unit; biomarkers outside the dictionary keep their first unit
          map.set(biomarkerKey, {
            name: biomarkerDef?.name || testValue.rawText || 'Unknown biomarker',
            unit: resolveDisplayUnit(biomarkerDef, unitPreferences[biomarkerKey]) ?? testValue.unit,
            unitOptions: biomarkerDef ? preferredUnitOptions(biomarkerDef) : [],
            category: biomarkerDef?.category || 'other',
            dataPoints: [],
            labInfoMap: new Map(),
          });
```

and change the memo's dependencies to `[results, unitPreferences]`.

Add a handler after `handleReset`:

```tsx
  const handlePreferredUnitChange = useCallback(
    (unit: string) => {
      if (!selectedBiomarkerId) return;
      setPreferredUnit(selectedBiomarkerId, unit).catch(() => {
        notifications.show({
          title: 'Preferred unit not saved',
          message: 'Your choice could not be saved. Try again.',
          color: 'red',
        });
      });
    },
    [selectedBiomarkerId, setPreferredUnit]
  );
```

In the controls `Paper`, after `<TrendChartControls … />`:

```tsx
        {selectedBiomarkerData && selectedBiomarkerData.unitOptions.length > 1 && (
          <Group mt="sm">
            <PreferredUnitSelect
              // A new biomarker starts with its own unit in the search
              key={selectedBiomarkerId}
              biomarkerName={selectedBiomarkerData.name}
              units={selectedBiomarkerData.unitOptions}
              value={selectedBiomarkerData.unit}
              onChange={handlePreferredUnitChange}
            />
          </Group>
        )}
```

The statistics, the reference range and the compare chart already take their unit from the converted data points, so they follow.

- [ ] **Step 8: Run them to watch them pass**

Run: `npx vitest run src/components/trends --maxWorkers=4`
Expected: PASS, no output besides results.

- [ ] **Step 9: Run the Trends E2E**

Run: `npx playwright test e2e/unit-conversion.spec.ts --project=chromium --workers=2 --reporter=line`
Expected: every test passes except `should show the preferred unit on the timeline and in alerts` (Task 5).

- [ ] **Step 10: Commit**

```bash
git add src/components/trends/PreferredUnitSelect.tsx src/components/trends/PreferredUnitSelect.test.tsx src/components/trends/TrendsView.tsx src/components/trends/TrendsView.test.tsx
git commit -m "feat(trends): choose the unit a biomarker is shown in"
```

---

### Task 5: Preferred unit on the timeline and in alerts

**Files:**
- Modify: `src/components/timeline/TestValuesList.tsx`, `src/components/timeline/TestValuesList.test.tsx`
- Modify: `src/components/timeline/LabResultCard.test.tsx`, `src/components/timeline/TimelineView.test.tsx` (preferences mock only)
- Modify: `src/hooks/useAlerts.ts`, `src/hooks/useAlerts.test.ts`

**Interfaces:**
- Consumes: `usePreferences()` (Task 2); `preferredUnitFor`, `convertForDisplay` (Task 3).

- [ ] **Step 1: Write the failing timeline test**

In `src/components/timeline/TestValuesList.test.tsx`, add a preferences mock (and the same mock, with empty maps, to `LabResultCard.test.tsx` and `TimelineView.test.tsx`, which render TestValuesList):

```tsx
let mockUnitPreferences: Record<string, string> = {};
vi.mock('@hooks/usePreferences', () => ({
  usePreferences: () => ({
    unitPreferences: mockUnitPreferences,
    personalTargets: {},
    isLoaded: true,
    setPreferredUnit: vi.fn(),
    setPersonalTarget: vi.fn(),
    reload: vi.fn(),
  }),
}));
```

Reset `mockUnitPreferences = {}` in `beforeEach`. Then add, using the file's existing test-value factory with a Glucose value (`biomarkerKey: 'glucose'`, `rawText: 'Glucose'`, 100 mg/dL, range 70–100; if the file mocks the dictionary, make that mock return a Glucose definition with `canonicalUnit: 'mg/dL', alternativeUnits: ['mmol/L']` for it):

```tsx
  it('shows a value in the preferred unit, with its range', () => {
    mockUnitPreferences = { glucose: 'mmol/L' };
    renderList([glucoseValue({ value: 100, unit: 'mg/dL', referenceRangeLow: 70, referenceRangeHigh: 100 })]);

    const row = screen.getByRole('row', { name: /^Glucose: 5\.55 mmol\/L,/ });
    expect(within(row).getByText('mmol/L')).toBeInTheDocument();
    expect(within(row).getByText(/ - 5\.55 mmol\/L$/)).toBeInTheDocument();
  });

  it('shows a value as recorded without a preference', () => {
    renderList([glucoseValue({ value: 100, unit: 'mg/dL' })]);
    expect(screen.getByRole('row', { name: /^Glucose: 100 mg\/dL,/ })).toBeInTheDocument();
  });
```

(`renderList` and `glucoseValue` stand for the file's own render helper and factory; write them if absent.)

Run: `npx vitest run src/components/timeline/TestValuesList.test.tsx`
Expected: the preferred-unit test FAILS (row shows 100 mg/dL).

- [ ] **Step 2: Implement in TestValuesList**

In `src/components/timeline/TestValuesList.tsx`, import:

```tsx
import { usePreferences } from '@hooks/usePreferences';
import { convertForDisplay, preferredUnitFor } from '@services/units';
```

At the top of `TestValuesList`, before the empty-state return: `const { unitPreferences } = usePreferences();`

In the `testValues.map`, replace `(testValue) => {` with:

```tsx
        {testValues.map((recorded) => {
          // Shown in the preferred unit when one is set and the value converts
          const definition = getBiomarkerForTestValue(recorded);
          const testValue = convertForDisplay(
            definition?.name ?? '',
            recorded,
            preferredUnitFor(definition, unitPreferences[recorded.biomarkerKey])
          );
```

Everything below keeps reading `testValue`, so the value, unit, range and row label follow. Keep `key={testValue.id}`.

Run: `npx vitest run src/components/timeline --maxWorkers=4`
Expected: PASS, no output besides results.

- [ ] **Step 3: Write the failing alerts test**

In `src/hooks/useAlerts.test.ts`, add the same preferences mock as Step 1 but for the relative path: `vi.mock('./usePreferences', () => ({ usePreferences: () => ({ unitPreferences: mockUnitPreferences, … }) }))`, with `mockUnitPreferences` reset in `beforeEach`. Make the file's dictionary mock give Glucose `alternativeUnits: ['mmol/L']` and `canonicalUnit: 'mg/dL'`. Add, following the file's existing pattern for an out-of-range glucose value (key `glucose`, 120 mg/dL, range 70–100, status `high`):

```ts
  it('reports an out-of-range value in the preferred unit', () => {
    mockUnitPreferences = { glucose: 'mmol/L' };
    // …mock useLabResults with one lab result holding the high glucose value…
    const { result } = renderHook(() => useAlerts());

    const alert = result.current.alerts.find((a) => a.type === 'out_of_range');
    expect(alert).toEqual(expect.objectContaining({ value: 6.66, unit: 'mmol/L' }));
    expect(alert?.message).toContain('Glucose is high at 6.66 mmol/L');
    expect(alert?.referenceRange?.high).toBe(5.55);
  });
```

Run: `npx vitest run src/hooks/useAlerts.test.ts`
Expected: the new test FAILS (value 120 mg/dL).

- [ ] **Step 4: Implement in useAlerts**

In `src/hooks/useAlerts.ts`, import `usePreferences` from `./usePreferences` and `convertForDisplay, preferredUnitFor` from `@services/units` (beside `convertMeasurement`). In the hook: `const { unitPreferences } = usePreferences();` and add `unitPreferences` to the dependency list of the memo or callback that builds the alert list.

Per biomarker, before the out-of-range loop:

```ts
      // Alerts state values in the preferred unit when one is set
      const preferredUnit = preferredUnitFor(biomarkerDef, unitPreferences[biomarkerKey]);
      const shown = (tv: (typeof sortedValues)[number]) =>
        convertForDisplay(biomarkerName, tv, preferredUnit);
```

Then:
- In the out-of-range loop, after the status check, add `const display = shown(testValue);` and build `referenceRange` from `display.referenceRangeLow/High`; use `display.value` and `display.unit` for `value`, `unit` and `outOfRangeMessage`. Keep `outOfRangeSeverity` on the recorded `testValue.value` and its recorded range: the severity is a ratio and must not change with the unit.
- For the trend: `const trendUnit = preferredUnit ?? biomarkerDef?.canonicalUnit ?? sortedValues[0].unit;`. For its `value`, `unit` and `referenceRange`, use `shown(latestValue)`.
- For the improvement alert, use `shown(latestValue)` the same way.

Run: `npx vitest run src/hooks/useAlerts.test.ts src/components/alerts --maxWorkers=4`
Expected: PASS, no output besides results.

- [ ] **Step 5: Run the unit-conversion E2E**

Run: `npx playwright test e2e/unit-conversion.spec.ts e2e/alerts.spec.ts e2e/timeline-view.spec.ts --project=chromium --workers=2 --reporter=line`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/timeline src/hooks/useAlerts.ts src/hooks/useAlerts.test.ts
git commit -m "feat(units): show the preferred unit on the timeline and in alerts"
```

---

### Task 6: Related biomarkers in the dictionary

**Files:**
- Create: `src/data/biomarkers/related.ts`, `src/data/biomarkers/related.test.ts`
- Modify: `src/data/biomarkers/dictionary.ts`
- Modify: `src/components/dictionary/BiomarkerDetail.test.tsx` (test literals gain `related: []`)

**Interfaces:**
- Produces: `BiomarkerDefinition.related: string[]` (keys of related biomarkers, never its own key); `RELATED_BIOMARKER_GROUPS: Readonly<Record<string, readonly string[]>>`; `relatedKeysFor(key: string): string[]`.

- [ ] **Step 1: Write the failing test**

Create `src/data/biomarkers/related.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BIOMARKER_DEFINITIONS, getBiomarkerByKey } from './dictionary';
import { RELATED_BIOMARKER_GROUPS } from './related';

describe('related biomarkers', () => {
  it('curates the groups the spec names', () => {
    expect(Object.keys(RELATED_BIOMARKER_GROUPS).sort()).toEqual(
      ['cbc-indices', 'electrolytes', 'glucose-metabolism', 'iron', 'kidney', 'lipids', 'liver', 'thyroid'].sort()
    );
  });

  it('only names biomarkers that exist', () => {
    for (const biomarker of BIOMARKER_DEFINITIONS) {
      for (const key of biomarker.related) {
        expect(getBiomarkerByKey(key), `${biomarker.key} → ${key}`).toBeDefined();
      }
    }
    for (const keys of Object.values(RELATED_BIOMARKER_GROUPS)) {
      for (const key of keys) expect(getBiomarkerByKey(key), key).toBeDefined();
    }
  });

  it('relates biomarkers both ways and never to themselves', () => {
    for (const biomarker of BIOMARKER_DEFINITIONS) {
      expect(biomarker.related).not.toContain(biomarker.key);
      for (const key of biomarker.related) {
        expect(getBiomarkerByKey(key)?.related, `${key} → ${biomarker.key}`).toContain(biomarker.key);
      }
    }
  });

  it('relates glucose to HbA1c', () => {
    expect(getBiomarkerByKey('glucose')?.related).toContain('hemoglobin-a1c');
  });

  it('gives biomarkers outside the groups no relations', () => {
    expect(getBiomarkerByKey('semen-volume')?.related).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to watch it fail**

Run: `npx vitest run src/data/biomarkers/related.test.ts`
Expected: FAIL, cannot resolve `./related`.

- [ ] **Step 3: Implement**

Create `src/data/biomarkers/related.ts`:

```ts
/**
 * Curated groups of biomarkers that are read together. Every member of a
 * group is related to every other member, so relations are symmetric.
 */
export const RELATED_BIOMARKER_GROUPS: Readonly<Record<string, readonly string[]>> = {
  lipids: [
    'total-cholesterol',
    'ldl-cholesterol',
    'hdl-cholesterol',
    'triglycerides',
    'vldl-cholesterol',
    'non-hdl-cholesterol',
  ],
  'cbc-indices': [
    'red-blood-cell-count',
    'hemoglobin',
    'hematocrit',
    'mean-corpuscular-volume',
    'mean-corpuscular-hemoglobin',
    'mean-corpuscular-hemoglobin-concentration',
    'red-cell-distribution-width',
  ],
  thyroid: ['thyroid-stimulating-hormone', 'free-t4', 'total-t4', 'free-t3', 'total-t3', 'tpo-antibodies'],
  kidney: [
    'creatinine',
    'blood-urea-nitrogen',
    'egfr',
    'urine-creatinine',
    'microalbumin',
    'albumin-creatinine-ratio',
    'protein-creatinine-ratio',
  ],
  liver: [
    'alanine-aminotransferase',
    'aspartate-aminotransferase',
    'alkaline-phosphatase',
    'bilirubin-total',
    'bilirubin-direct',
    'gamma-glutamyl-transferase',
    'albumin',
    'total-protein',
  ],
  iron: ['serum-iron', 'ferritin', 'total-iron-binding-capacity', 'transferrin-saturation', 'transferrin'],
  'glucose-metabolism': ['glucose', 'hemoglobin-a1c', 'fructosamine', 'urine-glucose'],
  electrolytes: ['sodium', 'potassium', 'chloride', 'carbon-dioxide', 'calcium', 'magnesium'],
};

/** Keys related to `key`: the other members of every group it belongs to */
export function relatedKeysFor(key: string): string[] {
  const related = new Set<string>();
  for (const group of Object.values(RELATED_BIOMARKER_GROUPS)) {
    if (!group.includes(key)) continue;
    for (const member of group) if (member !== key) related.add(member);
  }
  return [...related];
}
```

In `src/data/biomarkers/dictionary.ts`:
- Add to `BiomarkerDefinition`, after `lowIndication`:

```ts
  /** Keys of biomarkers read together with this one (see related.ts) */
  related: string[];
```

- Below the interface, add:

```ts
/** A dictionary entry as written; `related` is filled in from the curated groups */
type BiomarkerEntry = Omit<BiomarkerDefinition, 'related'>;
```

- Change the type of each of the 12 category arrays from `BiomarkerDefinition[]` to `BiomarkerEntry[]`:
  `sed -i 's/^const \([a-zA-Z]*\)Biomarkers: BiomarkerDefinition\[\] = \[/const \1Biomarkers: BiomarkerEntry[] = [/' src/data/biomarkers/dictionary.ts`
  then check with `grep -n "Biomarkers: Biomarker" src/data/biomarkers/dictionary.ts` that all 12 changed.
- Import `relatedKeysFor` from `./related`, and make `BIOMARKER_DEFINITIONS`:

```ts
export const BIOMARKER_DEFINITIONS: BiomarkerDefinition[] = [
  ...cbcBiomarkers,
  // …the same spread list as today…
  ...proteinElectrophoresisBiomarkers,
].map((entry) => ({ ...entry, related: relatedKeysFor(entry.key) }));
```

In `src/components/dictionary/BiomarkerDetail.test.tsx`, add `related: []` to every `BiomarkerDefinition` literal so it type-checks.

- [ ] **Step 4: Run them to watch them pass**

Run: `npx vitest run src/data/biomarkers src/components/dictionary --maxWorkers=4`
Expected: PASS.

Run: `npx tsc -b --noEmit 2>&1 | tail -20` (or `npm run build` if `tsc -b --noEmit` is not how the project type-checks)
Expected: no errors. Any other test literal typed as `BiomarkerDefinition` gets `related: []`.

- [ ] **Step 5: Commit**

```bash
git add src/data/biomarkers src/components/dictionary/BiomarkerDetail.test.tsx
git commit -m "feat(dictionary): relate biomarkers that are read together"
```

---

### Task 7: Result summary for a biomarker

**Files:**
- Create: `src/services/statistics/biomarkerSummary.ts`, `src/services/statistics/biomarkerSummary.test.ts`
- Modify: `src/services/statistics/index.ts`

**Interfaces:**
- Consumes: `convertForDisplay` (Task 3).
- Produces:

```ts
export interface SummarizableResult {
  date: Date;
  labName: string;
  testValues: ReadonlyArray<{
    biomarkerKey: string;
    value: number | string | boolean;
    unit: string;
    status: 'normal' | 'low' | 'high' | 'unknown';
    numericValueType?: string;
  }>;
}
export interface BiomarkerResultSummary {
  /** Number of recorded values for the biomarker */
  count: number;
  latest: { value: number | string | boolean; unit: string; date: Date; status: 'normal' | 'low' | 'high' | 'unknown'; labName: string };
}
/** null when the biomarker has no recorded values */
export function summarizeBiomarkerResults(
  results: ReadonlyArray<SummarizableResult>,
  biomarker: { key: string; name: string },
  displayUnit?: string
): BiomarkerResultSummary | null;
```

- [ ] **Step 1: Write the failing test**

Create `src/services/statistics/biomarkerSummary.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { summarizeBiomarkerResults, type SummarizableResult } from './biomarkerSummary';

const GLUCOSE = { key: 'glucose', name: 'Glucose' };

function result(day: string, values: SummarizableResult['testValues']): SummarizableResult {
  return { date: new Date(`${day}T12:00:00Z`), labName: `Lab ${day}`, testValues: values };
}

const glucose = (value: number | string | boolean, status: 'normal' | 'high' | 'low' | 'unknown' = 'normal') => ({
  biomarkerKey: 'glucose',
  value,
  unit: 'mg/dL',
  status,
});

describe('summarizeBiomarkerResults', () => {
  it('returns null without recorded values', () => {
    expect(summarizeBiomarkerResults([result('2024-01-15', [])], GLUCOSE)).toBeNull();
  });

  it('counts the values and reports the newest, whatever the order of results', () => {
    const summary = summarizeBiomarkerResults(
      [
        result('2024-02-20', [glucose(120, 'high')]),
        result('2024-01-15', [glucose(95), { ...glucose(14), biomarkerKey: 'hemoglobin' }]),
        result('2024-01-30', [glucose(99)]),
      ],
      GLUCOSE
    );
    expect(summary).toEqual({
      count: 3,
      latest: {
        value: 120,
        unit: 'mg/dL',
        date: new Date('2024-02-20T12:00:00Z'),
        status: 'high',
        labName: 'Lab 2024-02-20',
      },
    });
  });

  it('reports the latest value in the display unit', () => {
    const summary = summarizeBiomarkerResults([result('2024-02-20', [glucose(100)])], GLUCOSE, 'mmol/L');
    expect(summary?.latest).toEqual(expect.objectContaining({ value: 5.55, unit: 'mmol/L' }));
  });

  it('reports a latest value that is not a number as recorded', () => {
    const summary = summarizeBiomarkerResults(
      [result('2024-02-20', [glucose(true, 'unknown')])],
      GLUCOSE,
      'mmol/L'
    );
    expect(summary?.latest).toEqual(expect.objectContaining({ value: true, unit: 'mg/dL', status: 'unknown' }));
  });
});
```

- [ ] **Step 2: Run it to watch it fail**

Run: `npx vitest run src/services/statistics/biomarkerSummary.test.ts`
Expected: FAIL, cannot resolve `./biomarkerSummary`.

- [ ] **Step 3: Implement**

Create `src/services/statistics/biomarkerSummary.ts`:

```ts
/**
 * Summary of one biomarker's recorded values: how many there are, and the
 * newest one (in the display unit when it converts).
 */
import { convertForDisplay } from '@services/units';

type Status = 'normal' | 'low' | 'high' | 'unknown';

export interface SummarizableResult {
  date: Date;
  labName: string;
  testValues: ReadonlyArray<{
    biomarkerKey: string;
    value: number | string | boolean;
    unit: string;
    status: Status;
    numericValueType?: string;
  }>;
}

export interface BiomarkerResultSummary {
  /** Number of recorded values for the biomarker */
  count: number;
  latest: {
    value: number | string | boolean;
    unit: string;
    date: Date;
    status: Status;
    labName: string;
  };
}

/** null when the biomarker has no recorded values */
export function summarizeBiomarkerResults(
  results: ReadonlyArray<SummarizableResult>,
  biomarker: { key: string; name: string },
  displayUnit?: string
): BiomarkerResultSummary | null {
  let count = 0;
  let latest: BiomarkerResultSummary['latest'] | null = null;

  for (const result of results) {
    for (const testValue of result.testValues) {
      if (testValue.biomarkerKey !== biomarker.key) continue;
      count += 1;
      if (latest && latest.date.getTime() >= result.date.getTime()) continue;
      const shown = convertForDisplay(biomarker.name, testValue, displayUnit);
      latest = {
        value: shown.value,
        unit: shown.unit,
        date: result.date,
        status: testValue.status,
        labName: result.labName,
      };
    }
  }

  return latest ? { count, latest } : null;
}
```

Add `export { summarizeBiomarkerResults, type BiomarkerResultSummary, type SummarizableResult } from './biomarkerSummary';` to `src/services/statistics/index.ts`.

- [ ] **Step 4: Run it to watch it pass**

Run: `npx vitest run src/services/statistics`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/statistics
git commit -m "feat(statistics): summarise a biomarker's recorded values"
```

---

### Task 8: Shared personal-target modal

**Files:**
- Create: `src/utils/formatRange.ts`, `src/utils/formatRange.test.ts`
- Create: `src/components/settings/PersonalTargetModal.tsx`, `src/components/settings/PersonalTargetModal.test.tsx`
- Modify: `src/components/settings/PersonalTargets.tsx`, `src/components/settings/index.ts`
- Modify: `src/components/settings/SettingsPage.tsx`, `src/components/settings/SettingsPage.test.tsx`

**Interfaces:**
- Consumes: `usePreferences()` (Task 2).
- Produces: `formatRange(low?: number, high?: number): string` (`'70 - 90'`, `'< 90'`, `'> 70'`, `'N/A'`); `PersonalTargetModal({ target, onSave, onClose }: PersonalTargetModalProps)` where `target: PersonalTarget | null` (null = closed) and `onSave: (biomarkerKey: string, low: number | undefined, high: number | undefined) => void`.

- [ ] **Step 1: Write the failing tests**

Create `src/utils/formatRange.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatRange } from './formatRange';

describe('formatRange', () => {
  it('formats both bounds, one bound, or none', () => {
    expect(formatRange(70, 90)).toBe('70 - 90');
    expect(formatRange(undefined, 90)).toBe('< 90');
    expect(formatRange(70, undefined)).toBe('> 70');
    expect(formatRange(undefined, undefined)).toBe('N/A');
  });
});
```

Create `src/components/settings/PersonalTargetModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { PersonalTargetModal } from './PersonalTargetModal';
import type { PersonalTarget } from './PersonalTargets';

const GLUCOSE: PersonalTarget = {
  biomarkerKey: 'glucose',
  biomarkerName: 'Glucose',
  unit: 'mg/dL',
  standardLow: 70,
  standardHigh: 100,
  personalHigh: 95,
};

function renderModal(target: PersonalTarget | null = GLUCOSE) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(
    <MantineProvider env="test">
      <PersonalTargetModal target={target} onSave={onSave} onClose={onClose} />
    </MantineProvider>
  );
  return { onSave, onClose };
}

describe('PersonalTargetModal', () => {
  it('is closed without a target', () => {
    renderModal(null);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens on the current target with the standard range for reference', () => {
    renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Set Personal Target for Glucose' });
    expect(dialog).toHaveTextContent('Standard reference range: 70 - 100 mg/dL');
    expect(screen.getByLabelText('Personal target high value')).toHaveValue('95');
  });

  it('saves the entered bounds', async () => {
    const { onSave } = renderModal();
    await userEvent.type(screen.getByLabelText('Personal target low value'), '70');
    await userEvent.click(screen.getByRole('button', { name: 'Save Target' }));
    expect(onSave).toHaveBeenCalledWith('glucose', 70, 95);
  });

  it('closes on Cancel without saving', async () => {
    const { onSave, onClose } = renderModal();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to watch them fail**

Run: `npx vitest run src/utils/formatRange.test.ts src/components/settings/PersonalTargetModal.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

Create `src/utils/formatRange.ts`:

```ts
/** A target or reference range for display: "70 - 90", "< 90", "> 70" or "N/A" */
export function formatRange(low: number | undefined, high: number | undefined): string {
  if (low === undefined && high === undefined) return 'N/A';
  if (low === undefined) return `< ${high}`;
  if (high === undefined) return `> ${low}`;
  return `${low} - ${high}`;
}
```

Create `src/components/settings/PersonalTargetModal.tsx` by moving the Edit modal out of `PersonalTargets.tsx`:

```tsx
/**
 * PersonalTargetModal Component
 *
 * Sets the personal target range of one biomarker. Used by Settings and by
 * the biomarker detail.
 */

import { useState } from 'react';
import { Modal, Stack, Text, Group, NumberInput, Button } from '@mantine/core';
import { formatRange } from '@/utils/formatRange';
import type { PersonalTarget } from './PersonalTargets';

export interface PersonalTargetModalProps {
  /** The biomarker being edited; null keeps the modal closed */
  target: PersonalTarget | null;
  onSave: (biomarkerKey: string, low: number | undefined, high: number | undefined) => void;
  onClose: () => void;
}

export function PersonalTargetModal({
  target,
  onSave,
  onClose,
}: PersonalTargetModalProps): React.ReactNode {
  return (
    <Modal
      opened={target !== null}
      onClose={onClose}
      title={`Set Personal Target for ${target?.biomarkerName}`}
      centered
    >
      {/* Keyed so each biomarker opens on its own values */}
      {target && (
        <TargetForm key={target.biomarkerKey} target={target} onSave={onSave} onClose={onClose} />
      )}
    </Modal>
  );
}

function TargetForm({
  target,
  onSave,
  onClose,
}: {
  target: PersonalTarget;
  onSave: PersonalTargetModalProps['onSave'];
  onClose: () => void;
}): React.ReactNode {
  const [low, setLow] = useState<number | ''>(target.personalLow ?? '');
  const [high, setHigh] = useState<number | ''>(target.personalHigh ?? '');

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Standard reference range: {formatRange(target.standardLow, target.standardHigh)} {target.unit}
      </Text>

      <Group grow>
        <NumberInput
          label="Low Value"
          placeholder="Min"
          value={low}
          onChange={(value) => setLow(value === '' ? '' : Number(value))}
          min={0}
          decimalScale={2}
          aria-label="Personal target low value"
        />
        <NumberInput
          label="High Value"
          placeholder="Max"
          value={high}
          onChange={(value) => setHigh(value === '' ? '' : Number(value))}
          min={0}
          decimalScale={2}
          aria-label="Personal target high value"
        />
      </Group>

      <Text size="xs" c="dimmed">
        Leave a field empty to use only one bound (e.g., only set high value for values that
        should stay below a certain level).
      </Text>

      <Group justify="flex-end" gap="sm">
        <Button variant="subtle" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() =>
            onSave(target.biomarkerKey, low === '' ? undefined : low, high === '' ? undefined : high)
          }
          disabled={low === '' && high === ''}
        >
          Save Target
        </Button>
      </Group>
    </Stack>
  );
}
```

In `src/components/settings/PersonalTargets.tsx`:
- Remove `editLow`/`editHigh` state, the modal JSX and the local `formatRange`; import `formatRange` from `@/utils/formatRange` and `PersonalTargetModal` from `./PersonalTargetModal`.
- `handleOpenEdit` only sets `editingTarget`; `handleCloseModal` only clears it.
- Replace `handleSaveTarget` with:

```tsx
  const handleSaveTarget = useCallback(
    (biomarkerKey: string, low: number | undefined, high: number | undefined) => {
      onSetTarget(biomarkerKey, low, high);
      setEditingTarget(null);

      // Show success briefly
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    },
    [onSetTarget]
  );
```

- Render `<PersonalTargetModal target={editingTarget} onSave={handleSaveTarget} onClose={handleCloseModal} />` where the modal was.
- Drop imports that are now unused (`Modal`, `NumberInput`, …).

Export from `src/components/settings/index.ts`: `export { PersonalTargetModal, type PersonalTargetModalProps } from './PersonalTargetModal';`

- [ ] **Step 4: Run them to watch them pass**

Run: `npx vitest run src/utils/formatRange.test.ts src/components/settings --maxWorkers=4`
Expected: PASS, including the unchanged `PersonalTargets.test.tsx`, which pins that the refactor kept the Settings behaviour.

- [ ] **Step 5: Settings reads targets from the provider (failing test first)**

In `src/components/settings/SettingsPage.test.tsx`, add `usePreferences` to the `vi.mock('@hooks', …)` factory:

```tsx
  usePreferences: () => mockPreferences,
```

with, at the top of the file:

```tsx
const mockSetPersonalTarget = vi.fn();
const mockPreferences = {
  unitPreferences: {},
  personalTargets: { glucose: { low: 70, high: 90 } } as Record<string, { low?: number; high?: number }>,
  isLoaded: true,
  setPreferredUnit: vi.fn(),
  setPersonalTarget: (...args: unknown[]) => mockSetPersonalTarget(...args),
  reload: vi.fn(),
};
```

(`vi.mock` factories are hoisted: if the factory cannot see `mockPreferences`, wrap the variables in `vi.hoisted(() => …)`, as the file does for its other mocks if it does.) Make `mockSetPersonalTarget` resolve in `beforeEach`. Make the `@data/biomarkers` mock's `BIOMARKER_DEFINITIONS` include a Glucose entry with key `glucose` if it does not. Change the mount test that expects `getPreferences` to be called twice to expect it once (only the display settings load from the database now). Add:

```tsx
  it('shows personal targets from the shared preferences and saves through them', async () => {
    renderSettingsPage();
    await userEvent.click(screen.getByRole('tab', { name: /personal targets/i }));
    expect(await screen.findByText('70 - 90')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /edit.*glucose/i }));
    await userEvent.clear(screen.getByLabelText('Personal target high value'));
    await userEvent.type(screen.getByLabelText('Personal target high value'), '95');
    await userEvent.click(screen.getByRole('button', { name: 'Save Target' }));

    expect(mockSetPersonalTarget).toHaveBeenCalledWith('glucose', { low: 70, high: 95 });
  });
```

(`renderSettingsPage` is the file's render helper. Use the Edit button's real accessible name from `PersonalTargets.tsx`.)

Run: `npx vitest run src/components/settings/SettingsPage.test.tsx`
Expected: the new test FAILS (targets come from the database mock).

- [ ] **Step 6: Implement in SettingsPage**

In `src/components/settings/SettingsPage.tsx`:
- Import `usePreferences` from `@hooks` and `useMemo`.
- Remove the `personalTargets` state and the "Load personal targets from database" effect. Replace with:

```tsx
  const { personalTargets: targetMap, setPersonalTarget } = usePreferences();
  const personalTargets = useMemo<PersonalTarget[]>(
    () =>
      BIOMARKER_DEFINITIONS.map((biomarker) => ({
        biomarkerKey: biomarker.key,
        biomarkerName: biomarker.name,
        unit: biomarker.canonicalUnit,
        standardLow: biomarker.defaultReferenceRange?.low,
        standardHigh: biomarker.defaultReferenceRange?.high,
        personalLow: targetMap[biomarker.key]?.low,
        personalHigh: targetMap[biomarker.key]?.high,
      })),
    [targetMap]
  );
```

- Replace `handleSetTarget` and `handleClearTarget` with:

```tsx
  const saveTarget = useCallback(
    async (biomarkerKey: string, target: { low?: number; high?: number } | null) => {
      setIsSavingTargets(true);
      try {
        await setPersonalTarget(biomarkerKey, target);
      } catch {
        console.error('Failed to save personal target');
      } finally {
        setIsSavingTargets(false);
      }
    },
    [setPersonalTarget]
  );

  const handleSetTarget = useCallback(
    (biomarkerKey: string, low: number | undefined, high: number | undefined) =>
      void saveTarget(biomarkerKey, { low, high }),
    [saveTarget]
  );

  const handleClearTarget = useCallback(
    (biomarkerKey: string) => void saveTarget(biomarkerKey, null),
    [saveTarget]
  );
```

- In `handleThemeChange`, `handleDateFormatChange` and the localStorage migration, replace each `db.getPreferences()` + `db.savePreferences({...})` pair with `db.updatePreferences(() => ({ theme: newTheme }))`, `db.updatePreferences(() => ({ dateFormat: newFormat }))` and `db.updatePreferences(() => ({ theme: savedTheme, dateFormat: savedDateFormat }))`, so these writes no longer carry stale copies of the other preferences. Update the matching assertions in `SettingsPage.test.tsx` (add `updatePreferences: vi.fn()` to its mock db and assert on it), watching each fail before the code change.

Run: `npx vitest run src/components/settings --maxWorkers=4`
Expected: PASS, no output besides results.

- [ ] **Step 7: Commit**

```bash
git add src/utils/formatRange.ts src/utils/formatRange.test.ts src/components/settings
git commit -m "refactor(settings): share the personal-target modal and read targets from preferences"
```

---

### Task 9: Biomarker detail sections and Back

**Files:**
- Modify: `src/components/dictionary/BiomarkerDetail.tsx`, `src/components/dictionary/BiomarkerDetail.test.tsx`
- Modify: `src/components/dictionary/BiomarkerDictionary.tsx`, `src/components/dictionary/BiomarkerDictionary.test.tsx`
- Create: `src/components/dictionary/DictionaryView.tsx`, `src/components/dictionary/DictionaryView.test.tsx`
- Modify: `src/components/dictionary/index.ts`, `src/components/layout/AppShell.tsx`

**Interfaces:**
- Consumes: `usePreferences()` (Task 2); `resolveDisplayUnit` (Task 3); `BiomarkerDefinition.related` (Task 6); `summarizeBiomarkerResults`, `BiomarkerResultSummary` (Task 7); `PersonalTargetModal`, `formatRange` (Task 8); `useLabResults()` (existing).
- Produces:

```ts
export interface BiomarkerDetailProps {
  biomarker: BiomarkerDefinition;
  /** null: no recorded values */
  summary: BiomarkerResultSummary | null;
  personalTarget?: PersonalTargetRange;
  onBack: () => void;
  onViewTrend: (biomarkerKey: string) => void;
  onEditTarget: () => void;
  onSelectRelated: (biomarker: BiomarkerDefinition) => void;
}
export interface DictionaryViewProps { onOpenTrend: (biomarkerKey: string) => void }
export function DictionaryView(props: DictionaryViewProps): React.ReactNode;
```

- List items in `BiomarkerDictionary` carry `data-biomarker-key={biomarker.key}`.

- [ ] **Step 1: Write the failing detail tests**

In `src/components/dictionary/BiomarkerDetail.test.tsx`, change the render helper to pass the new props with defaults (`summary: null`, `onBack`, `onViewTrend`, `onEditTarget`, `onSelectRelated` as `vi.fn()`), and replace any test of the close button with the Back tests below. Give the Glucose literal `related: ['hemoglobin-a1c']`. Add:

```tsx
describe('sections', () => {
  const summary = {
    count: 2,
    latest: { value: 120, unit: 'mg/dL', date: new Date('2024-02-20T12:00:00Z'), status: 'high' as const, labName: 'Lab' },
  };

  it('goes back to the list', async () => {
    const { props } = renderDetail();
    await userEvent.click(screen.getByRole('button', { name: 'Back to biomarker list' }));
    expect(props.onBack).toHaveBeenCalled();
  });

  it('moves focus to the biomarker name when opened', () => {
    renderDetail();
    expect(screen.getByRole('heading', { level: 3, name: 'Glucose' })).toHaveFocus();
  });

  it('summarises your results with a link to the trend', async () => {
    const { props } = renderDetail({ summary });
    const yours = screen.getByRole('region', { name: 'Your results' });
    expect(within(yours).getByText('120 mg/dL')).toBeInTheDocument();
    expect(within(yours).getByText('Feb 20, 2024')).toBeInTheDocument();
    expect(within(yours).getByText('High')).toBeInTheDocument();
    expect(within(yours).getByText('2 results')).toBeInTheDocument();

    await userEvent.click(within(yours).getByRole('button', { name: 'View trend' }));
    expect(props.onViewTrend).toHaveBeenCalledWith('glucose');
  });

  it('says one result in the singular', () => {
    renderDetail({ summary: { ...summary, count: 1 } });
    expect(screen.getByText('1 result')).toBeInTheDocument();
  });

  it('says when there are no recorded values', () => {
    renderDetail({ summary: null });
    const yours = screen.getByRole('region', { name: 'Your results' });
    expect(within(yours).getByText('You have no recorded values for Glucose')).toBeInTheDocument();
    expect(within(yours).queryByRole('button', { name: 'View trend' })).not.toBeInTheDocument();
  });

  it('shows a personal target, highlighted, next to the standard range', () => {
    renderDetail({ personalTarget: { low: 70, high: 90 } });
    const target = screen.getByRole('region', { name: 'Personal target' });
    expect(within(target).getByText('Your target')).toBeInTheDocument();
    expect(within(target).getByText('70 - 90 mg/dL')).toBeInTheDocument();
    expect(screen.getByText('70 - 100 mg/dL')).toBeInTheDocument();
  });

  it('says the standard range is used without a target, and offers Edit', async () => {
    const { props } = renderDetail();
    const target = screen.getByRole('region', { name: 'Personal target' });
    expect(within(target).getByText('Using standard range')).toBeInTheDocument();
    await userEvent.click(within(target).getByRole('button', { name: 'Edit personal target' }));
    expect(props.onEditTarget).toHaveBeenCalled();
  });

  it('links related biomarkers to their details', async () => {
    const { props } = renderDetail();
    const related = screen.getByRole('region', { name: 'Related biomarkers' });
    await userEvent.click(within(related).getByRole('button', { name: 'Hemoglobin A1c (HbA1c)' }));
    expect(props.onSelectRelated).toHaveBeenCalledWith(expect.objectContaining({ key: 'hemoglobin-a1c' }));
  });
});
```

`renderDetail(overrides?)` renders `BiomarkerDetail` in `MantineProvider env="test"` with the Glucose literal and default props, and returns `{ props }`. The related button resolves through the real `getBiomarkerByKey`, so do not mock the dictionary in this file.

Run: `npx vitest run src/components/dictionary/BiomarkerDetail.test.tsx`
Expected: the new tests FAIL.

- [ ] **Step 2: Implement the detail sections**

In `src/components/dictionary/BiomarkerDetail.tsx`:
- Props as in Interfaces. Import `useEffect, useRef` from React, `Button` from Mantine, `IconArrowLeft, IconChartLine, IconTarget` from `@tabler/icons-react`, `getBiomarkerByKey` from `@data/biomarkers`, `formatRange` from `@/utils/formatRange`, and the types `BiomarkerResultSummary` (`@services/statistics`) and `PersonalTargetRange` (`@hooks/usePreferences`).
- Module constants:

```tsx
const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Status words, so status never relies on colour alone */
const STATUS: Record<BiomarkerResultSummary['latest']['status'], { label: string; color: string }> = {
  high: { label: 'High', color: 'red' },
  low: { label: 'Low', color: 'orange' },
  normal: { label: 'Normal', color: 'green' },
  unknown: { label: 'No reference range', color: 'gray' },
};

function formatSummaryValue(value: number | string | boolean): string {
  if (typeof value === 'boolean') return value ? 'Positive' : 'Negative';
  return String(value);
}

function listLabel(biomarker: BiomarkerDefinition): string {
  return biomarker.aliases.length > 0 ? `${biomarker.name} (${biomarker.aliases[0]})` : biomarker.name;
}
```

- In the component, focus the heading whenever the biomarker changes:

```tsx
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Opening a detail (or a related one) moves focus to its name, so screen
  // readers announce the new page
  useEffect(() => {
    headingRef.current?.focus();
  }, [biomarker.key]);
```

- Header: replace the `CloseButton` with a Back button above the title, and give the title the ref:

```tsx
        <Group>
          <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={onBack}>
            Back to biomarker list
          </Button>
        </Group>
        <Box>
          <Title order={3} ref={headingRef} tabIndex={-1}>
            {biomarker.name}
          </Title>
          {/* aliases text as today */}
        </Box>
```

- After the Reference Range box, add the two new sections (each a `section` labelled by its heading, which gives it the `region` role):

```tsx
        <Box component="section" aria-labelledby={`${biomarker.key}-results`}>
          <Title order={4} size="sm" id={`${biomarker.key}-results`} mb="xs">
            Your results
          </Title>
          {summary ? (
            <Stack gap="xs">
              <Group gap="xs">
                <Text size="sm" fw={500}>
                  {formatSummaryValue(summary.latest.value)} {summary.latest.unit}
                </Text>
                <Text size="sm" c="dimmed">
                  {DATE.format(summary.latest.date)}
                </Text>
                <Badge variant="light" color={STATUS[summary.latest.status].color}>
                  {STATUS[summary.latest.status].label}
                </Badge>
              </Group>
              <Text size="sm" c="dimmed">
                {summary.count} {summary.count === 1 ? 'result' : 'results'}
              </Text>
              <Group>
                <Button
                  variant="light"
                  size="xs"
                  leftSection={<IconChartLine size={14} />}
                  onClick={() => onViewTrend(biomarker.key)}
                >
                  View trend
                </Button>
              </Group>
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">
              You have no recorded values for {biomarker.name}
            </Text>
          )}
        </Box>

        <Box component="section" aria-labelledby={`${biomarker.key}-target`}>
          <Title order={4} size="sm" id={`${biomarker.key}-target`} mb="xs">
            Personal target
          </Title>
          <Group justify="space-between" align="center">
            {personalTarget && (personalTarget.low !== undefined || personalTarget.high !== undefined) ? (
              <Paper p="xs" withBorder bg="var(--mantine-color-blue-light)">
                <Group gap="xs">
                  <IconTarget size={16} />
                  <Badge color="blue">Your target</Badge>
                  <Text size="sm" fw={500}>
                    {formatRange(personalTarget.low, personalTarget.high)} {biomarker.canonicalUnit}
                  </Text>
                </Group>
              </Paper>
            ) : (
              <Text size="sm" c="dimmed">
                Using standard range
              </Text>
            )}
            <Button variant="subtle" size="xs" onClick={onEditTarget}>
              Edit personal target
            </Button>
          </Group>
        </Box>
```

The visible Edit button text is "Edit personal target", so it is also its accessible name.

- Before the disclaimer, add the related section, shown only when there are related biomarkers:

```tsx
        {biomarker.related.length > 0 && (
          <Box component="section" aria-labelledby={`${biomarker.key}-related`}>
            <Title order={4} size="sm" id={`${biomarker.key}-related`} mb="xs">
              Related biomarkers
            </Title>
            <Group gap="xs">
              {biomarker.related
                .map((key) => getBiomarkerByKey(key))
                .filter((related): related is BiomarkerDefinition => related !== undefined)
                .map((related) => (
                  <Button
                    key={related.key}
                    variant="light"
                    size="xs"
                    onClick={() => onSelectRelated(related)}
                  >
                    {listLabel(related)}
                  </Button>
                ))}
            </Group>
          </Box>
        )}
```

- Remove the now unused `CloseButton` import.

Run: `npx vitest run src/components/dictionary/BiomarkerDetail.test.tsx`
Expected: PASS.

- [ ] **Step 3: Write the failing DictionaryView tests**

Create `src/components/dictionary/DictionaryView.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { DictionaryView } from './DictionaryView';

const mockSetPersonalTarget = vi.fn();
let mockTargets: Record<string, { low?: number; high?: number }> = {};
vi.mock('@hooks/usePreferences', () => ({
  usePreferences: () => ({
    unitPreferences: {},
    personalTargets: mockTargets,
    isLoaded: true,
    setPreferredUnit: vi.fn(),
    setPersonalTarget: (...args: unknown[]) => mockSetPersonalTarget(...args),
    reload: vi.fn(),
  }),
}));

vi.mock('@hooks/useLabResults', () => ({
  useLabResults: () => ({
    results: [
      {
        id: 1,
        date: new Date('2024-02-20T12:00:00Z'),
        labName: 'Lab',
        testValues: [{ id: 1, labResultId: 1, biomarkerKey: 'glucose', value: 120, unit: 'mg/dL', status: 'high' }],
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

const mockShowNotification = vi.fn();
vi.mock('@mantine/notifications', () => ({
  notifications: { show: (...args: unknown[]) => mockShowNotification(...args) },
}));

const scrollTo = vi.fn();

function renderView() {
  const onOpenTrend = vi.fn();
  render(
    <MantineProvider env="test">
      <DictionaryView onOpenTrend={onOpenTrend} />
    </MantineProvider>
  );
  return { onOpenTrend };
}

async function openFromSearch(term: string, name: string) {
  await userEvent.type(screen.getByRole('textbox', { name: 'Search biomarkers' }), term);
  await userEvent.click(screen.getByRole('button', { name: `View details for ${name}` }));
}

describe('DictionaryView', () => {
  beforeEach(() => {
    mockTargets = {};
    mockSetPersonalTarget.mockReset().mockResolvedValue(undefined);
    mockShowNotification.mockReset();
    // jsdom does not implement scrolling
    scrollTo.mockReset();
    vi.spyOn(window, 'scrollTo').mockImplementation(scrollTo);
    Object.defineProperty(window, 'scrollY', { value: 240, configurable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  it('replaces the list with the detail, and Back restores the list', async () => {
    renderView();
    await openFromSearch('gluc', 'Glucose');

    expect(screen.getByRole('heading', { level: 3, name: 'Glucose' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Search biomarkers' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Back to biomarker list' }));

    expect(screen.getByRole('textbox', { name: 'Search biomarkers' })).toHaveValue('gluc');
    expect(screen.getByRole('button', { name: 'View details for Glucose' })).toHaveFocus();
    expect(scrollTo).toHaveBeenLastCalledWith(0, 240);
  });

  it('returns to the list, not the previous detail, after a related biomarker', async () => {
    renderView();
    await openFromSearch('gluc', 'Glucose');
    await userEvent.click(
      within(screen.getByRole('region', { name: 'Related biomarkers' })).getByRole('button', {
        name: 'Hemoglobin A1c (HbA1c)',
      })
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Hemoglobin A1c' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Back to biomarker list' }));

    expect(screen.getByRole('textbox', { name: 'Search biomarkers' })).toHaveValue('gluc');
    expect(screen.getByRole('button', { name: 'View details for Glucose' })).toHaveFocus();
  });

  it('summarises your results and opens the trend', async () => {
    const { onOpenTrend } = renderView();
    await openFromSearch('gluc', 'Glucose');
    const yours = screen.getByRole('region', { name: 'Your results' });
    expect(within(yours).getByText('120 mg/dL')).toBeInTheDocument();

    await userEvent.click(within(yours).getByRole('button', { name: 'View trend' }));
    expect(onOpenTrend).toHaveBeenCalledWith('glucose');
  });

  it('says when a biomarker has no recorded values', async () => {
    renderView();
    await openFromSearch('ferritin', 'Ferritin');
    expect(screen.getByText('You have no recorded values for Ferritin')).toBeInTheDocument();
  });

  it('saves a personal target edited from the detail', async () => {
    renderView();
    await openFromSearch('gluc', 'Glucose');
    await userEvent.click(screen.getByRole('button', { name: 'Edit personal target' }));
    await userEvent.type(screen.getByLabelText('Personal target low value'), '70');
    await userEvent.type(screen.getByLabelText('Personal target high value'), '90');
    await userEvent.click(screen.getByRole('button', { name: 'Save Target' }));

    expect(mockSetPersonalTarget).toHaveBeenCalledWith('glucose', { low: 70, high: 90 });
  });

  it('tells the user when the target could not be saved', async () => {
    mockSetPersonalTarget.mockRejectedValueOnce(new Error('disk full'));
    renderView();
    await openFromSearch('gluc', 'Glucose');
    await userEvent.click(screen.getByRole('button', { name: 'Edit personal target' }));
    await userEvent.type(screen.getByLabelText('Personal target high value'), '90');
    await userEvent.click(screen.getByRole('button', { name: 'Save Target' }));

    await vi.waitFor(() =>
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Personal target not saved', color: 'red' })
      )
    );
  });
});
```

If the search for `gluc` lists several Glucose-like entries, `View details for Glucose` must still be unique (the accessible name is the exact name); use `{ name: 'View details for Glucose', exact: true }`-style exact matching (`name: /^View details for Glucose$/`) if not.

Run: `npx vitest run src/components/dictionary/DictionaryView.test.tsx`
Expected: FAIL, cannot resolve `./DictionaryView`.

- [ ] **Step 4: Keep list state while hidden**

In `src/components/dictionary/BiomarkerDictionary.tsx`:
- In `BiomarkerListItem`, add `data-biomarker-key={biomarker.key}` to the `Paper`.
- Replace the search results' `<ScrollArea h={500}>…</ScrollArea>` with its inner `<Stack gap="xs">…</Stack>`, so the page is the only scroll container and Back can restore one scroll position. Remove the `ScrollArea` import.

Run: `npx vitest run src/components/dictionary/BiomarkerDictionary.test.tsx`
Expected: PASS.

- [ ] **Step 5: Implement DictionaryView**

Create `src/components/dictionary/DictionaryView.tsx`:

```tsx
/**
 * DictionaryView Component
 *
 * The biomarker list, or one biomarker's detail in its place. The list stays
 * mounted while hidden, so Back returns to the same search and open
 * categories; the scroll position and focus are restored by hand.
 */

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useLabResults } from '@hooks/useLabResults';
import { usePreferences } from '@hooks/usePreferences';
import { resolveDisplayUnit } from '@services/units';
import { summarizeBiomarkerResults } from '@services/statistics';
import { PersonalTargetModal } from '@components/settings/PersonalTargetModal';
import { BiomarkerDictionary } from './BiomarkerDictionary';
import { BiomarkerDetail } from './BiomarkerDetail';
import type { BiomarkerDefinition } from '@data/biomarkers';

export interface DictionaryViewProps {
  /** Show a biomarker's trend chart */
  onOpenTrend: (biomarkerKey: string) => void;
}

/** Where to put the list back when the detail closes */
interface ListPosition {
  biomarkerKey: string;
  scrollY: number;
}

export function DictionaryView({ onOpenTrend }: DictionaryViewProps): React.ReactNode {
  const { results } = useLabResults();
  const { unitPreferences, personalTargets, setPersonalTarget } = usePreferences();
  const [selected, setSelected] = useState<BiomarkerDefinition | null>(null);
  const [editingTarget, setEditingTarget] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const listPosition = useRef<ListPosition | null>(null);

  const handleSelectFromList = useCallback((biomarker: BiomarkerDefinition) => {
    listPosition.current = { biomarkerKey: biomarker.key, scrollY: window.scrollY };
    setSelected(biomarker);
    window.scrollTo(0, 0);
  }, []);

  // A related biomarker replaces the detail; Back still returns to the list
  // as it was when the first detail was opened
  const handleSelectRelated = useCallback((biomarker: BiomarkerDefinition) => {
    setSelected(biomarker);
    window.scrollTo(0, 0);
  }, []);

  const handleBack = useCallback(() => setSelected(null), []);

  // Before paint, so the list never shows at the top first
  useLayoutEffect(() => {
    if (selected || !listPosition.current) return;
    const { biomarkerKey, scrollY } = listPosition.current;
    listPosition.current = null;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-biomarker-key="${biomarkerKey}"]`)
      ?.focus({ preventScroll: true });
    window.scrollTo(0, scrollY);
  }, [selected]);

  const summary = useMemo(
    () =>
      selected
        ? summarizeBiomarkerResults(
            results,
            selected,
            resolveDisplayUnit(selected, unitPreferences[selected.key])
          )
        : null,
    [results, selected, unitPreferences]
  );

  const handleSaveTarget = useCallback(
    (biomarkerKey: string, low: number | undefined, high: number | undefined) => {
      setEditingTarget(false);
      setPersonalTarget(biomarkerKey, { low, high }).catch(() => {
        notifications.show({
          title: 'Personal target not saved',
          message: 'Your target could not be saved. Try again.',
          color: 'red',
        });
      });
    },
    [setPersonalTarget]
  );

  const target = selected ? personalTargets[selected.key] : undefined;

  return (
    <>
      <Box ref={listRef} style={{ display: selected ? 'none' : undefined }}>
        <BiomarkerDictionary onSelectBiomarker={handleSelectFromList} selectedBiomarker={selected?.name} />
      </Box>
      {selected && (
        <BiomarkerDetail
          biomarker={selected}
          summary={summary}
          personalTarget={target}
          onBack={handleBack}
          onViewTrend={onOpenTrend}
          onEditTarget={() => setEditingTarget(true)}
          onSelectRelated={handleSelectRelated}
        />
      )}
      <PersonalTargetModal
        target={
          selected && editingTarget
            ? {
                biomarkerKey: selected.key,
                biomarkerName: selected.name,
                unit: selected.canonicalUnit,
                standardLow: selected.defaultReferenceRange?.low,
                standardHigh: selected.defaultReferenceRange?.high,
                personalLow: target?.low,
                personalHigh: target?.high,
              }
            : null
        }
        onSave={handleSaveTarget}
        onClose={() => setEditingTarget(false)}
      />
    </>
  );
}
```

`summarizeBiomarkerResults` takes `{ key, name }`; a `BiomarkerDefinition` satisfies it. If `LabResultWithDetails` is not assignable to `SummarizableResult` (e.g. `value` has a wider type), widen `SummarizableResult` in Task 7's file to match `TestValue`, and keep its tests passing.

Export from `src/components/dictionary/index.ts`: `export { DictionaryView, type DictionaryViewProps } from './DictionaryView';`

In `src/components/layout/AppShell.tsx`: delete the local `DictionaryView` function, import `DictionaryView` from `@components/dictionary` (drop the `BiomarkerDictionary, BiomarkerDetail` import and the `BiomarkerDefinition` type import if unused), and render `return <DictionaryView onOpenTrend={(biomarkerKey) => onOpenTrend(biomarkerKey)} />;` in the dictionary branch.

- [ ] **Step 6: Run them to watch them pass**

Run: `npx vitest run src/components/dictionary --maxWorkers=4`
Expected: PASS, no output besides results.

- [ ] **Step 7: Check it in the browser**

With the dev server running, use the chrome-devtools MCP:
- Open Biomarkers, expand Complete Blood Count, scroll down, open Basophils Percentage, press Back: the category is still open, the page is at the same place, and the item has a visible focus ring.
- Open Glucose: the Your results, Personal target and Related biomarkers sections show; the status badge has text.
- `list_console_messages`: no errors or warnings.

- [ ] **Step 8: Run the dictionary E2E**

Run: `npx playwright test e2e/biomarker-dictionary.spec.ts e2e/unit-conversion.spec.ts --project=chromium --workers=2 --reporter=line`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/components/dictionary src/components/layout/AppShell.tsx
git commit -m "feat(dictionary): your results, personal target, related biomarkers and Back"
```

---

### Task 10: Full verification and progress

**Files:**
- Modify: `docs/superpowers/specs/2026-10-17-gherkin-completion-design.md` ("Progress" section)

- [ ] **Step 1: Run this sub-project's E2E in both browsers**

Run: `npx playwright test e2e/unit-conversion.spec.ts e2e/biomarker-dictionary.spec.ts e2e/trend-charts.spec.ts e2e/timeline-view.spec.ts e2e/alerts.spec.ts e2e/settings.spec.ts --workers=2 --reporter=line`
Expected: all pass.

If a test fails, debug it with superpowers:systematic-debugging. Fix the app when the app is wrong. Change a test only when it contradicts the Gherkin or this plan's Global Constraints, and ledger the reason.

- [ ] **Step 2: Run every gate**

Run: `npm run build && npm run lint && npx vitest run --maxWorkers=4`
Expected: all succeed. The vitest output contains nothing besides test results.

Run: `npx playwright test --workers=2 --reporter=line`
Expected: all pass in both browsers. There are no expected failures left.

- [ ] **Step 3: Update the progress section**

In the spec's "Progress" section:
- Set sub-project 5 to `Done and reviewed`, with a link to this plan, and sub-project 6 to `Next`.
- Replace the expected-failures table with: "None. Any E2E failure is a regression."
- Remove the note about the intermittent `unit-conversion.spec.ts:578` test.

Commit:

```bash
git add docs/superpowers/specs/2026-10-17-gherkin-completion-design.md
git commit -m "docs(spec): mark preferred units and biomarker detail done"
```

Do this commit after the final review and its fix pass, once the Outcome section of this plan is written.
