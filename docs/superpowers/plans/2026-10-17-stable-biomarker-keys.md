# Stable Biomarker Keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace position-based numeric biomarker IDs with permanent string keys everywhere biomarker data is stored, migrating existing databases and old backups without mislabelling any value.

**Architecture:** Each dictionary entry gets a literal, frozen `key`. Stored records reference biomarkers by `biomarkerKey: string`. A Dexie v3 upgrade and the backup v1→v2 migration share one set of pure record-migration functions. Those functions are driven by `LEGACY_ID_ORDER`, a frozen copy of today's dictionary order that is never edited.

**Tech Stack:** TypeScript (strict), React 19, Dexie 4 (IndexedDB), Vitest + Testing Library, Playwright, `fake-indexeddb` (new dev dependency, tests only).

**Spec:** `docs/superpowers/specs/2026-10-17-gherkin-completion-design.md`, section 1 "Stable biomarker keys"

## Global Constraints

- A key is kebab-case, derived once from the entry's name at creation time, and then **never changes or gets reused**, even if the name changes.
- Unknown biomarkers: `unknown:<extracted name lower-cased, letters and digits only>`, or `unknown:unnamed` if that is empty.
- Legacy numeric IDs ≥ 10000 (hash IDs) map to `unknown:legacy-<id>`.
- `LEGACY_ID_ORDER` is never edited after this plan lands.
- Migrations only touch unencrypted fields (`biomarkerId`, preference map keys). They must run without the encryption key.
- Migrations are idempotent: a record that already has `biomarkerKey` is left unchanged.
- Backup schema version becomes 2. Version-1 backups (plain and encrypted) must still restore.
- Test output must stay clean: no unexpected console output (enforced by `src/test/setup.ts`).
- Every quality gate passes before this sub-project is done: `npm run build`, `npm run lint`, `npm run test`, and `npx playwright test --workers=2` in both browsers.

## Review Focus

1. **A database last opened before this release.** Every stored value keeps its biomarker after the upgrade. Pinned by the Task 4 upgrade test, which builds a real v2 database.
2. **A version-1 backup restored in the new app**, including encrypted backups. Names and notes still line up. Pinned by Task 5 unit tests and the new E2E scenario.
3. **A legacy numeric ID out of range** (0, negative, or between the dictionary length and 9999). It maps to `unknown:legacy-<id>` and does not crash or map to a wrong biomarker. Pinned in Task 2.
4. **An extracted name with only symbols or non-Latin letters** (e.g. "—" or "血糖"). It gets `unknown:unnamed` or a stable non-empty key, never `unknown:`. Pinned in Task 1.
5. **Running the upgrade twice** (e.g. a crash mid-upgrade, then a re-run) leaves data unchanged. Pinned in Task 3.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/data/biomarkers/dictionary.ts` (modify) | Add `key` to `BiomarkerDefinition` and every entry; key helpers |
| `src/data/biomarkers/keys.snapshot.ts` (create) | Frozen list of all keys ever issued (append-only) |
| `src/data/migrations/legacyBiomarkerIds.ts` (create) | `LEGACY_ID_ORDER` and `legacyIdToKey` |
| `src/data/migrations/biomarkerKeyMigration.ts` (create) | Pure record migrations shared by the DB upgrade and backup import |
| `src/data/db/index.ts` (modify) | Dexie v3 schema and upgrade; DB name parameter for tests |
| `src/types/index.ts` (modify) | `biomarkerKey` replaces `biomarkerId`; preference maps keyed by string |
| Consumers (modify) | Persistence, encryptedDb, hooks, components, csv export (Task 4 list) |
| `src/services/export/jsonExport.ts`, `src/services/import/jsonImport.ts`, `src/services/import/encryptedImport.ts` (modify) | Backup v2 and v1 migration |

---

### Task 1: Dictionary keys and key helpers

**Files:**
- Modify: `src/data/biomarkers/dictionary.ts`
- Modify: `src/data/biomarkers/index.ts`
- Create: `src/data/biomarkers/keys.snapshot.ts`
- Test: `src/data/biomarkers/dictionary.test.ts`

**Interfaces:**
- Produces:
  - `BiomarkerDefinition.key: string`
  - `getBiomarkerByKey(key: string): BiomarkerDefinition | undefined`
  - `unknownBiomarkerKey(extractedName: string): string`
  - `isUnknownBiomarkerKey(key: string): boolean`
  - `getBiomarkerForTestValue(tv: { biomarkerKey: string; rawText?: string }): BiomarkerDefinition | undefined` (key first, then `rawText`). Until Task 4 changes the type, the old numeric `getBiomarkerForTestValue` keeps existing alongside it as `getBiomarkerForLegacyTestValue`.
  - `ISSUED_BIOMARKER_KEYS: readonly string[]`

- [ ] **Step 1: Add the `key` field to every entry with a one-off script**

Run from the repo root. The script inserts `key: '<slug>',` above each entry's `name:` line inside the definition arrays. It only runs once; its output is committed.

```bash
node -e '
const fs = require("fs");
const p = "src/data/biomarkers/dictionary.ts";
let s = fs.readFileSync(p, "utf8");
const slug = (n) => n.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
let count = 0;
s = s.replace(/\n(    )name: (["\x27])(.*?)\2,\n/g, (m, indent, q, name) => { count++; return `\n${indent}key: \x27${slug(name)}\x27,\n${indent}name: ${q}${name}${q},\n`; });
fs.writeFileSync(p, s);
console.log("keys added:", count);
'
```

Expected: `keys added:` followed by the number of entries (currently 107). Then add the field to the interface:

```ts
export interface BiomarkerDefinition extends Omit<Biomarker, 'id'> {
  /**
   * Permanent identifier used in stored data. Never change or reuse a key:
   * renaming a biomarker keeps its key. See ISSUED_BIOMARKER_KEYS.
   */
  key: string;
  /** Common aliases/abbreviations for this biomarker */
  aliases: string[];
```

- [ ] **Step 2: Create the append-only key snapshot**

Generate it from the dictionary once, then commit it:

Node 24 strips TypeScript types natively, and the dictionary's only import is type-only:

```bash
node --input-type=module -e "const { BIOMARKER_DEFINITIONS } = await import('./src/data/biomarkers/dictionary.ts'); console.log(JSON.stringify(BIOMARKER_DEFINITIONS.map(b => b.key), null, 2))" > /tmp/keys.json
```

This prints keys in `BIOMARKER_DEFINITIONS` order (the category arrays spread together), which is also the legacy ID order Task 2 needs. File order is not the same, so don't extract keys from the source text.

Create `src/data/biomarkers/keys.snapshot.ts` (paste the array from `/tmp/keys.json`):

```ts
/**
 * Every biomarker key ever issued, in issue order. APPEND-ONLY.
 *
 * Stored lab data references biomarkers by these keys, so removing or
 * renaming one would orphan or mislabel user data. When a biomarker is
 * added to the dictionary, append its key here.
 */
export const ISSUED_BIOMARKER_KEYS: readonly string[] = [
  // paste keys here, one per line, exactly as generated
];
```

- [ ] **Step 3: Write the failing tests**

Append to `src/data/biomarkers/dictionary.test.ts`. Add `getBiomarkerByKey`, `unknownBiomarkerKey`, `isUnknownBiomarkerKey` and `getBiomarkerForTestValue` to its import from `./dictionary`, and add `import { ISSUED_BIOMARKER_KEYS } from './keys.snapshot';`.

```ts
  describe('biomarker keys', () => {
    it('gives every biomarker a unique kebab-case key', () => {
      const keys = BIOMARKER_DEFINITIONS.map((b) => b.key);
      expect(new Set(keys).size).toBe(keys.length);
      keys.forEach((key) => expect(key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/));
    });

    it('never drops or changes an issued key', () => {
      const keys = new Set(BIOMARKER_DEFINITIONS.map((b) => b.key));
      ISSUED_BIOMARKER_KEYS.forEach((issued) => expect(keys.has(issued), issued).toBe(true));
    });

    it('has every dictionary key in the issued list', () => {
      // A new biomarker must be appended to ISSUED_BIOMARKER_KEYS
      const issued = new Set(ISSUED_BIOMARKER_KEYS);
      BIOMARKER_DEFINITIONS.forEach((b) => expect(issued.has(b.key), b.key).toBe(true));
    });

    it('looks up a biomarker by key', () => {
      expect(getBiomarkerByKey('glucose')?.name).toBe('Glucose');
      expect(getBiomarkerByKey('no-such-key')).toBeUndefined();
    });

    it('builds stable keys for unknown biomarkers', () => {
      expect(unknownBiomarkerKey('Zorblatin')).toBe('unknown:zorblatin');
      expect(unknownBiomarkerKey('  Zorb-latin (serum) ')).toBe('unknown:zorblatinserum');
      expect(isUnknownBiomarkerKey('unknown:zorblatin')).toBe(true);
      expect(isUnknownBiomarkerKey('glucose')).toBe(false);
    });

    it('never builds an empty unknown key', () => {
      expect(unknownBiomarkerKey('—')).toBe('unknown:unnamed');
      expect(unknownBiomarkerKey('')).toBe('unknown:unnamed');
      // Non-Latin names keep their letters
      expect(unknownBiomarkerKey('血糖')).toBe('unknown:血糖');
    });

    it('identifies a stored value by its key before its extracted text', () => {
      expect(getBiomarkerForTestValue({ biomarkerKey: 'hemoglobin', rawText: 'Hemo-globin' })?.name).toBe(
        'Hemoglobin'
      );
      expect(
        getBiomarkerForTestValue({ biomarkerKey: 'unknown:bloodsugar', rawText: 'Blood Sugar' })?.name
      ).toBe('Glucose');
      expect(getBiomarkerForTestValue({ biomarkerKey: 'unknown:zorblatin', rawText: 'Zorblatin' })).toBeUndefined();
    });
  });
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/data/biomarkers/dictionary.test.ts`
Expected: FAIL. `getBiomarkerByKey`, `unknownBiomarkerKey` and the other new helpers are not exported.

- [ ] **Step 5: Implement the helpers**

In `src/data/biomarkers/dictionary.ts`, rename the existing numeric `getBiomarkerForTestValue` to `getBiomarkerForLegacyTestValue`, updating its callers: `TrendsView.tsx`, `TestValuesList.tsx`, `useAlerts.ts` and `useExportData.ts` (Task 4 replaces these calls). Then add next to `getBiomarkerId`:

```ts
const BY_KEY = new Map(BIOMARKER_DEFINITIONS.map((b) => [b.key, b]));
const UNKNOWN_PREFIX = 'unknown:';

/**
 * Dictionary entry for a stored biomarker key (undefined for unknown biomarkers)
 */
export function getBiomarkerByKey(key: string): BiomarkerDefinition | undefined {
  return BY_KEY.get(key);
}

/**
 * Key for a biomarker that is not in the dictionary, derived from its name so
 * the same name always gets the same key
 */
export function unknownBiomarkerKey(extractedName: string): string {
  const normalized = extractedName.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  return `${UNKNOWN_PREFIX}${normalized || 'unnamed'}`;
}

export function isUnknownBiomarkerKey(key: string): boolean {
  return key.startsWith(UNKNOWN_PREFIX);
}

/**
 * Dictionary entry for a stored test value. The stored key wins over the
 * extracted text: it reflects the match the user confirmed during review.
 */
export function getBiomarkerForTestValue(testValue: {
  biomarkerKey: string;
  rawText?: string;
}): BiomarkerDefinition | undefined {
  return (
    getBiomarkerByKey(testValue.biomarkerKey) ??
    (testValue.rawText ? findBiomarker(testValue.rawText) : undefined)
  );
}
```

Export the new helpers from `src/data/biomarkers/index.ts` (`getBiomarkerByKey`, `unknownBiomarkerKey`, `isUnknownBiomarkerKey`, `getBiomarkerForLegacyTestValue`), and export `ISSUED_BIOMARKER_KEYS` from `./keys.snapshot`.

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run src/data/biomarkers && npx tsc -b`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/data/biomarkers src/components src/hooks
git commit -m "feat(biomarkers): add permanent keys to dictionary entries"
```

---

### Task 2: Legacy numeric ID mapping

**Files:**
- Create: `src/data/migrations/legacyBiomarkerIds.ts`
- Test: `src/data/migrations/legacyBiomarkerIds.test.ts`

**Interfaces:**
- Consumes: `BiomarkerDefinition.key`, `ISSUED_BIOMARKER_KEYS` (Task 1)
- Produces: `LEGACY_ID_ORDER: readonly string[]`, `legacyIdToKey(id: number): string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { LEGACY_ID_ORDER, legacyIdToKey } from './legacyBiomarkerIds';
import { ISSUED_BIOMARKER_KEYS } from '@data/biomarkers/keys.snapshot';

describe('legacyIdToKey', () => {
  it('maps 1-based dictionary positions to keys', () => {
    expect(legacyIdToKey(1)).toBe(LEGACY_ID_ORDER[0]);
    expect(legacyIdToKey(LEGACY_ID_ORDER.length)).toBe(LEGACY_ID_ORDER[LEGACY_ID_ORDER.length - 1]);
  });

  it('maps known positions to the biomarkers they referred to', () => {
    expect(legacyIdToKey(1)).toBe('white-blood-cell-count');
    expect(legacyIdToKey(3)).toBe('hemoglobin');
  });

  it('maps hash IDs of unknown biomarkers to legacy unknown keys', () => {
    expect(legacyIdToKey(10042)).toBe('unknown:legacy-10042');
  });

  it('maps IDs outside the dictionary to legacy unknown keys instead of guessing', () => {
    expect(legacyIdToKey(0)).toBe('unknown:legacy-0');
    expect(legacyIdToKey(-3)).toBe('unknown:legacy--3');
    expect(legacyIdToKey(LEGACY_ID_ORDER.length + 1)).toBe(`unknown:legacy-${LEGACY_ID_ORDER.length + 1}`);
    expect(legacyIdToKey(2.5)).toBe('unknown:legacy-2.5');
  });

  it('only refers to keys that were issued', () => {
    const issued = new Set(ISSUED_BIOMARKER_KEYS);
    LEGACY_ID_ORDER.forEach((key) => expect(issued.has(key), key).toBe(true));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/data/migrations/legacyBiomarkerIds.test.ts`
Expected: FAIL. The module does not exist.

- [ ] **Step 3: Implement the mapping**

Paste the array from `/tmp/keys.json` (generated in Task 1, Step 2, in `BIOMARKER_DEFINITIONS` order) as a literal. It must **not** import the dictionary order at runtime.

```ts
/**
 * Mapping from the numeric biomarker IDs used before stable keys existed.
 *
 * A legacy ID was the 1-based position in BIOMARKER_DEFINITIONS at the time
 * the data was written; unknown biomarkers used hash IDs >= 10000. This is a
 * frozen copy of the dictionary order from before keys were introduced.
 * NEVER EDIT IT: it describes data that already exists.
 */
export const LEGACY_ID_ORDER: readonly string[] = [
  // paste the keys in dictionary order, exactly as in keys.snapshot.ts at this commit
];

/**
 * Key for a legacy numeric biomarker ID. IDs that do not correspond to a
 * dictionary position (hash IDs, corrupt values) become distinct unknown
 * keys rather than being guessed.
 */
export function legacyIdToKey(id: number): string {
  if (Number.isInteger(id) && id >= 1 && id <= LEGACY_ID_ORDER.length) {
    return LEGACY_ID_ORDER[id - 1];
  }
  return `unknown:legacy-${id}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/data/migrations`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/migrations
git commit -m "feat(migrations): map legacy numeric biomarker IDs to keys"
```

---

### Task 3: Pure record migrations

**Files:**
- Create: `src/data/migrations/biomarkerKeyMigration.ts`
- Test: `src/data/migrations/biomarkerKeyMigration.test.ts`

**Interfaces:**
- Consumes: `legacyIdToKey` (Task 2)
- Produces:
  - `migrateTestValueRecord<T extends LegacyKeyed>(record: T): Omit<T, 'biomarkerId'> & { biomarkerKey: string }`
  - `migrateNoteRecord<T extends Partial<LegacyKeyed>>(record: T): Omit<T, 'biomarkerId'> & { biomarkerKey?: string }`
  - `migratePreferenceMaps<T extends { personalTargets?: Record<string | number, unknown>; unitPreferences?: Record<string | number, unknown> }>(prefs: T): T`

  where `interface LegacyKeyed { biomarkerId?: number; biomarkerKey?: string }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  migrateTestValueRecord,
  migrateNoteRecord,
  migratePreferenceMaps,
} from './biomarkerKeyMigration';

describe('migrateTestValueRecord', () => {
  it('replaces the numeric ID with a key and keeps other fields', () => {
    const migrated = migrateTestValueRecord({ id: 5, biomarkerId: 3, value: 14.5, unit: 'g/dL' });
    expect(migrated).toEqual({ id: 5, biomarkerKey: 'hemoglobin', value: 14.5, unit: 'g/dL' });
  });

  it('is idempotent: records that already have a key are unchanged', () => {
    const record = { id: 5, biomarkerKey: 'glucose', value: 95, unit: 'mg/dL' };
    expect(migrateTestValueRecord(record)).toEqual(record);
    expect(migrateTestValueRecord(migrateTestValueRecord({ id: 1, biomarkerId: 3 }))).toEqual({
      id: 1,
      biomarkerKey: 'hemoglobin',
    });
  });
});

describe('migrateNoteRecord', () => {
  it('migrates a biomarker reference', () => {
    expect(migrateNoteRecord({ id: 1, biomarkerId: 10042, content: 'x' })).toEqual({
      id: 1,
      biomarkerKey: 'unknown:legacy-10042',
      content: 'x',
    });
  });

  it('leaves notes without a biomarker alone', () => {
    expect(migrateNoteRecord({ id: 2, labResultId: 4, content: 'y' })).toEqual({
      id: 2,
      labResultId: 4,
      content: 'y',
    });
  });
});

describe('migratePreferenceMaps', () => {
  it('re-keys personal targets and unit preferences from IDs to keys', () => {
    const migrated = migratePreferenceMaps({
      theme: 'dark',
      personalTargets: { 3: { low: 13 } },
      unitPreferences: { '3': 'g/L' },
    });
    expect(migrated).toEqual({
      theme: 'dark',
      personalTargets: { hemoglobin: { low: 13 } },
      unitPreferences: { hemoglobin: 'g/L' },
    });
  });

  it('is idempotent for maps already keyed by biomarker key', () => {
    const prefs = { personalTargets: { glucose: { high: 99 } }, unitPreferences: {} };
    expect(migratePreferenceMaps(migratePreferenceMaps(prefs))).toEqual(prefs);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/data/migrations/biomarkerKeyMigration.test.ts`
Expected: FAIL. The module does not exist.

- [ ] **Step 3: Implement**

```ts
/**
 * Record migrations from numeric biomarker IDs to biomarker keys.
 *
 * Shared by the IndexedDB upgrade and by backup import, so a database and a
 * backup written by the same old version migrate identically. All functions
 * are pure and idempotent.
 */

import { legacyIdToKey } from './legacyBiomarkerIds';

export interface LegacyKeyed {
  biomarkerId?: number;
  biomarkerKey?: string;
}

export function migrateTestValueRecord<T extends LegacyKeyed>(
  record: T
): Omit<T, 'biomarkerId'> & { biomarkerKey: string } {
  const { biomarkerId, ...rest } = record;
  return {
    ...rest,
    biomarkerKey: record.biomarkerKey ?? legacyIdToKey(biomarkerId ?? Number.NaN),
  };
}

export function migrateNoteRecord<T extends LegacyKeyed>(
  record: T
): Omit<T, 'biomarkerId'> & { biomarkerKey?: string } {
  const { biomarkerId, ...rest } = record;
  if (record.biomarkerKey !== undefined || biomarkerId === undefined) {
    return rest;
  }
  return { ...rest, biomarkerKey: legacyIdToKey(biomarkerId) };
}

/** Numeric map keys come back from JSON/IndexedDB as digit strings */
const LEGACY_MAP_KEY = /^-?\d+$/;

function rekey<V>(map: Record<string | number, V> | undefined): Record<string, V> | undefined {
  if (!map) return map;
  return Object.fromEntries(
    Object.entries(map).map(([key, value]) => [
      LEGACY_MAP_KEY.test(key) ? legacyIdToKey(Number(key)) : key,
      value,
    ])
  );
}

export function migratePreferenceMaps<
  T extends {
    personalTargets?: Record<string | number, unknown>;
    unitPreferences?: Record<string | number, unknown>;
  },
>(prefs: T): T {
  return {
    ...prefs,
    ...(prefs.personalTargets && { personalTargets: rekey(prefs.personalTargets) }),
    ...(prefs.unitPreferences && { unitPreferences: rekey(prefs.unitPreferences) }),
  };
}
```

Note: when a record has neither field, `migrateTestValueRecord` uses `legacyIdToKey(NaN)`, which gives `unknown:legacy-NaN`. That is deliberately visible rather than silently dropped.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/data/migrations && npx eslint src/data/migrations`
Expected: PASS, no lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/data/migrations
git commit -m "feat(migrations): add pure biomarker key record migrations"
```

---

### Task 4: Switch stored data to biomarker keys (types, DB v3 upgrade, all consumers)

This task changes `TestValue.biomarkerId` to `biomarkerKey`. TypeScript then flags every consumer, so the whole switch must land in one task for the build to pass.

**Files:**
- Modify: `src/types/index.ts:45,110-111,172`
- Modify: `src/data/db/index.ts` (v3 schema, upgrade, DB name parameter)
- Modify: `src/data/db/encryptedDb.ts:192-196,316-320`
- Modify: `src/services/persistence/LabResultPersistence.ts` (`resolveBiomarkerId` → `resolveBiomarkerKey`)
- Modify: `src/services/export/csvExport.ts:18,33,140-144,166`
- Modify: `src/hooks/useExportData.ts`, `src/hooks/useNotes.ts`, `src/hooks/useAlerts.ts`
- Modify: `src/components/trends/TrendsView.tsx`, `src/components/export/ExportDialog.tsx`, `src/components/alerts/OutOfRangeAlerts.tsx:454`, `src/components/timeline/TestValuesList.tsx`, `src/components/settings/PersonalTargets.tsx`, `src/components/settings/SettingsPage.tsx`
- Modify: `src/data/biomarkers/dictionary.ts` (remove `getBiomarkerId`, `getBiomarkerById`, `getBiomarkerForLegacyTestValue`)
- Modify: the 20 test files that reference `biomarkerId` (`grep -rln biomarkerId src | grep '\.test\.'`)
- Create test: `src/data/db/upgrade.test.ts`
- Modify: `package.json` (dev dependency `fake-indexeddb`)

**Interfaces:**
- Consumes: `getBiomarkerByKey`, `unknownBiomarkerKey`, `getBiomarkerForTestValue` (Task 1); `migrateTestValueRecord`, `migrateNoteRecord`, `migratePreferenceMaps` (Task 3)
- Produces:
  - `TestValue.biomarkerKey: string`
  - `UserNote.biomarkerKey?: string`
  - `UserPreferences.unitPreferences: Record<string, string>`
  - `UserPreferences.personalTargets: Record<string, { low?: number; high?: number }>`
  - `new HemoIODatabase(name?: string)`
  - `EncryptedDb.getTestValuesByBiomarker(biomarkerKey: string)`, `EncryptedDb.getNotesByBiomarker(biomarkerKey: string)`
  - `CsvExportOptions.biomarkerKeys?: string[]`
  - `LabResultForExport.biomarkerNames: Map<string, string>`
  - `NoteFilters.biomarkerKey?: string`, `CreateNoteInput.biomarkerKey?: string`
  - `useNotes().getNotesForBiomarker(biomarkerKey: string)`
  - `BiomarkerAlert.biomarkerKey: string`, `GroupedAlert.biomarkerKey: string`
  - `useAlerts().getAlertsForBiomarker(biomarkerKey: string)`
  - `PersonalTarget.biomarkerKey: string`
  - `PersonalTargetsProps.onSetTarget(biomarkerKey: string, low, high)`, `onClearTarget(biomarkerKey: string)`

- [ ] **Step 1: Install fake-indexeddb**

Run: `npm install --save-dev fake-indexeddb@6.2.2`
Expected: added to `devDependencies`.

- [ ] **Step 2: Write the failing upgrade test**

Create `src/data/db/upgrade.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import Dexie from 'dexie';
import { HemoIODatabase } from './index';

/** The v2 schema exactly as shipped before biomarker keys */
function openV2(name: string): Dexie {
  const legacy = new Dexie(name);
  legacy.version(2).stores({
    labResults: '++id, date, labName',
    testValues: '++id, labResultId, biomarkerId, [labResultId+biomarkerId]',
    biomarkers: '++id, name, category',
    userPreferences: '++id',
    settings: '++id',
    userNotes: '++id, labResultId, biomarkerId, testValueId, createdAt, *tags',
  });
  return legacy;
}

const names: string[] = [];
afterEach(async () => {
  await Promise.all(names.splice(0).map((n) => Dexie.delete(n)));
});

async function seedV2(name: string) {
  names.push(name);
  const legacy = openV2(name);
  await legacy.table('testValues').bulkAdd([
    { labResultId: 1, biomarkerId: 3, value: 14.5, unit: 'g/dL', rawText: 'enc:abc' },
    { labResultId: 1, biomarkerId: 10042, value: 2, unit: 'U/L', rawText: 'enc:def' },
  ]);
  await legacy.table('userNotes').bulkAdd([
    { biomarkerId: 3, content: 'enc:n1', tags: [], createdAt: new Date() },
    { labResultId: 1, content: 'enc:n2', tags: [], createdAt: new Date() },
  ]);
  await legacy.table('userPreferences').add({
    theme: 'dark',
    dateFormat: 'MM/DD/YYYY',
    personalTargets: { 3: { low: 13 } },
    unitPreferences: { 3: 'g/L' },
  });
  legacy.close();
}

describe('database upgrade to biomarker keys', () => {
  it('converts stored biomarker IDs to keys without the encryption key', async () => {
    await seedV2('upgrade-test-1');
    const db = new HemoIODatabase('upgrade-test-1');

    const values = await db.testValues.orderBy('id').toArray();
    expect(values.map((v) => v.biomarkerKey)).toEqual(['hemoglobin', 'unknown:legacy-10042']);
    expect(values.every((v) => !('biomarkerId' in v))).toBe(true);
    // Encrypted fields are carried over untouched
    expect(values[0].rawText).toBe('enc:abc');

    const notes = await db.userNotes.orderBy('id').toArray();
    expect(notes[0].biomarkerKey).toBe('hemoglobin');
    expect(notes[1].biomarkerKey).toBeUndefined();

    const [prefs] = await db.userPreferences.toArray();
    expect(prefs.personalTargets).toEqual({ hemoglobin: { low: 13 } });
    expect(prefs.unitPreferences).toEqual({ hemoglobin: 'g/L' });
    db.close();
  });

  it('indexes test values by biomarker key', async () => {
    await seedV2('upgrade-test-2');
    const db = new HemoIODatabase('upgrade-test-2');

    expect(await db.testValues.where('biomarkerKey').equals('hemoglobin').count()).toBe(1);
    expect(
      await db.testValues.where('[labResultId+biomarkerKey]').equals([1, 'hemoglobin']).count()
    ).toBe(1);
    db.close();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/data/db/upgrade.test.ts`
Expected: FAIL. `HemoIODatabase` takes no name, and no `biomarkerKey` exists.

- [ ] **Step 4: Change the types**

In `src/types/index.ts`:

```ts
export interface TestValue {
  id?: number;
  labResultId: number;
  /** Permanent dictionary key, or an "unknown:" key for unmatched names */
  biomarkerKey: string;
```

```ts
  unitPreferences: Record<string, string>; // biomarkerKey -> preferred unit
  personalTargets: Record<string, { low?: number; high?: number }>; // biomarkerKey -> target range
```

```ts
  /** The biomarker this note relates to (optional) */
  biomarkerKey?: string;
```

- [ ] **Step 5: Add the v3 schema and upgrade**

In `src/data/db/index.ts`, change the constructor and append version 3 after version 2:

```ts
import {
  migrateNoteRecord,
  migratePreferenceMaps,
  migrateTestValueRecord,
} from '@data/migrations/biomarkerKeyMigration';
```

```ts
  constructor(name = 'HemoIO') {
    super(name);
```

```ts
    // Version 3: biomarkers are referenced by permanent keys instead of their
    // position in the dictionary (which shifted when entries were inserted)
    this.version(3)
      .stores({
        labResults: '++id, date, labName',
        testValues: '++id, labResultId, biomarkerKey, [labResultId+biomarkerKey]',
        biomarkers: '++id, name, category',
        userPreferences: '++id',
        settings: '++id',
        userNotes: '++id, labResultId, biomarkerKey, testValueId, createdAt, *tags',
      })
      .upgrade(async (tx) => {
        // Only unencrypted fields are touched, so no encryption key is needed
        await tx.table('testValues').toCollection().modify((record, ref) => {
          ref.value = migrateTestValueRecord(record);
        });
        await tx.table('userNotes').toCollection().modify((record, ref) => {
          ref.value = migrateNoteRecord(record);
        });
        await tx.table('userPreferences').toCollection().modify((record, ref) => {
          ref.value = migratePreferenceMaps(record);
        });
      });
```

- [ ] **Step 6: Update the database access methods**

In `src/data/db/encryptedDb.ts`:

```ts
  async getTestValuesByBiomarker(biomarkerKey: string): Promise<TestValue[]> {
    const values = await this.db.testValues
      .where('biomarkerKey')
      .equals(biomarkerKey)
```

```ts
  async getNotesByBiomarker(biomarkerKey: string): Promise<UserNote[]> {
    const notes = await this.db.userNotes
      .where('biomarkerKey')
      .equals(biomarkerKey)
```

(Keep the remaining lines of each method unchanged.)

- [ ] **Step 7: Persistence resolves keys**

In `src/services/persistence/LabResultPersistence.ts`, replace `resolveBiomarkerId` (including the hash code) with:

```ts
/**
 * Resolve the stored biomarker key: the dictionary match, else a dictionary
 * lookup by name, else a stable key for the unknown name.
 */
function resolveBiomarkerKey(biomarker: MatchedBiomarker): string {
  const definition = biomarker.dictionaryMatch ?? findBiomarker(biomarker.name);
  return definition?.key ?? unknownBiomarkerKey(biomarker.name);
}
```

Then in `transformBiomarkerToTestValue`, replace `const biomarkerId = resolveBiomarkerId(biomarker);` and the `biomarkerId,` property with `biomarkerKey: resolveBiomarkerKey(biomarker),`. Change the import to `import { findBiomarker, unknownBiomarkerKey } from '@data/biomarkers/dictionary';`.

- [ ] **Step 8: CSV export filters and names by key**

In `src/services/export/csvExport.ts`:

```ts
  /** Filter by specific biomarkers */
  biomarkerKeys?: string[];
```

```ts
  biomarkerNames: Map<string, string>;
```

```ts
function filterTestValues(testValues: TestValue[], options: CsvExportOptions): TestValue[] {
  if (!options.biomarkerKeys || options.biomarkerKeys.length === 0) {
    return testValues;
  }

  return testValues.filter((tv) => options.biomarkerKeys!.includes(tv.biomarkerKey));
}
```

```ts
      const biomarkerName = result.biomarkerNames.get(testValue.biomarkerKey) || 'Unknown';
```

- [ ] **Step 9: Hooks use keys**

`src/hooks/useExportData.ts`: in the names loop, use `tv.biomarkerKey` for the map key and the fallback label:

```ts
      const biomarkerNames = new Map<string, string>();
      for (const tv of testValues) {
        if (!biomarkerNames.has(tv.biomarkerKey)) {
          biomarkerNames.set(
            tv.biomarkerKey,
            getBiomarkerForTestValue(tv)?.name || tv.rawText || 'Unknown biomarker'
          );
        }
      }
```

and build options with `value: key`.

`src/hooks/useNotes.ts`:
- Rename `biomarkerId?: number` to `biomarkerKey?: string` in `NoteFilters` and `CreateNoteInput` (keep their doc comments).
- `filters.biomarkerId` → `filters.biomarkerKey`, and `db.getNotesByBiomarker(filters.biomarkerKey)`.
- `biomarkerId: input.biomarkerId` → `biomarkerKey: input.biomarkerKey`.
- `getNotesForBiomarker` becomes:

```ts
  const getNotesForBiomarker = useCallback(
    (biomarkerKey: string): UserNote[] => {
      return notes.filter((n) => n.biomarkerKey === biomarkerKey);
    },
    [notes]
  );
```

and its interface entry becomes `getNotesForBiomarker: (biomarkerKey: string) => UserNote[];`.

`src/hooks/useAlerts.ts`: rename `biomarkerId: number` to `biomarkerKey: string` in `BiomarkerAlert` and `GroupedAlert`. Then:
- `generateAlertId(biomarkerKey: string, ...)`
- the grouping maps become `Map<string, ...>` keyed by `testValue.biomarkerKey` / `alert.biomarkerKey`
- the fallback name becomes `firstValue.rawText || 'Unknown biomarker'`
- `getAlertsForBiomarker(biomarkerKey: string)` filters on `alert.biomarkerKey`

- [ ] **Step 10: Components use keys**

`src/components/trends/TrendsView.tsx`:
- `biomarkerDataMap` becomes `Map<string, ...>` keyed by `testValue.biomarkerKey`, with fallback name `testValue.rawText || 'Unknown biomarker'`.
- Options use `value: biomarkerKey`.
- Remove both `parseInt(selectedBiomarkerId)` calls: use `getNotesForBiomarker(selectedBiomarkerId)` and `createNote({ biomarkerKey: selectedBiomarkerId, content, tags })`. Anything else that reads the selection uses the string directly, e.g. `biomarkerDataMap.get(selectedBiomarkerId)`.

`src/components/export/ExportDialog.tsx`:

```ts
        values = values.filter((tv) => selectedBiomarkers.includes(tv.biomarkerKey));
```

```ts
          biomarkerKeys: selectedBiomarkers.length > 0 ? selectedBiomarkers : undefined,
```

`src/components/alerts/OutOfRangeAlerts.tsx:454`: `key={group.biomarkerKey}`.

`src/components/timeline/TestValuesList.tsx`:
- In `getBiomarkerMetadata`, use `getBiomarkerByKey(testValue.biomarkerKey) ?? (searchTerm ? findBiomarker(searchTerm) : undefined)`.
- In `getBiomarkerName`, change the last line to `return testValue.rawText || 'Unknown biomarker';`.
- Import `getBiomarkerByKey` and `getBiomarkerForTestValue` instead of the numeric helpers.

`src/components/settings/PersonalTargets.tsx`: `biomarkerKey: string` replaces `biomarkerId: number` in `PersonalTarget`, `onSetTarget` and `onClearTarget`. Use `key={target.biomarkerKey}` and `handleClearTarget(target.biomarkerKey)`.

`src/components/settings/SettingsPage.tsx`:

```ts
        const targets: PersonalTarget[] = BIOMARKER_DEFINITIONS.map((biomarker) => {
          const target = targetsMap[biomarker.key];
          return {
            biomarkerKey: biomarker.key,
            biomarkerName: biomarker.name,
```

and in `handleSetTarget` / `handleClearTarget`, rename the parameter `biomarkerId: number` to `biomarkerKey: string`. Use `[biomarkerKey]: { low, high }`, `delete currentTargets[biomarkerKey]` and `t.biomarkerKey === biomarkerKey`.

- [ ] **Step 11: Remove the numeric dictionary helpers**

Delete `getBiomarkerId`, `getBiomarkerById` and `getBiomarkerForLegacyTestValue` from `dictionary.ts` and `index.ts`, and their tests from `dictionary.test.ts` (the `biomarker IDs` describe block). Run `grep -rn "getBiomarkerId\|getBiomarkerById\|getBiomarkerForLegacyTestValue" src`.
Expected: no output.

- [ ] **Step 12: Update unit tests to keys**

Run `grep -rn "biomarkerId" src | grep '\.test\.'` and update each hit:
- Test values and notes: replace `biomarkerId: <n>` with `biomarkerKey: '<key>'`. Use a real dictionary key when the test means a known biomarker (`'glucose'`, `'hemoglobin'`); otherwise use `unknownBiomarkerKey(<rawText>)` or a literal `'unknown:...'`.
- The dictionary mocks in `LabResultCard.test.tsx`, `TrendsView.test.tsx` and `useAlerts.test.ts` expose `getBiomarkerById: () => undefined` / `getBiomarkerForTestValue`. Replace them with `getBiomarkerByKey: () => undefined` and keep the `rawText`-based `getBiomarkerForTestValue`.
- `LabResultPersistence.test.ts`: the dictionary mock exposes `getBiomarkerId`. Replace it with `unknownBiomarkerKey: (name: string) => 'unknown:' + name.toLowerCase().replace(/[^a-z0-9]/g, '')`, and give the mocked definitions `key` fields (`'hemoglobin'`, `'glucose'`, `'creatinine'`). Change assertions on `biomarkerId` to the expected key.
- Other files: CSV/JSON/encrypted export fixtures use `biomarkerKey`; `PersonalTargets.test.tsx` expects `onSetTarget('glucose', 75, 95)`.
- `restoreBackup.test.ts`: test values use `biomarkerKey: 'glucose'` and notes use `biomarkerKey: 'glucose'`.

- [ ] **Step 13: Run everything**

Run: `npx tsc -b && npm run lint && npx vitest run --maxWorkers=4`
Expected: no type or lint errors. All tests pass, including `upgrade.test.ts`, with no console output.

- [ ] **Step 14: Commit**

```bash
git add -A src package.json package-lock.json
git commit -m "feat(data): reference biomarkers by permanent keys; upgrade stored data"
```

---

### Task 5: Backup schema v2 with v1 migration

**Files:**
- Modify: `src/services/export/jsonExport.ts:12` (`BACKUP_SCHEMA_VERSION = 2`)
- Modify: `src/services/import/jsonImport.ts:137-152` (`migrateBackupData`, exported)
- Modify: `src/services/import/encryptedImport.ts` (apply `migrateBackupData`)
- Test: `src/services/import/jsonImport.test.ts`, `src/services/import/encryptedImport.test.ts`
- Modify: `features/backup-restore.feature`, `e2e/backup-restore.spec.ts`

**Interfaces:**
- Consumes: `migrateTestValueRecord`, `migrateNoteRecord`, `migratePreferenceMaps` (Task 3)
- Produces: `migrateBackupData(data: BackupData): BackupData`, exported from `jsonImport.ts`

- [ ] **Step 1: Write the failing unit tests**

Append to `src/services/import/jsonImport.test.ts` (it already imports `parseBackupJson`):

```ts
  describe('schema version 1 backups', () => {
    const v1 = {
      schemaVersion: 1,
      exportedAt: '2024-03-01T00:00:00.000Z',
      appVersion: '1.0.0',
      labResults: [{ id: 1, date: '2024-01-15T00:00:00.000Z', labName: 'Lab', createdAt: '2024-01-15T00:00:00.000Z', updatedAt: '2024-01-15T00:00:00.000Z' }],
      testValues: [
        { id: 1, labResultId: 1, biomarkerId: 3, value: 14.5, unit: 'g/dL', createdAt: '2024-01-15T00:00:00.000Z', updatedAt: '2024-01-15T00:00:00.000Z' },
        { id: 2, labResultId: 1, biomarkerId: 10042, value: 2, unit: 'U/L', createdAt: '2024-01-15T00:00:00.000Z', updatedAt: '2024-01-15T00:00:00.000Z' },
      ],
      userNotes: [{ id: 1, biomarkerId: 3, content: 'note', tags: [], createdAt: '2024-01-16T00:00:00.000Z', updatedAt: '2024-01-16T00:00:00.000Z' }],
      userPreferences: { theme: 'dark', dateFormat: 'MM/DD/YYYY', personalTargets: { 3: { low: 13 } }, unitPreferences: {} },
      settings: null,
    };

    it('converts biomarker IDs to keys', () => {
      const parsed = parseBackupJson(JSON.stringify(v1));

      expect(parsed.testValues.map((tv) => tv.biomarkerKey)).toEqual(['hemoglobin', 'unknown:legacy-10042']);
      expect(parsed.userNotes[0].biomarkerKey).toBe('hemoglobin');
      expect(parsed.userPreferences?.personalTargets).toEqual({ hemoglobin: { low: 13 } });
      expect(parsed.schemaVersion).toBe(2);
    });

    it('rejects backups from a newer version', () => {
      expect(() => parseBackupJson(JSON.stringify({ ...v1, schemaVersion: 3 }))).toThrow(/newer version/);
    });
  });
```

Add the encrypted equivalent to `src/services/import/encryptedImport.test.ts`. Follow the file's existing round-trip pattern (create an encrypted backup from data, then parse it), using a version-1 payload whose test value has `biomarkerId: 3`, and assert `parsed.testValues[0].biomarkerKey === 'hemoglobin'`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/services/import`
Expected: FAIL, because `biomarkerKey` is undefined in parsed v1 backups.

- [ ] **Step 3: Implement the migration**

`src/services/export/jsonExport.ts`: `export const BACKUP_SCHEMA_VERSION = 2;`

`src/services/import/jsonImport.ts`: replace `migrateBackupData` with:

```ts
/**
 * Migrate backup data from older schema versions to the current one
 */
export function migrateBackupData(data: BackupData): BackupData {
  let migrated = { ...data };

  if (migrated.schemaVersion < 2) {
    // v1 referenced biomarkers by their position in the dictionary
    migrated = {
      ...migrated,
      testValues: migrated.testValues.map((tv) => migrateTestValueRecord(tv as never)) as never,
      userNotes: migrated.userNotes.map((note) => migrateNoteRecord(note as never)) as never,
      userPreferences: migrated.userPreferences
        ? migratePreferenceMaps(migrated.userPreferences)
        : migrated.userPreferences,
      schemaVersion: 2,
    };
  }

  return migrated;
}
```

and import `migrateTestValueRecord`, `migrateNoteRecord` and `migratePreferenceMaps` from `@data/migrations/biomarkerKeyMigration`. The `as never` casts bridge the serialized v1 record shape. If the BackupData record types can be widened to `Record<string, unknown>` instead, prefer that and drop the casts.

`src/services/import/encryptedImport.ts`: after the schema-version check in `parseEncryptedBackup`, add `const migrated = migrateBackupData(backupData);`. Map the result from `migrated` instead of `backupData`. Import `migrateBackupData` from `./jsonImport`.

- [ ] **Step 4: Run the unit tests**

Run: `npx vitest run src/services && npx tsc -b`
Expected: PASS

- [ ] **Step 5: Gherkin and E2E for old backups**

Append to `features/backup-restore.feature`:

```gherkin
  Scenario: Restore a backup made by an earlier version
    Given I have a backup file created by an earlier version of HemoIO
    When I restore it from the Data tab
    Then my lab results should be restored
    And each value should keep its biomarker name
```

Append to `e2e/backup-restore.spec.ts`:

```ts
test.describe('Backups from earlier versions', () => {
  test('restores a schema version 1 backup with correct biomarker names', async ({ page }) => {
    await page.goto('/');
    await setupOrUnlock(page);
    // seedLabData writes schema version 1 backups with numeric biomarker IDs
    await seedLabData(page, {
      testValues: [
        { id: 1, labResultId: 1, biomarkerId: 3, value: 14.5, unit: 'g/dL', createdAt: '2024-01-15T10:00:00.000Z', updatedAt: '2024-01-15T10:00:00.000Z' },
      ],
    });

    await page.getByRole('main').getByRole('button', { name: /Expand lab result from Jan 15, 2024/ }).click();
    await expect(
      page.getByRole('main').getByRole('table', { name: 'Test values' }).getByRole('row').filter({ hasText: '14.5' })
    ).toContainText('Hemoglobin');
  });
});
```

Import `seedLabData` from `./steps/data.steps`. Check the expand button's accessible name against `LabResultCard.tsx` (`Expand lab result from {date}`) and adjust the date format if it differs.

- [ ] **Step 6: Run the E2E spec**

Run: `npx playwright test e2e/backup-restore.spec.ts --workers=2 --reporter=line`
Expected: all pass in both browsers.

- [ ] **Step 7: Commit**

```bash
git add src/services features/backup-restore.feature e2e/backup-restore.spec.ts
git commit -m "feat(backup): schema v2 with biomarker keys; migrate v1 backups"
```

---

### Task 6: Full verification

**Files:** none new; fixes go where failures point.

- [ ] **Step 1: Search for leftovers**

Run: `grep -rn "biomarkerId\|getBiomarkerById\|10000 +" src e2e/steps`
Expected: hits only in `src/data/migrations/*`, `src/data/db/upgrade.test.ts`, `src/services/import/*.test.ts`, and E2E step seed data. Seeds deliberately write v1 backups, which exercise the migration on every seeded test.

- [ ] **Step 2: Run every gate**

Run: `npm run build && npm run lint && npx vitest run --maxWorkers=4`
Expected: build succeeds, lint is clean, all unit tests pass with no console output.

Run: `npx playwright test --workers=2 --reporter=line`
Expected: the same pass/fail set as before this plan; only scenarios belonging to later sub-projects may fail. Compare against the list in the spec: alerts, notes (chart), import (autocomplete, date picker, manual entry, rate limits), preferred units, biomarker detail. Any other failure is a regression to fix here.

- [ ] **Step 3: Manual check in the browser**

Using chrome-devtools against `http://localhost:5173`:
1. Seed a v2 database with the snippet from `upgrade.test.ts`, run in the page, before unlocking.
2. Reload and unlock.
3. Confirm the values appear in the timeline under the right names.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address regressions from biomarker key migration"
```

(Skip this step if there were no fixes.)

---

## Outcome (2026-10-18)

Executed inline. A fresh reviewer reviewed the whole branch, followed by one fix pass.

The fix pass addressed:
- Keys for "Reticulocytes %" and "Reticulocytes #" collided; `%` and `#` are now kept in unknown keys.
- Legacy unknown keys split a biomarker's history; they are now reconciled after unlock (`reconcileLegacyUnknownKeys`).
- The sync file version was raised to 2.
- Pin tests were missing and have been added.
- Backups did not include preferences, AI settings or the API key, and a restore wiped settings:
  - Backups now carry all of them.
  - A restore keeps settings.
  - AI settings from a backup are applied only when the user opts in (security review finding).

Checked by hand in Chrome: upgrading a v2.0 database to v3.0 kept every value under the right biomarker.

E2E after this sub-project: the only failures were those of the later sub-projects (alerts, notes, import, units).

Deferred minors (not fixed):
- A label fallback for unknown biomarkers whose raw text is missing ("Unknown biomarker").
- The `selectedBiomarkerId` state name in TrendsView is stale; it now holds a key.
- A stored numeric ID that is not a number becomes `unknown:legacy-NaN`.
- The backup restore preview shows the migrated schema version (2), not the file's own version.
