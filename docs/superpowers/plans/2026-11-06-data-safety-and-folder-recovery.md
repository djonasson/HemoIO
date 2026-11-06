# Data Safety and Folder Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With the folder and the password, the user always gets their data back, on this browser after a wipe or on another computer. No step deletes or overwrites data the user has not been told about.

**Architecture:**
- Records the session key cannot open are moved into a new Dexie table, `setAside`, by one sweep at every unlock. Every later read, export, restore and preferences save then works on readable rows only, and the set-aside rows are shown, downloadable and deletable.
- The folder copy becomes one JSON envelope: a plaintext header holding the password lock (`StoredCredentialsV2` plus `changedAt`), and the AES-GCM sealed body, with the header as additional authenticated data. The copy and its lock are one file, so they cannot get out of step, and a lock edited in the file breaks decryption.
- Each copy carries a random `revision` inside the sealed body. Each browser keeps, encrypted in localStorage, the revision and data digest it last read or wrote. A copy with another revision was written elsewhere: it is loaded when this browser has no changes since, and otherwise the user chooses, with the losing side kept as a dated sealed backup in `hemoio-backups/`.

**Tech Stack:** React 19, TypeScript strict, Mantine 8, Dexie 4 with fake-indexeddb in tests, Web Crypto, File System Access API, Web Locks API, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-06-data-safety-and-folder-recovery-design.md`. The investigation report it cites lists file:line references for problems 1–11 at `/tmp/claude-1000/-home-daniel-projects-react-hemoio/1d40f854-f49b-46ff-900e-9e92d270355a/scratchpad/skipped-records/report.md`.

## Global Constraints

- CLAUDE.md applies:
  - Gherkin first, then E2E (with `// Scenario:` comments, steps in `e2e/steps/`), then co-located unit tests;
  - the layer rules (UI never touches Dexie or the folder; services do no storage);
  - EAA/WCAG AA for every new dialog and banner: a labelled dialog, focus on the safe choice (`data-autofocus`), Escape is the safe choice, meaning is never carried by color alone;
  - Web Crypto only, and keys only in memory during a session.
- Never log keys, salts, passwords or health data, including in errors. Log fixed messages, never the caught error, where it could name stored data.
- Nothing in the folder may be readable without the password: no plaintext key, no plaintext record counts, no health data in file names. Only the wrapped lock, the format name and the version are plaintext.
- No backwards compatibility in development: Dexie goes to v8 with no upgrade function, and no old data is migrated. A folder copy in today's raw format (IV + ciphertext, no lock) is still *read* by a browser that has its credentials, as now.
- Never run prettier. Never commit `test-data/`.
- Conventional commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Per-task gate** (each task lists its own vitest files and E2E specs):
  - `npm run build`;
  - `npm run lint`;
  - `npx vitest run <the task's test files>`, then `npx vitest run --maxWorkers=4`, with no new console noise;
  - `E2E_DEV_PORT=5183 npx playwright test <the task's specs> --project=chromium --project=firefox --workers=3`.
  Folder specs skip non-Chromium browsers the way `e2e/restore-from-folder.spec.ts` does.
- Work on branch `feature/data-safety-folder-recovery` from main. Commit once per task. The full gate runs once, in Task 10.
- Copy rules: never show health values in a dialog or banner, only counts and dates. Dates use `formatDateTime`.

## Controller rulings on the plan

- **v1 credentials:** unlocking with v1 credentials converts them to v2 at once (wrapping the same key bytes, as the first password change does today), so every folder copy carries a lock. Owned by Task 6, with a unit test `converts v1 credentials to v2 at unlock without changing the data key`.
- **The API key copy in localStorage** (`ENCRYPTED_API_KEY_STORAGE_KEY`) follows problem 11: a value the session key cannot decrypt becomes unset, never kept as if plaintext. Owned by Task 2, with a unit test.
- **Problem 3** applies to set-aside rows not yet downloaded or deleted, as Task 4 says: once the user has saved or removed them, syncing resumes.
- **Undated records (pre-flight row 1):** the backup parser *keeps* a lab result with no valid date (`date` is an invalid `Date`, stored as `null`) instead of refusing the file. Only the views treat it differently: the timeline lists such results last, under "No date". Exports and the folder copy keep them. Invalid `createdAt`/`updatedAt` are still repaired, and if `exportedAt` is invalid too, the restore time is used. Owned by Task 1.
- **Sync after set-aside rows are saved or deleted (pre-flight row 3):** any set-aside change starts a sync at once. Owned by Task 4.
- **Fresh browser with rows but no credentials (pre-flight row 14):** the existing-data step comes first and offers "Keep it aside", "Clear it", and (from Task 9) "I already have a folder copy". Recovery from the folder then settles those rows: `settleUnreadable` runs before `prepare`. `recover` returns `'existing-locked'` when credentials appeared meanwhile, and the UI then shows the unlock screen. Owned by Tasks 5 and 9.
- **Restoring a folder backup (pre-flight row 21):** the current folder copy is first kept as a dated backup, as in a conflict, and the confirmation says so. Owned by Task 8.
- **Branch (pre-flight row 23):** `feature/data-safety-folder-recovery`.

## Review Focus

1. **A copy loaded from the folder renumbers its records** (`replaceLabData` assigns new IDs), so its exported JSON no longer equals the folder copy. Two computers must not then rewrite and reload each other's copies forever. Expected: after a load, nothing is written until this browser changes something. Task 7 test `a copy loaded from the folder is not written back`.
2. **The folder copy changes again between the conflict dialog opening and the user's choice.** For example, the other computer syncs meanwhile. "Keep this computer's data" must not overwrite the copy the user never saw. Expected: the choice re-checks the revision, and if it moved, the dialog is shown again with the new copy. Task 7 test `keeping this computer's data re-checks the folder copy first`.
3. **The folder becomes unavailable while a conflict is resolved**, so the backup file cannot be written. Expected: neither side is replaced, and the failure notice is shown. Task 7 test `when the backup cannot be written, neither side is replaced`.
4. **Someone edits the plaintext lock in the folder file**, for example by pasting in a lock for their own password. Expected: the body no longer opens, the lock is never adopted, and the copy is reported as belonging to another setup. Task 6 test `a lock edited in the file is never adopted`.
5. **Recovery with the right password but a damaged body**, or a password that opens the lock of a copy too new to read. Expected: no credentials are stored, the wizard stays on the recovery step, and the reason is shown. Task 9 test `no credentials are stored when the copy cannot be opened` in `useFolderRecovery.test.ts`.

---

### Task 1: Undated records are kept, shown under "No date", and exported (problem 9)

**Files:**
- Modify: `features/backup-restore.feature` (two scenarios), `features/timeline-view.feature` (one scenario), `e2e/backup-restore.spec.ts`
- Modify: `src/services/import/jsonImport.ts` (`parseDate`, `parseBackupData`), `src/services/import/jsonImport.test.ts`
- Modify: `src/data/db/encryptedDb.ts` (`exportAllData`, new `getUndatedLabResults`), `src/data/db/encryptedDb.robustness.test.ts`
- Modify: `src/hooks/useLabResults.ts` (`LabResultsStore.undatedResults`), `src/contexts/LabResultsContext.tsx`, `src/components/timeline/TimelineView.tsx` + test, `src/components/timeline/LabResultCard.tsx` + test

**Interfaces:**
- Produces: `parseBackupData` never refuses a file for its dates. `parseDate(value: unknown): Date` returns an invalid `Date` (`new Date(NaN)`) for `null`, a missing value or an unparseable string. It never returns `new Date(null)` (1970).
  - A lab result's `date` is kept as it is, valid or not.
  - An invalid `createdAt` is repaired to `updatedAt` when that is valid, else to the backup's `exportedAt`, else to the restore time (`new Date()`).
  - An invalid `updatedAt` is repaired to the (repaired) `createdAt`.
- Produces: `exportAllData()` returns every readable lab result and note, undated ones included: dated ones newest first, then the undated ones.
- Produces: `EncryptedDb.getUndatedLabResults(): Promise<LabResult[]>`. `getAllLabResults` is unchanged (dated only), so trends, alerts, statistics and date filters never see an invalid date.
- Produces: `LabResultsStore.undatedResults: LabResultWithDetails[]`, loaded beside `allResults`. TimelineView shows them after every dated result, under the heading "No date", and their cards show "No date" in place of the date.

- [ ] **Step 1: Gherkin.**
  - In `features/backup-restore.feature`:
    - `Scenario: A lab result without a valid date is restored and kept`: it appears on the timeline under "No date", and the next backup still holds it.
    - `Scenario: A note with an unreadable creation date is restored with a repaired date`: the note appears on the Notes page.
  - In `features/timeline-view.feature`: `Scenario: Results without a date are listed last, under "No date"`.
- [ ] **Step 2: E2E.** In `e2e/backup-restore.spec.ts`, add a test for each scenario, using `createBackupData`/`writeBackupFile`.
  - The first sets `labResults[0].date = null`. It expects the "No date" heading after the dated cards, and that a fresh standard backup's JSON has the same number of lab results.
  - The second sets a note's `createdAt = 'garbage'` and expects the note's content on the Notes page.
- [ ] **Step 3: Unit tests.**
  - `jsonImport.test.ts`:
    - `keeps a lab result whose date is null or unreadable`: `Number.isNaN(parsed.labResults[0].date.getTime())`;
    - `repairs an invalid createdAt from updatedAt, else exportedAt, else the restore time`: assert via `getTime()`, using `vi.setSystemTime` for the last case;
    - `repairs an invalid updatedAt from createdAt`.
  - `encryptedDb.robustness.test.ts`:
    - `exportAllData keeps a lab result and a note whose date is invalid, after the dated ones`;
    - `getUndatedLabResults returns only results without a valid date`.
  - `TimelineView.test.tsx`: `lists undated results last under "No date"`.
  - `LabResultCard.test.tsx`: `shows "No date" for a result without a valid date`.
- [ ] **Step 4: Run** `npx vitest run src/services/import/jsonImport.test.ts src/data/db/encryptedDb.robustness.test.ts src/components/timeline`. Expected: the new tests FAIL.
- [ ] **Step 5: Implement.** Add `private async allSealed<T>(name)` to `EncryptedDb`, returning the readable records unsorted and unfiltered. `exportAllData` and `getUndatedLabResults` use it.
- [ ] **Step 6: Verify.** Run the per-task gate with E2E specs `e2e/backup-restore.spec.ts e2e/export.spec.ts e2e/timeline-view.spec.ts`. Expected: all pass.
- [ ] **Step 7: Commit** `fix(backup): keep undated results, show them under "No date", and export every record`.

### Task 2: Set-aside store and the unlock sweep (problems 5, 6, 8, 11; the data half)

**Files:**
- Create: `features/unreadable-records.feature`, with every scenario for Tasks 2–4. Task 2's scenarios are tagged `@data`.
- Create: `e2e/unreadable-records.spec.ts` (Task 2's `@data` scenarios; Tasks 3 and 4 add to it), `e2e/steps/unreadableRecords.steps.ts`
- Modify: `src/data/db/index.ts` (version 8: v7's stores plus `setAside: '++id'`, no upgrade), `src/data/db/upgrade.test.ts`
- Create: `src/data/db/setAsideEvents.ts`, which works like `folderAccessEvents.ts`
- Modify: `src/data/db/encryptedDb.ts`
- Create: `src/data/db/encryptedDb.setAside.test.ts`
- Modify: `src/contexts/AuthContext.tsx` (sweep before `'unlocked'`), `src/contexts/AuthContext.test.tsx`
- Modify: `src/types/index.ts` (export `SetAsideSummary`)
- Modify: `src/contexts/EncryptedApiKeyContext.tsx` + `EncryptedApiKeyContext.test.tsx` (controller ruling on the localStorage API key)

**Interfaces:**
- Produces (data layer):
```ts
// src/data/db/index.ts
export type SealedTable = 'labResults' | 'testValues' | 'userNotes' | 'userPreferences';
export interface SetAsideRow {
  id?: number;
  table: SealedTable;
  /** The row exactly as it was stored: readable IDs and links, and its ciphertext */
  row: Record<string, unknown>;
  /** 1 once it is in a downloaded file: sync no longer waits for it (Task 4) */
  savedToFile: 0 | 1;
}
// src/types
export interface SetAsideSummary { total: number; unsaved: number }
// EncryptedDb
settleUnreadable(): Promise<{ returned: number; setAside: number }>;
countSetAside(): Promise<SetAsideSummary>;
exportSetAside(): Promise<SetAsideRow[]>;          // for the sealed download (Task 3)
markSetAsideSaved(ids: number[]): Promise<void>;
deleteSetAside(): Promise<number>;                   // explicit delete; returns how many
// setAsideEvents.ts
export interface SetAsideChange { movedAside: SealedTable[] }   // tables a row was just moved aside from; [] for other changes
export function notifySetAsideChanged(change?: SetAsideChange): void;
export function onSetAsideChanged(listener: (change: SetAsideChange) => void): () => void;
```
- Behaviour:
  - `settleUnreadable` runs two transactions. First, set-aside rows that now open are returned:
    - Lab results get new IDs, and test values' and notes' links are rewritten when they point to a returned row, else kept.
    - A returned preferences row goes back only when `userPreferences` is empty; otherwise it stays aside.
  - Second, every row in the four sealed tables that fails `unseal` is moved to `setAside`, with `savedToFile: 0`. Both transactions trial-decrypt under `Dexie.waitFor`.
  - `putPreferences` (problem 6): a stored row that does not unseal is moved aside in the same transaction before the new row is written, under a new ID.
  - `replaceLabData` (problem 5): inside its transaction, before clearing, it moves any row of the three lab tables that does not unseal into `setAside`.
  - `hasLabData` (problem 8) is unchanged: after the sweep the lab tables hold readable rows only. Its doc comment says so.
  - `decryptFields` (problem 11): a field that does not decrypt becomes `undefined`, with the same fixed warning.
  - Every method that changes `setAside` calls `notifySetAsideChanged` once its transaction has committed: `settleUnreadable`, `putPreferences` and `replaceLabData` when they moved rows (with the tables in `movedAside`), and `markSetAsideSaved` and `deleteSetAside` always.
  - EncryptedApiKeyContext: a stored key the session key cannot decrypt is removed from localStorage and reported as not set. Its three `console.error(..., error)` calls become fixed messages without the error.
- Consumes: nothing new.
- AuthContext: after a key is obtained (`unlock`, `setupPassword`), and before `setStatus('unlocked')`, it calls `await createEncryptedDb(key).settleUnreadable()`. A failure logs `'Could not check stored records against this key'` and unlock goes ahead.

- [ ] **Step 1: Gherkin.** Write `features/unreadable-records.feature`. Its background is "my browser holds records HemoIO cannot open with my key". Scenarios:
  - `@data` `Unreadable records are kept aside when I unlock`
  - `@data` `Restoring a backup keeps unreadable records aside`
  - `@data` `Saving preferences keeps unreadable preferences aside`
  - `@data` `An API key that cannot be decrypted is treated as not set`
  - `@data` `Records that open with a key HemoIO gets later come back`
  - `I am told how many records are kept aside` (Task 3)
  - `I can download the unreadable records as a sealed file` (Task 3)
  - `The downloaded file cannot be restored as a backup` (Task 3)
  - `I can delete the unreadable records after confirming` (Task 3)
  - `A backup export tells me what it leaves out and asks first` (Task 3)
  - `The restore confirmation says how many records are kept aside` (Task 3)
  - `The banner is accessible` (Task 3)
  - `Folder sync waits until unreadable records are saved or deleted` (Task 4)
- [ ] **Step 2: E2E.** In `unreadableRecords.steps.ts`:
  - `seedUnreadableRecords(page, { labResults: number; testValues: number; preferences?: boolean })` writes raw rows `{ id, labResultId?, encrypted: <random base64> }` straight into IndexedDB `HemoIO` after setup, then reloads and unlocks.
  - `setAsideRowCount(page): Promise<number>` reads the `setAside` table directly.

  In `e2e/unreadable-records.spec.ts`, one test per `@data` scenario:
  - after unlock, `setAsideRowCount` is 3 and the timeline shows only the readable results;
  - a restore keeps the count at 3;
  - changing the theme with an unreadable preferences row leaves that row aside, and the theme is saved;
  - an undecryptable `hemoio_ai_api_key_encrypted` shows as not configured in Settings > AI.

  "Records come back" needs a second key in the page, so it is proven by unit tests only.
- [ ] **Step 3: Unit tests** in `encryptedDb.setAside.test.ts`. Make unreadable rows with one `openTestDb()` and a second `new EncryptedDb(otherKey, database)` on the same `database`.
  - `settleUnreadable moves rows another key sealed into setAside`: `{ setAside: 3 }`, the lab tables have only this key's rows, and `countSetAside()` is `{ total: 3, unsaved: 3 }`.
  - `settleUnreadable returns rows that open with the current key, with their links rewritten`: seal a result plus 2 values under key B, settle under A (aside), then settle under B. Expect `{ returned: 3 }`, and `getTestValuesByLabResult(newId)` has 2 values.
  - `a returned preferences row waits while preferences exist`.
  - `replaceLabData moves unreadable rows aside instead of clearing them`: insert a raw row with `encrypted: 'AAAA'` after settling, then restore. `countSetAside().total === 1`.
  - `updatePreferences moves unreadable preferences aside first`: the row is aside, and the new preferences read back.
  - `getSettings leaves an undecryptable API key unset`: `aiApiKey` is `undefined`.
  - `deleteSetAside deletes only set-aside rows`, and `markSetAsideSaved` makes `unsaved` 0.
  - `every set-aside change notifies listeners once committed`: a spy sees `{ movedAside: ['userPreferences'] }` after `updatePreferences`, and `{ movedAside: [] }` after `markSetAsideSaved` and `deleteSetAside`.

  In `EncryptedApiKeyContext.test.tsx`: `an API key the session key cannot decrypt is unset and removed`, and `errors are logged without detail`.

  In `upgrade.test.ts`: `version 8 adds the setAside table and keeps the data`.
  In `AuthContext.test.tsx`: `unlock moves unreadable records aside before unlocking`. Mock `createEncryptedDb`, and assert that `settleUnreadable` resolved before `status === 'unlocked'`. Also `a failed sweep still unlocks and logs no error detail`.
- [ ] **Step 4: Run** `npx vitest run src/data/db src/contexts/AuthContext.test.tsx src/contexts/EncryptedApiKeyContext.test.tsx`. Expected: the new tests FAIL.
- [ ] **Step 5: Implement** as in Interfaces. Move `SealedTable` out of `encryptedDb.ts` into `index.ts`. Keep `unsealAll` skipping, as a defence for rows written during a session.
- [ ] **Step 6: Verify.** Run the per-task gate with E2E specs `e2e/unreadable-records.spec.ts e2e/authentication.spec.ts e2e/backup-restore.spec.ts e2e/restore-from-folder.spec.ts e2e/alerts.spec.ts e2e/settings.spec.ts`.
- [ ] **Step 7: Commit** `feat(db): keep records the session key cannot open aside, never delete them`.

### Task 3: Banner, sealed download, explicit delete, and honest exports and restores (problems 4, 5, 6, 7; the UI half)

**Files:**
- Create: `src/hooks/useSetAsideRecords.ts` + test, `src/components/storage/SetAsideBanner.tsx` + test
- Create: `src/services/export/setAsideExport.ts` + test
- Modify: `src/hooks/useExportData.ts` + test (adds `setAside: SetAsideSummary`)
- Modify: `src/components/export/ExportDialog.tsx` + test, `src/components/settings/BackupRestore.tsx` + test
- Create: `src/components/settings/RestoreConfirmation.tsx` + test, extracted from BackupRestore's restore modal body so that Task 8 reuses it
- Modify: `src/components/layout/AppShell.tsx` (renders the banner above the main content)
- Modify: `e2e/unreadable-records.spec.ts`, `e2e/steps/unreadableRecords.steps.ts` (from Task 2)

**Interfaces:**
- Consumes: Task 2's `countSetAside`, `exportSetAside`, `markSetAsideSaved`, `deleteSetAside`, `onSetAsideChanged`.
- Produces:
```ts
// services/export/setAsideExport.ts
export const SET_ASIDE_FILE_FORMAT = 'hemoio-unreadable-records';
export function buildSetAsideFile(rows: SetAsideRow[], savedAt: Date): string;
// JSON: { format, version: 1, savedAt: ISO, records: [{ table, row }] }. Rows stay as stored (ciphertext).
export function setAsideFileName(savedAt: Date): string;  // 'hemoio-unreadable-records-YYYY-MM-DD.json'
// hooks/useSetAsideRecords.ts
export function useSetAsideRecords(): {
  summary: SetAsideSummary;              // { total: 0, unsaved: 0 } while locked
  download: () => Promise<void>;         // builds the file, downloads it, marks the rows saved
  remove: () => Promise<void>;           // deleteSetAside
};
// components/settings/RestoreConfirmation.tsx
export interface RestoreConfirmationProps {
  preview: { exportedAt: Date; labResultCount: number; testValueCount: number; noteCount: number; wasEncrypted?: boolean; hasApiKey?: boolean };
  setAsideCount: number;
  /** Extra lines above the buttons, such as Task 8's folder-backup note */
  notes?: string[];
  onConfirm: () => void; onCancel: () => void; isRestoring: boolean;
  children?: React.ReactNode;            // BackupRestore's AI checkbox
}
// useExportData result gains
setAside: SetAsideSummary;
```
- Copy:
  - The banner is a Mantine `Alert` with `role="region"` and `aria-label="Unreadable records"`, with an icon and a title, so the meaning is not in color alone. Title: `"{n} stored record(s) can't be opened"`. Body: `"They were saved with a different key, or are damaged. HemoIO keeps them aside and does not delete them. You can download them as a sealed file or delete them."` Task 4 adds the sync line. Buttons: "Download sealed file" and "Delete…".
  - Delete opens a confirmation modal titled "Delete unreadable records?", with focus on "Cancel" and a red "Delete {n} record(s)" button.
  - Export (ExportDialog JSON, and BackupRestore standard and encrypted): when `setAside.total > 0`, a confirmation step says `"{n} record(s) that can't be opened are not in this backup. Download them from the banner to keep them."`, with "Cancel" and "Export anyway". CSV gets the same line as a note, with no extra step.
  - Restore confirmation (RestoreConfirmation): when `setAsideCount > 0`, add `"{n} record(s) that can't be opened are kept aside and are not affected."`.
  - Told once (problem 6): when `onSetAsideChanged` reports `movedAside` containing `'userPreferences'`, `useSetAsideRecords` shows one notification per session: title `"Earlier preferences kept aside"`, message `"Your saved preferences couldn't be opened, so HemoIO kept them aside and saved your change."`.

- [ ] **Step 1: E2E steps.** In `unreadableRecords.steps.ts`, add `setAsideBanner(page): Locator`, returning `getByRole('region', { name: 'Unreadable records' })`.
- [ ] **Step 2: E2E tests** in `e2e/unreadable-records.spec.ts`, one per non-`@data` scenario of Tasks 2–3:
  - The banner reads "3 stored records can't be opened". `readStoredRows` still shows the 3 rows' ciphertext in `setAside`.
  - The download's `suggestedFilename()` matches `/^hemoio-unreadable-records-\d{4}-\d{2}-\d{2}\.json$/`. Its JSON has `format === 'hemoio-unreadable-records'` and `records.length === 3`, and contains no seeded test names.
  - Restoring that file in Settings shows "Invalid backup file structure".
  - Delete with confirmation removes the banner. Cancel keeps it.
  - The JSON export shows the "not in this backup" step, and "Cancel" downloads nothing.
  - The restore confirmation shows "kept aside and are not affected".
  - Changing the theme over unreadable preferences shows "Earlier preferences kept aside" once; a second change shows nothing new.
  - Accessibility: the banner buttons are reachable by Tab, and Escape on the delete confirmation keeps the records.
- [ ] **Step 3: Unit tests:**
  - `setAsideExport.test.ts`: `the file holds the rows as stored and no plaintext`; `file name uses the local date`.
  - `useSetAsideRecords.test.ts`: `refreshes when set-aside rows change`; `download marks the rows saved`; `summary is empty while locked`; `tells once per session when preferences were moved aside`.
  - `SetAsideBanner.test.tsx`: `hidden when nothing is set aside`; `delete asks first, focusing Cancel`.
  - `RestoreConfirmation.test.tsx`: `shows counts, date and the set-aside line`; `shows extra notes`.
  - `ExportDialog.test.tsx` / `BackupRestore.test.tsx`: `a backup with set-aside records asks before exporting`; `cancelling downloads nothing`; `the restore confirmation names the set-aside count`.
  - `useExportData.test.ts`: `reports the set-aside summary`.
- [ ] **Step 4: Run** the new and changed unit tests. Expected: FAIL. **Implement** them. **Run** again. Expected: PASS.
- [ ] **Step 5: Verify.** Run the per-task gate with E2E specs `e2e/unreadable-records.spec.ts e2e/backup-restore.spec.ts e2e/export.spec.ts e2e/page-layout.spec.ts`.
- [ ] **Step 6: Commit** `feat(storage): show records kept aside, and let them be downloaded sealed or deleted`.

### Task 4: Sync protects the folder copy while unreadable records are unsaved (problem 3)

**Files:**
- Modify: `src/services/sync/folderSync.ts` + test (adds the `'set-aside'` reason), `src/hooks/useFilesystemSync.ts` + test, `src/hooks/useFolderSyncNotice.ts` + test, `src/components/storage/SetAsideBanner.tsx` + test
- Modify: `features/folder-sync-safety.feature`, `e2e/folder-sync-safety.spec.ts`. The `unreadable-records.feature` scenario from Task 2 is proven here.

**Interfaces:**
- Produces: `FolderProtectionReason` gains `'set-aside'`. `writeFolderCopy(store, data, key, options?: { setAsideUnsaved?: number })` returns `{ status: 'protected', reason: 'set-aside' }` without reading or writing the folder when `setAsideUnsaved > 0`. Task 6 replaces `options` with `FolderWriteContext`, and this field moves into it.
- `useFilesystemSync` reads `db.countSetAside()` with each export and passes `unsaved`. It subscribes to `onSetAsideChanged` and calls `syncNow()` on every change, so a download or a delete syncs at once, not at the next 30 s tick.
- `useFilesystemSync`'s `console.error('Failed to sync to filesystem:', error)` becomes the fixed `'Failed to sync to the folder'` (Global Constraints).
- SetAsideBanner: when folder storage is on and `unsaved > 0`, the body adds `"Folder sync is paused until you download or delete them."`.
- Notice copy for `'set-aside'`: title `Folder sync skipped`, message `"Some stored records can't be opened, and your folder copy may still hold them. HemoIO left it as it is. Download or delete the unreadable records to sync again."`.

- [ ] **Step 1: Gherkin.** Add `Scenario: Records that cannot be opened pause the folder sync` to `folder-sync-safety.feature`: the copy is unchanged and the notice is shown; after "Download sealed file" the next sync writes.
- [ ] **Step 2: E2E** in `folder-sync-safety.spec.ts`, using `seedUnreadableRecords`, `folderCopyHash` and `skippedSyncNotice`. The hash is unchanged after adding a result. After the download, the hash changes.
- [ ] **Step 3: Unit tests.**
  - `folderSync.test.ts`: `unsaved set-aside records protect the folder copy without reading it`, where `store.loadCurrent` is not called.
  - `useFilesystemSync.test.ts`: `passes the unsaved set-aside count`; `a set-aside change syncs at once`; `a failed sync logs no error detail`.
  - `SetAsideBanner.test.tsx`: `says sync is paused only with folder storage and unsaved rows`.
  - `useFolderSyncNotice.test.ts`: `explains the set-aside pause`.
- [ ] **Step 4: Run, implement, run.** Expected: FAIL, then PASS.
- [ ] **Step 5: Verify.** Run the per-task gate with E2E specs `e2e/folder-sync-safety.spec.ts e2e/unreadable-records.spec.ts e2e/restore-from-folder.spec.ts`.
- [ ] **Step 6: Commit** `fix(sync): never replace the folder copy while records that cannot be opened are unsaved`.

### Task 5: Setup is safe across tabs and over existing data (problems 1, 2, 10)

**Files:**
- Modify: `features/first-run-setup.feature`, `e2e/first-run-setup.spec.ts`
- Create: `src/data/db/storedRows.ts` + test
- Create: `src/hooks/useExistingBrowserData.ts` + test
- Create: `src/utils/withWebLock.ts` + test
- Modify: `src/contexts/AuthContext.tsx` + test, `src/components/setup/SetupWizard.tsx` + test
- Create: `src/components/setup/ExistingDataStep.tsx` + test

**Interfaces:**
- Produces:
```ts
// data/db/storedRows.ts (no key needed: counts and clears rows)
export function countStoredRows(database?: HemoIODatabase): Promise<number>; // the 4 sealed tables + setAside
export function clearStoredData(database?: HemoIODatabase): Promise<void>;   // every table, settings included, one transaction
// utils/withWebLock.ts
/** Runs `task` holding the named Web Lock; runs it directly where navigator.locks is missing (jsdom) */
export function withWebLock<T>(name: string, task: () => Promise<T>): Promise<T>;
// AuthContext
export type SetupOutcome = 'created' | 'unlocked-existing' | 'existing-locked';
setupPassword: (password: string, prepare?: (key: CryptoKey) => Promise<void>) => Promise<SetupOutcome>;
// hooks/useExistingBrowserData.ts
export function useExistingBrowserData(): { rows: number | null; clear: () => Promise<void> };
```
- `setupPassword` runs inside `withWebLock('hemoio-setup', …)`. Inside the lock it re-reads `hemoio_credentials`:
  - If they exist, it tries `unlock(password)`: on success the outcome is `'unlocked-existing'`; otherwise status becomes `'locked'` and the outcome is `'existing-locked'`. In both cases `prepare` does not run: the other tab's setup already stored its choices.
  - If not, it creates credentials as today, and the outcome is `'created'`.
- AuthProvider listens to `storage` events for `hemoio_credentials`. When credentials appear while the status is `'needs_setup'`, it adopts them and the status becomes `'locked'`. When they are removed (Task 9b's Start over in another tab), it drops the key and the status becomes `'needs_setup'`.
- SetupWizard:
  - It gets `submittingRef`, which guards `handleComplete` the way ChangePassword does (problem 10).
  - Screen order (controller ruling, row 14): when `rows > 0`, `ExistingDataStep` is the first screen, before anything else. Otherwise the wizard starts as today, and Task 9 adds a start screen in front of it.
  - `ExistingDataStep`: Copy: title `"This browser already holds HemoIO data"`, body `"It was saved by an earlier setup whose password lock is gone, so this setup can't open it."`. Choices:
    - "Keep it aside and set up anew": the default, with focus. Setup goes ahead, and Task 2's sweep moves the rows aside.
    - "Clear it and set up anew…": a red button that opens a confirmation, which calls `clear()`.
    - Task 9 adds "I already have a folder copy".
  - On `'existing-locked'`, the wizard is gone, the LoginScreen shows, and a notification says `"HemoIO was set up in another tab. Unlock with that password."`.

- [ ] **Step 1: Gherkin.** Add to `first-run-setup.feature`:
  - `Setting up in two tabs makes one setup`
  - `A tab still on setup leaves it once another tab has finished`
  - `Setup tells me when this browser already holds data`
  - `I can keep the existing data aside and set up anew`
  - `I can clear the existing data, after confirming`
  - `Pressing Get Started twice sets up once`
- [ ] **Step 2: E2E** in `first-run-setup.spec.ts`:
  - Two pages in one context: finish setup in page A; page B shows the login screen without a reload.
  - Seed rows, remove `hemoio_credentials`, and reload: the step is shown. After keeping and finishing setup, the unreadable-records banner shows the count.
  - Clearing with confirmation: no banner after setup.
  - Double submit: press Enter twice on Complete. A `localStorage.setItem` spy installed by `addInitScript` records the keys written, and `hemoio_credentials` appears exactly once.
- [ ] **Step 3: Unit tests:**
  - `storedRows.test.ts`: `counts rows without a key`; `clear empties every table`.
  - `withWebLock.test.ts`: `holds the lock while the task runs`, with a fake `navigator.locks` that records requests; `runs directly without Web Locks`.
  - `AuthContext.test.tsx`:
    - `setup over credentials another tab saved unlocks with them`;
    - `setup with a password that does not open them goes to locked`;
    - `credentials appearing in storage leave setup`;
    - `credentials removed in another tab return to setup`;
    - `setup over existing credentials does not run prepare`;
    - `two setups at once create one data key`: two `setupPassword` calls sharing the fake lock; `createCredentialsV2` is called once.
  - `SetupWizard.test.tsx`:
    - `a second submit while the first runs is ignored`: `setupPassword` is called once;
    - `shows the existing-data step when rows exist`;
    - `clearing asks first`.
- [ ] **Step 4: Run, implement, run.** Expected: FAIL, then PASS.
- [ ] **Step 5: Verify.** Run the per-task gate with E2E specs `e2e/first-run-setup.spec.ts e2e/authentication.spec.ts e2e/unreadable-records.spec.ts`.
- [ ] **Step 6: Commit** `fix(setup): one data key across tabs, and never set up over existing data unasked`.

### Task 6: The folder copy carries its password lock (key beside the copy, password changes, another setup)

**Files:**
- Modify: `src/data/encryption/index.ts`. `encrypt` and `decrypt` take an optional `additionalData?: Uint8Array`. Plus `encryption.test.ts`.
- Modify: `src/data/encryption/keyWrapping.ts` + test (`changedAt`; v1 → v2 at unlock, per the controller ruling)
- Create: `src/services/sync/folderEnvelope.ts` + test
- Modify: `src/services/sync/folderSync.ts`, `folderCopy.ts`, `index.ts` + tests
- Modify: `src/contexts/AuthContext.tsx` + test (`storedLock`, `adoptFolderLock`, v1 conversion at unlock)
- Modify: `src/hooks/useFilesystemSync.ts`, `useFolderRestore.ts`, `useFolderSyncNotice.ts` + tests; `src/components/storage/FolderRestoreModal.tsx` + test
- Modify: `features/folder-sync-safety.feature`, `features/change-password.feature`, `features/restore-from-folder.feature` (its "another password" scenario becomes "another setup"), `e2e/folder-sync-safety.spec.ts`, `e2e/change-password.spec.ts`, `e2e/restore-from-folder.spec.ts`, `e2e/steps/folderRestore.steps.ts` (`writeForeignFolderCopy`, `folderCopyHash`)
- Create: `e2e/steps/otherComputer.steps.ts`

**Interfaces:**
- Produces:
```ts
// keyWrapping.ts: StoredCredentialsV2 gains
/** ISO time this lock was made; the later of two locks for the same key wins */
changedAt?: string;   // set by createCredentialsV2 and rewrapCredentials; checked by isCredentialsV2 when present
/** Missing changedAt is oldest; any lock is later than `null` (a legacy copy without one) */
export function isLaterLock(a: StoredCredentialsV2, than: StoredCredentialsV2 | null): boolean;

// services/sync/folderEnvelope.ts
export const FOLDER_ENVELOPE_FORMAT = 'hemoio-folder-copy';
export interface FolderEnvelopeHeader { format: typeof FOLDER_ENVELOPE_FORMAT; version: 1; lock: StoredCredentialsV2 | null }
/** File: JSON { format, version, lock, sealed: base64(IV + AES-GCM) }; additional data = envelopeAad(header) */
export function sealEnvelope(plain: Uint8Array, key: CryptoKey, lock: StoredCredentialsV2 | null): Promise<ArrayBuffer>;
/** The header, null for a legacy raw copy (not JSON with this format), or 'damaged' */
export function readEnvelopeHeader(bytes: ArrayBuffer): FolderEnvelopeHeader | null | 'damaged';
/** Opens either format; rejects when the key does not open it */
export function openEnvelope(bytes: ArrayBuffer, key: CryptoKey): Promise<{ header: FolderEnvelopeHeader | null; plain: ArrayBuffer }>;
```
- `envelopeAad(header)` serialises in a fixed key order: `format, version, lock{version, kekSalt, iterations, wrapIv, wrappedKey, changedAt}`. A reordered header still opens; an edited value does not.
- The sealed body is today's `{ version, exportedAt, data }` plus `revision: string` (`crypto.randomUUID()`), which Task 7 uses.
- `FolderCopyReading`'s readable case (in `folderCopy.ts`) becomes `{ status: 'readable'; data: ParsedBackupData; revision: string | null; lock: StoredCredentialsV2 | null }`. `revision` is null for a legacy copy. Tasks 7, 8 and 9 read both fields from it.
- `FolderCopyProblem` and `FolderProtectionReason` gain `'another-setup'`. It is returned when the header has a lock but the session key does not open the body. A legacy copy that does not open stays `'cannot-decrypt'`/`'unreadable'`.
- `writeFolderCopy(store, data, key, context: FolderWriteContext)`, where `FolderWriteContext = { lock: StoredCredentialsV2 | null; setAsideUnsaved: number }` (Task 7 adds fields):
  - it writes when the data differ, or when `context.lock` is later than the folder's lock (`isLaterLock`);
  - otherwise it returns `'unchanged'`;
  - readable outcomes return `folderLock: StoredCredentialsV2 | null`. In sync results, `folderLock` always means the lock *found in the folder*.
- AuthContext adds:
  - `storedLock: StoredCredentialsV2 | null`: this browser's stored credentials (always v2 after unlock, see below);
  - `adoptFolderLock(lock: StoredCredentialsV2): boolean`: saves the lock as the stored credentials when `isLaterLock(lock, storedLock)`, and keeps the session key. The next unlock then needs the new password.
  - v1 conversion (controller ruling): `unlock` with v1 credentials wraps the same key bytes into v2 credentials, as `rewrapCredentials(password, password, v1)` does, checks them with `keyMatchesCredentials`, and stores them before unlocking. A failure leaves the v1 credentials and unlocks.
- `useFilesystemSync` passes `storedLock` as `context.lock`, and calls `adoptFolderLock` with any `folderLock` it gets back. A change of `storedLock` (a password change) triggers `syncNow()`.
- Copy for `'another-setup'`:
  - Modal: `"The copy in {folder} belongs to another HemoIO setup, made with a different key. HemoIO won't write over it. To use that folder on this computer, HemoIO must be set up again from that folder's copy."` Task 9b adds where to do that.
  - Notice: title `Folder sync skipped`, message `"Your folder holds another HemoIO setup's copy, so HemoIO left it as it is. Choose a different folder in Settings > Data to keep syncing."`.

- [ ] **Step 1: Gherkin.**
  - `folder-sync-safety.feature`:
    - `The folder copy keeps the password lock beside the data`: the file holds no readable record count or test name.
    - `A password change reaches the folder`.
    - `A password changed on another computer is picked up at the next sync`: I keep working, and the next unlock needs the new password.
    - `When both computers change the password, the later change wins`.
    - `A folder from another setup is explained`.
  - `change-password.feature`: `Changing the password updates the lock in my folder`.
- [ ] **Step 2: E2E steps.** In `otherComputer.steps.ts`, add `saveCopyAsAnotherComputer(page, options: { password: string; data?: SeedData; newPassword?: string; changedAt?: string })`. In the page it:
  - unwraps the DEK from `hemoio_credentials` with `password` (PBKDF2 + `unwrapKey`, extractable);
  - when `newPassword` is given, re-wraps the DEK with a fresh salt and IV and the given `changedAt`;
  - writes an envelope with a new `revision`, using the format above.

  Add `readFolderEnvelope(page): Promise<{ header: object; sealedLength: number }>` to `otherComputer.steps.ts`. In `folderRestore.steps.ts`, replace `writeForeignFolderCopy`'s `'other-password'` kind with `'another-setup'` (an envelope under a fresh key and lock) and add a `'legacy-other-key'` kind for the raw format. Update its use in `e2e/restore-from-folder.spec.ts` (the "another password" test) and the matching scenario in `restore-from-folder.feature`.
- [ ] **Step 3: E2E tests:**
  - The folder file parses as JSON with `format === 'hemoio-folder-copy'` and a `lock.wrappedKey`, and its text contains neither `'Hemoglobin'` nor `'718-7'`.
  - After a Settings password change, `readFolderEnvelope().header.lock.changedAt` is newer.
  - `saveCopyAsAnotherComputer({ newPassword: NEW_PASSWORD, changedAt: <future> })`. The app keeps working. After lock/unlock, the old password is rejected (`expectPasswordRejected`) and the new one unlocks.
  - Both changed: this computer's later lock stays in the folder.
  - Another setup's copy shows the explanation in the dialog, and the copy hash is unchanged.
- [ ] **Step 4: Unit tests:**
  - `folderEnvelope.test.ts`:
    - `seals and opens with the lock beside the data`;
    - `opens a legacy raw copy`;
    - `a lock edited in the file does not open`: change one char of `wrappedKey`, and `openEnvelope` rejects;
    - `a reordered header still opens`;
    - `the plaintext holds only format, version and lock`: `Object.keys(JSON.parse(text)).sort()` equals `['format','lock','sealed','version']`.
  - `folderSync.test.ts`:
    - `a lock edited in the file is never adopted`: with one char of `wrappedKey` changed, `writeFolderCopy` returns `{ status: 'protected', reason: 'another-setup' }` with no `folderLock`;
    - `rewrites an unchanged copy when this lock is later`;
    - `rewrites a legacy copy so that it carries the lock`;
    - `leaves an unchanged copy alone when the folder lock is later, and returns it`.
  - `folderCopy.test.ts`: `a copy with a lock the key cannot open is another setup's`.
  - `keyWrapping.test.ts`:
    - `new and rewrapped credentials record when they were made`;
    - `isLaterLock treats a missing date as oldest`;
    - `isCredentialsV2 rejects an invalid changedAt`;
    - `isLaterLock: any lock is later than null`.
  - `AuthContext.test.tsx`:
    - `adopts a later folder lock and needs the new password next unlock`;
    - `ignores an earlier folder lock`;
    - `converts v1 credentials to v2 at unlock without changing the data key`: data saved under the v1 key still reads after the conversion, and the stored credentials are v2.
  - `useFilesystemSync.test.ts`:
    - `a password change syncs at once`;
    - `adopts the lock the sync found`.
  - `FolderRestoreModal.test.tsx`: `explains a folder from another setup`.
  - `encryption.test.ts`: `additional data must match to decrypt`.
- [ ] **Step 5: Run, implement, run.** Expected: FAIL, then PASS.
- [ ] **Step 6: Verify.** Run the per-task gate with E2E specs `e2e/folder-sync-safety.spec.ts e2e/restore-from-folder.spec.ts e2e/change-password.spec.ts e2e/settings.spec.ts`.
- [ ] **Step 7: Commit** `feat(sync): keep the password lock beside the folder copy, sealed to it`.

### Task 7: Two computers on one folder: newer copies load, conflicts ask and keep both

**Files:**
- Create: `features/folder-sync-two-computers.feature`, `e2e/folder-sync-two-computers.spec.ts`
- Create: `src/data/storage/folderSyncState.ts` + test
- Modify: `src/data/storage/FileSystemStorageProvider.ts` + test (backups directory)
- Modify: `src/services/sync/folderSync.ts` + test, `src/services/sync/folderCopy.ts` + test (`assessFolderCopy`'s offer carries `revision`)
- Modify: `src/data/storage/folderAccessEvents.ts` + test (backup change events)
- Create: `src/services/sync/folderBackups.ts` + test
- Modify: `src/hooks/useFilesystemSync.ts` + test, `src/hooks/useFolderRestore.ts` + test (the restore acknowledges the revision)
- Create: `src/components/storage/FolderConflictModal.tsx` + test
- Modify: `src/components/layout/AppShell.tsx`

**Interfaces:**
- Produces:
```ts
// data/storage/folderSyncState.ts: localStorage 'hemoio_folder_sync_state', encryptString'd with the session key
export interface FolderSyncState { revision: string | null; digest: string }
export function loadFolderSyncState(key: CryptoKey): Promise<FolderSyncState | null>; // null when absent or unreadable
export function saveFolderSyncState(state: FolderSyncState, key: CryptoKey): Promise<void>;

// FileSystemStorageProvider
export const FOLDER_BACKUPS_DIR_NAME = 'hemoio-backups';
listBackups(): Promise<string[]>; saveBackup(name: string, bytes: ArrayBuffer): Promise<void>;
loadBackup(name: string): Promise<ArrayBuffer>; deleteBackup(name: string): Promise<void>;
// saveBackup and deleteBackup call notifyFolderBackupsChanged() once written
// folderAccessEvents.ts
export function notifyFolderBackupsChanged(): void;
export function onFolderBackupsChanged(listener: () => void): () => void;

// services/sync/folderBackups.ts
export const MAX_FOLDER_BACKUPS = 10;
export interface FolderBackupStore { listBackups; saveBackup; loadBackup; deleteBackup } // as above
export function backupFileName(at: Date): string;   // 'hemoio-backup-20261106T101500123Z.encrypted' (UTC, ms)
export function backupDate(name: string): Date | null;
/** Saves the bytes as a dated backup, then deletes all but the MAX_FOLDER_BACKUPS newest */
export function keepFolderBackup(store: FolderBackupStore, bytes: ArrayBuffer, at?: Date): Promise<string>;

// services/sync/folderSync.ts
export function digestFolderData(dataJson: string): Promise<string>;  // SHA-256, base64
export function sealFolderCopy(data: FolderSyncData, key: CryptoKey, lock: StoredCredentialsV2 | null):
  Promise<{ bytes: ArrayBuffer; revision: string }>;
/** The one place that records "this browser has read or written this revision": exports the data
 *  as it now is, digests it, and saves { revision, digest }. Used by Tasks 7 and 9. */
export function markFolderCopySeen(db: Pick<EncryptedDb, 'exportAllData'>, key: CryptoKey, revision: string | null): Promise<void>;
export interface FolderSide { labResults: number; testValues: number; notes: number; savedAt: Date | null }
export interface FolderWriteContext {
  lock: StoredCredentialsV2 | null; setAsideUnsaved: number;
  lastSeen: FolderSyncState | null;
  /** The revision the user chose to replace ("keep this computer's data") */
  replaces?: string | null;
}
export type FolderSyncOutcome =
  | { status: 'written'; state: FolderSyncState; folderLock: StoredCredentialsV2 | null }
  | { status: 'unchanged'; state: FolderSyncState; folderLock: StoredCredentialsV2 | null }
  | { status: 'protected'; reason: FolderProtectionReason }
  | { status: 'changed-elsewhere'; copy: ParsedBackupData; revision: string | null; bytes: ArrayBuffer;
      localChanged: boolean; folder: FolderSide; browser: FolderSide; folderLock: StoredCredentialsV2 | null };
```
- Decision rules in `writeFolderCopy`, in order. Here `copy` is the readable folder copy, `local` is the exported data JSON, and `d = digestFolderData(local)`:
  1. `'set-aside'` (Task 4), then the unreadable, newer, before-LOINC and another-setup protections (as now).
  2. No copy, or an empty file: write.
  3. The copy's revision is the one the user chose to replace: write.
  4. The copy's revision is `lastSeen.revision`, and `lastSeen !== null`:
     - if `d === lastSeen.digest` and the lock is not later, return `'unchanged'`. This stops the ping-pong in Review Focus item 1;
     - otherwise apply today's empty rule and previous-copy rule, then write.
  5. Otherwise (written elsewhere, or never read), with `localChanged = lastSeen === null || d !== lastSeen.digest`:
     - if `local` equals the copy's data JSON, return `'unchanged'` with `state = { revision, digest: d }`;
     - if `!localChanged`, return `'changed-elsewhere'` (to be loaded), even when this browser is empty. The spec says a newer copy with no local changes loads;
     - if the folder copy has no health records, write over it;
     - if this browser has no health records, return protected `'empty'` (today's rule, for a browser that lost its data);
     - otherwise return `'changed-elsewhere'` (a conflict).
- `FolderSide.savedAt`: the folder side uses the copy's `exportedAt`. The browser side uses the latest `updatedAt` among its records, or null.
- `useFilesystemSync({ enabled, applyFolderCopy })`. `applyFolderCopy: (data: ParsedBackupData) => Promise<void>` replaces the data and reloads contexts. AppShell builds it from `handleRestore`'s steps without its notification, and it **never calls `syncNow`**: it runs inside a sync that holds `lastRef` and the Web Lock, and awaiting another sync there would deadlock. The sync saves the state itself afterwards.
  - The hook runs each sync inside `withWebLock('hemoio-folder-sync', …)`, and saves `state` after `'written'`/`'unchanged'`.
  - On `'changed-elsewhere'` with `!localChanged`, it calls `applyFolderCopy`, then `markFolderCopySeen(db, key, revision)`, and shows a notification: title `"Updated from the folder"`, message `` `Saved on ${formatDateTime(exportedAt)}` ``.
  - With `localChanged`, it holds syncs and exposes `conflict: { folder: FolderSide; browser: FolderSide; folderName: string | null } | null` and `resolveConflict(choice: 'folder' | 'browser' | 'later'): Promise<void>`:
    - `'folder'`: `keepFolderBackup(sealFolderCopy(local).bytes)`, then `applyFolderCopy`, then `markFolderCopySeen`;
    - `'browser'`: `keepFolderBackup(bytes)`, then sync with `replaces: revision`; a `'changed-elsewhere'` result shows the dialog again;
    - `'later'`: hold for the session, as "Not now" does;
    - a failed backup write rejects, and nothing is replaced.
  - It also exposes `acknowledgeFolderCopy(revision: string | null): Promise<void>`, which is `markFolderCopySeen` with the session's db and key. `handleFolderRestore` calls it after the FolderRestoreModal restore, so that a restore is never followed by a conflict. `assessFolderCopy`'s `'offer'` gains `revision`.
- FolderConflictModal:
  - title `"Your folder copy changed on another computer"`;
  - two side-by-side `Paper`s, "In the folder" and "On this computer", each with counts and `Saved {date}` (or `Last changed {date}`), with no values;
  - the note `"The side you don't choose is kept as a dated backup in your folder."`;
  - buttons "Decide later" (focused; Escape does the same), "Keep this computer's data" and "Load the folder copy";
  - a failure shows `role="alert"`: `"Nothing was changed: the backup could not be saved to your folder."`.

- [ ] **Step 1: Gherkin.** In `features/folder-sync-two-computers.feature`, background: two computers sync the same folder with one setup. Scenarios:
  - `A newer folder copy loads when I have no changes`, with the notice and date;
  - `A newer folder copy is also noticed during a session`;
  - `With changes on both sides I choose, and see counts and dates only`;
  - `Loading the folder copy keeps my computer's data as a dated backup`;
  - `Keeping my computer's data keeps the folder copy as a dated backup`;
  - `Deciding later writes nothing`;
  - `A copy loaded from the folder is not written back unchanged`;
  - `Only the 10 newest backups are kept`;
  - `The conflict dialog is accessible`.
- [ ] **Step 2: E2E** in `folder-sync-two-computers.spec.ts`, using `saveCopyAsAnotherComputer` and `folderCopyHash`. Add the helper `folderBackupNames(page): Promise<string[]>` to `otherComputer.steps.ts`, reading `hemoio-backups/` from OPFS. Write one test per scenario:
  - the date notice;
  - the dialog counts, with no test names in `dialog.textContent()`;
  - `folderBackupNames` gains one entry matching `/^hemoio-backup-\d{8}T\d{9}Z\.encrypted$/`;
  - after loading, the hash stays unchanged across two periodic syncs (`page.clock` fast-forward 30 s × 2);
  - 11 conflicts leave 10 names.
- [ ] **Step 3: Unit tests:**
  - `folderSync.test.ts`:
    - `a copy loaded from the folder is not written back`: write with `lastSeen = { revision: r, digest: digest(renumbered local) }` against a copy of revision r with other IDs, and expect `'unchanged'` with no `save` call;
    - `a copy written elsewhere with no local changes is changed-elsewhere, not local-changed`;
    - `with local changes it is a conflict`;
    - `never-read browser data equal to the copy is adopted`;
    - `never-read browser data differing from the copy is a conflict` (the spec's "data still in the browser");
    - `keeping this computer's data re-checks the folder copy first`: `replaces: 'r1'` against a copy now at `'r2'` returns `'changed-elsewhere'`;
    - `an empty browser that changed nothing since it last read loads the newer copy`: `lastSeen.digest` is the digest of the empty export, and the result is `'changed-elsewhere'` with `localChanged: false`;
    - `a never-read empty browser stays protected`;
    - `markFolderCopySeen saves the digest of the data as it now is`.
  - `folderBackups.test.ts`:
    - `names sort by time`;
    - `backupDate reads the name back`;
    - `keeps the 10 newest`;
    - `a failed save deletes nothing`.
  - `folderSyncState.test.ts`:
    - `round-trips encrypted`, where the stored string contains no `revision` plaintext;
    - `unreadable state is null`.
  - `useFilesystemSync.test.ts`:
    - `loads a newer copy and notifies with its date`;
    - `when the backup cannot be written, neither side is replaced`: `saveBackup` rejects, so `applyFolderCopy` and `save` are not called, and `resolveConflict` rejects;
    - `syncs run inside the folder-sync Web Lock`;
    - `loading a newer copy does not start another sync`: `applyFolderCopy` completes while `syncNow` is never called from it, and the sync settles.
  - `FileSystemStorageProvider.test.ts`: `backups live in hemoio-backups`; `saving or deleting a backup notifies listeners`.
  - `FolderConflictModal.test.tsx`:
    - `shows counts and dates, never values`;
    - `focuses Decide later and Escape decides later`;
    - `shows the failure alert and stays open`.
  - `useFolderRestore.test.ts`: `the offer carries the copy's revision`.
- [ ] **Step 4: Run, implement, run.** Expected: FAIL, then PASS.
- [ ] **Step 5: Verify.** Run the per-task gate with E2E specs `e2e/folder-sync-two-computers.spec.ts e2e/folder-sync-safety.spec.ts e2e/restore-from-folder.spec.ts e2e/unreadable-records.spec.ts`.
- [ ] **Step 6: Commit** `feat(sync): load newer folder copies, and ask on conflict, keeping both sides`.

### Task 8: Folder backups listed and restorable in Settings

**Files:**
- Create: `src/hooks/useFolderBackups.ts` + test, `src/components/settings/FolderBackups.tsx` + test
- Modify: `src/components/settings/StorageSettings.tsx` (renders `FolderBackups` when folder storage is on), `src/components/settings/SettingsPage.tsx` (passes `onRestore`)
- Create: `src/components/storage/folderCopyProblemMessage.ts` + test. A plain `.ts` module: a non-component export from a `.tsx` file fails `react-refresh/only-export-components`.
- Modify: `src/components/storage/FolderRestoreModal.tsx` + test (imports the message from there)
- Modify: `features/folder-sync-two-computers.feature` (two scenarios), `e2e/folder-sync-two-computers.spec.ts`

**Interfaces:**
- Consumes: Task 7's `FolderBackupStore` methods, `backupDate`, `keepFolderBackup` and `onFolderBackupsChanged`; Task 6's `readFolderCopy`; Task 3's `RestoreConfirmation`.
- Produces:
```ts
export interface FolderBackupEntry { name: string; savedAt: Date }
export function useFolderBackups(): {
  backups: FolderBackupEntry[];                 // newest first; refreshed on onFolderBackupsChanged and on folder access change
  read: (name: string) => Promise<FolderCopyReading>;
  /** Keeps the current folder copy as a dated backup (keepFolderBackup); rejects when it cannot */
  keepCurrentCopy: () => Promise<void>;
};
// components/storage/folderCopyProblemMessage.ts (moved out of FolderRestoreModal.tsx)
export function folderCopyProblemMessage(reason: FolderCopyProblem, folder: string): string;
```
- FolderBackups:
  - a section titled "Folder backups", with the description `"Kept when your folder copy and this computer disagreed. The 10 newest are kept."`;
  - a list of `Saved {formatDateTime}`, each with a "Restore…" button whose `aria-label` is `"Restore the backup saved {date}"`;
  - "Restore…" reads the backup and opens `RestoreConfirmation` with the note `"Your current folder copy is kept as a dated backup first."` (controller ruling, row 21). On confirm it calls `keepCurrentCopy()`, then `onRestore(data, { restoreAISettings: false })`. If the backup cannot be kept, nothing is restored and the alert `"Nothing was changed: the current folder copy could not be kept as a backup."` is shown;
  - an unreadable backup shows `folderCopyProblemMessage`.
  - With no backups: `"No folder backups yet."`.

- [ ] **Step 1: Gherkin.**
  - `I can restore a dated folder backup from Settings, after confirming, and the current folder copy is kept as a backup first`;
  - `A backup that can't be read is explained, and nothing changes`.
- [ ] **Step 2: E2E.** Create a conflict, keep this computer's data, open Settings > Data, and restore the backup. The confirmation names the backup kept first, the timeline shows the other computer's results, and `folderBackupNames` has one more entry. Then corrupt a backup file in OPFS: the explanation shows, and the timeline is unchanged.
- [ ] **Step 3: Unit tests:**
  - `useFolderBackups.test.ts`:
    - `lists newest first, skipping names that are not backups`;
    - `refreshes on folder access change and when backups change`;
    - `keepCurrentCopy saves the current copy as a dated backup`.
  - `FolderBackups.test.tsx`:
    - `restore asks first, keeps the current copy, then passes the data`;
    - `a failed keep restores nothing and shows the alert`;
    - `cancel restores nothing`;
    - `explains an unreadable backup`;
    - `each restore button names its date`.
- [ ] **Step 4: Run, implement, run.** Expected: FAIL, then PASS.
- [ ] **Step 5: Verify.** Run the per-task gate with E2E specs `e2e/folder-sync-two-computers.spec.ts e2e/settings.spec.ts e2e/backup-restore.spec.ts`.
- [ ] **Step 6: Commit** `feat(settings): list and restore the dated folder backups`.

### Task 9: First run: "I already have a folder copy"

**Files:**
- Create: `features/setup-from-folder.feature`, `e2e/setup-from-folder.spec.ts`, `e2e/steps/setupFromFolder.steps.ts`
- Modify: `src/services/sync/folderCopy.ts` + test (`unlockFolderCopy`)
- Create: `src/hooks/useFolderRecovery.ts` + test
- Modify: `src/contexts/AuthContext.tsx` + test (`recoverFromFolder`)
- Create: `src/components/setup/FolderRecoveryStep.tsx` + test, `src/components/setup/SetupStartStep.tsx` + test (the start screen)
- Modify: `src/components/setup/SetupWizard.tsx` + test, `src/components/setup/ExistingDataStep.tsx` + test

**Interfaces:**
- Consumes:
  - Task 5's `withWebLock`, `SetupOutcome` and `ExistingDataStep`;
  - Task 6's `readEnvelopeHeader`, `openEnvelope` and `FolderCopyReading.revision`, plus the existing `unlockV2` (`keyWrapping.ts`);
  - Task 7's `markFolderCopySeen`;
  - Task 8's `folderCopyProblemMessage`;
  - Task 2's `settleUnreadable`.
- Produces:
```ts
// services/sync/folderCopy.ts
export type FolderUnlockProblem = 'no-copy' | 'no-lock' | 'wrong-password' | Exclude<FolderCopyProblem, 'another-setup'>;
export function unlockFolderCopy(bytes: ArrayBuffer | null, password: string):
  Promise<{ ok: true; key: CryptoKey; lock: StoredCredentialsV2; copy: ParsedBackupData; revision: string | null }
        | { ok: false; problem: FolderUnlockProblem }>;
// AuthContext
recoverFromFolder: (lock: StoredCredentialsV2, key: CryptoKey, prepare?: (key: CryptoKey) => Promise<void>) => Promise<SetupOutcome>;
// hooks/useFolderRecovery.ts
export function useFolderRecovery(): {
  folderName: string | null;
  chooseFolder: () => Promise<void>;                     // FileSystemStorageProvider.selectDirectory
  /** null: recovered and unlocked; 'existing-locked': another tab set up meanwhile, so the unlock screen shows */
  recover: (password: string) => Promise<FolderUnlockProblem | 'existing-locked' | null>;
};
```
- `recoverFromFolder` holds the same `'hemoio-setup'` Web Lock and re-check as `setupPassword`. Credentials present meanwhile → it stores nothing, the status becomes `'locked'`, and it returns `'existing-locked'`. Otherwise, in this order:
  1. save `lock` as the credentials;
  2. `settleUnreadable()` with `key`. Set-aside rows that open come back, and rows another key sealed (a fresh browser's leftovers, from ExistingDataStep) go aside;
  3. `prepare(key)`, which now sees only readable rows;
  4. unlock.
  This order stops a restore duplicating rows the sweep returns, and stops unswept rows hiding the copy.
- `recover`'s `prepare`:
  - sets `STORAGE_PROVIDER_KEY` to `'filesystem'`;
  - then, if `hasLabData()` is false, runs `restoreBackup(db, copy)` and `markFolderCopySeen(db, key, revision)`;
  - otherwise leaves the browser's data and saves no state. The first sync then finds never-read browser data differing from the copy, and Task 7 shows the conflict dialog. Equal data is adopted. This is the spec's "data still in the browser becomes readable again".
- With any problem, `recoverFromFolder` is never called, so nothing is stored (Review Focus item 5).
- Copy:
  - Screen order (controller ruling, row 14): with stored rows, ExistingDataStep comes first (Task 5) and gains "I already have a folder copy". Without them, a new start screen comes first, offering "Set up HemoIO" and "I already have a folder copy". "I already have a folder copy" is shown only where `isFileSystemAccessSupported()`.
  - On `'existing-locked'` the wizard leaves, the unlock screen shows, and Task 5's "set up in another tab" notification appears.
  - FolderRecoveryStep has "Choose folder", a "Password you used" `PasswordInput`, and "Unlock and restore".
  - Problems are shown in a `role="alert"`:
    - `no-copy`: `"This folder has no HemoIO copy."`
    - `no-lock`: `"This copy was saved before HemoIO kept the password lock in the folder. Only the browser that saved it can restore it."`
    - `wrong-password`: `"That password doesn't open this copy."` Focus returns to the password field.
    - others: `folderCopyProblemMessage`.

- [ ] **Step 1: Gherkin.** `features/setup-from-folder.feature`:
  - `After this browser forgot HemoIO, I restore from my folder with my password`;
  - `On another computer, I set up from the shared folder`;
  - `My password stays the same`;
  - `A wrong password is refused, and I can try again`;
  - `A folder without a copy is explained`;
  - `An old copy without a lock is explained`;
  - `A damaged copy stores nothing`;
  - `Data still in this browser becomes readable again, and I choose if it differs` (the localStorage-only loss);
  - `Records set aside earlier come back when the folder's key opens them`;
  - `Leftover data of another setup is kept aside when I restore from my folder`;
  - `If another tab finishes setup first, I am asked to unlock`;
  - `The recovery step is accessible`.
- [ ] **Step 2: E2E steps and tests.** In `setupFromFolder.steps.ts`:
  - `forgetHemoIO(page, { keepDatabase: boolean })` clears localStorage, deletes the `HemoIO` IndexedDB unless `keepDatabase`, and reloads. OPFS stays, as a synced folder does.
  - `recoverFromFolder(page, password)`.

  Tests:
  - set up with a folder and two results, `forgetHemoIO`, recover: both results are on the timeline, the lock and unlock work with the same password, and the folder hash is unchanged until a change;
  - a wrong password shows the alert, and the password field is focused;
  - no-copy, legacy (`writeForeignFolderCopy('legacy-other-key')`) and damaged copies: each shows its message, and `localStorage.hemoio_credentials` is null;
  - `keepDatabase: true` with one more local result than the folder: the conflict dialog is shown after recovery;
  - seeded unreadable rows and no credentials: ExistingDataStep shows first, "I already have a folder copy" recovers, the folder's results are on the timeline, and the banner counts the leftover rows;
  - an accessibility test in the style of the repo's existing ones (no axe): every field is labelled, the Tab order runs through the step, and focus moves to the error.
- [ ] **Step 3: Unit tests:**
  - `folderCopy.test.ts`:
    - `unlocks a copy with the password that made its lock`;
    - `a wrong password is wrong-password`;
    - `a legacy copy is no-lock`;
    - `no bytes is no-copy`;
    - `a damaged body under a valid lock is cannot-decrypt`.
  - `useFolderRecovery.test.ts`:
    - `restores the copy into an empty browser and records its revision`;
    - `leaves browser data for the conflict check`;
    - `no credentials are stored when the copy cannot be opened`: for each problem, `recoverFromFolder` is not called and `localStorage.hemoio_credentials` stays null;
    - `returns existing-locked when another tab set up first`.
  - `AuthContext.test.tsx`:
    - `recoverFromFolder saves the lock, sweeps before prepare, and unlocks`: a call-order spy shows `settleUnreadable` resolving before `prepare` starts;
    - `recoverFromFolder defers to credentials another tab saved`.
  - `FolderRecoveryStep.test.tsx`:
    - `shows each problem message`;
    - `focuses the password after a wrong password`.
  - `SetupWizard.test.tsx`: `offers the folder copy only where folders are supported`.
- [ ] **Step 4: Run, implement, run.** Expected: FAIL, then PASS.
- [ ] **Step 5: Verify.** Run the per-task gate with E2E specs `e2e/setup-from-folder.spec.ts e2e/first-run-setup.spec.ts e2e/folder-sync-two-computers.spec.ts e2e/unreadable-records.spec.ts`.
- [ ] **Step 6: Commit** `feat(setup): set HemoIO up from a folder copy with its password`.

### Task 9b: "Start over" in Settings (user's decision, 2026-11-06)

**Files:**
- Create: `features/start-over.feature`, `e2e/start-over.spec.ts`, `src/components/settings/StartOver.tsx` + `StartOver.test.tsx`
- Modify: `src/components/settings/SettingsPage.tsx` (StartOver on the Security tab), `src/contexts/AuthContext.tsx` + `AuthContext.test.tsx` (`startOver`)
- Modify: `src/data/db/storedRows.ts` + test (`clearLocalHemoIOStorage`)
- Modify: `src/components/storage/FolderRestoreModal.tsx` + test, `src/hooks/useFolderSyncNotice.ts` + test, `features/folder-sync-safety.feature`, `e2e/folder-sync-safety.spec.ts` (the "another setup" messages now point here)

**Interfaces:**
- Consumes: Task 5's `clearStoredData` and its `storage` listener (credentials removed → `'needs_setup'`); Task 6's `'another-setup'` reason; Task 9's "I already have a folder copy".
- Produces:
```ts
// data/db/storedRows.ts
/** Removes every localStorage key starting with 'hemoio_' (credentials, sync state, API key, provider
 *  choices, the LocalStorageProvider backup) and FileSystemStorageProvider's handle store */
export function clearLocalHemoIOStorage(): Promise<void>;
// AuthContext
startOver: () => Promise<void>;   // clearStoredData() (no Dexie.delete: the shared db stays open), then
                                  // clearLocalHemoIOStorage(), drop the key, status 'needs_setup'
```
- It never touches the folder or its files. Other open tabs return to setup through Task 5's `storage` listener, because `hemoio_credentials` is removed.
- Copy:
  - StartOver: title "Start over", body `"Removes all of HemoIO's data from this browser. Your folder copy and folder backups are not touched. Export a backup first if this browser has data you need."`, with an "Export a backup" link to the Data tab;
  - the confirmation asks the user to type `START OVER`. "Cancel" has focus, and Escape cancels;
  - the `'another-setup'` modal ending becomes `"…HemoIO must be set up again from that folder's copy: in Settings > Security, choose Start over, then \"I already have a folder copy\"."`;
  - the notice becomes `"Your folder holds another HemoIO setup's copy, so HemoIO left it as it is. Choose a different folder in Settings > Data, or use Start over in Settings > Security to set up from that copy."`.

- [ ] **Step 1: Gherkin.** In `features/start-over.feature`:
  - `I start over after confirming, and first run is shown`;
  - `The dialog offers to export a backup first`;
  - `Cancelling changes nothing`;
  - `My folder copy and folder backups are unchanged afterwards`;
  - `Another open tab returns to setup`;
  - `The "another setup" message points to Start over`;
  - `The dialog is accessible`.

  In `features/folder-sync-safety.feature`, update the "another setup" scenario's wording.
- [ ] **Step 2: E2E.** In `e2e/start-over.spec.ts`, one test per scenario:
  - after confirming, the wizard shows, `Object.keys(localStorage).filter(k => k.startsWith('hemoio_'))` is empty, and `folderCopyHash` and `folderBackupNames` are unchanged;
  - a second page in the same context shows the wizard without a reload;
  - the typed word is required;
  - Escape cancels.

  In `e2e/folder-sync-safety.spec.ts`, update the assertion on the "another setup" text.
- [ ] **Step 3: Unit tests:**
  - `AuthContext.test.tsx`: `startOver clears every local store and never touches the folder` (the provider's save, delete and backup methods are not called); `startOver returns to setup`.
  - `storedRows.test.ts`: `clearLocalHemoIOStorage removes only hemoio_ keys and the handle store`.
  - `StartOver.test.tsx`: `start over needs the typed confirmation word`; `focuses Cancel`.
  - `FolderRestoreModal.test.tsx` and `useFolderSyncNotice.test.ts`: `the another-setup message points to Start over`.
- [ ] **Step 4: Run, implement, run.** Expected: FAIL, then PASS.
- [ ] **Step 5: Verify.** Run the per-task gate with E2E specs `e2e/start-over.spec.ts e2e/folder-sync-safety.spec.ts e2e/restore-from-folder.spec.ts e2e/setup-from-folder.spec.ts`.
- [ ] **Step 6: Commit** `feat(settings): start over, keeping the folder copy`.

### Task 10: Full gate and architecture notes

**Files:**
- Modify: `docs/ARCHITECTURE.md`. Update these sections:
  - Security Architecture: the folder envelope, the lock as additional data, `changedAt`, "later lock wins";
  - the data model: the `setAside` table and Dexie v8;
  - folder sync: revisions, the encrypted sync state, conflicts, `hemoio-backups/` with 10 kept, Web Locks for setup and sync;
  - the unlock sweep.
- Any files the reviews change.

- [ ] **Step 1:** `npm run build` and `npm run lint`. Expected: no errors.
- [ ] **Step 2:** `npx vitest run --maxWorkers=4`. Expected: all pass, with no warnings or errors in the output that tests did not assert on.
- [ ] **Step 3:** `npx playwright test --workers=2` on all four projects. Expected: all pass, and folder specs are skipped on Firefox only.
- [ ] **Step 4:** Run the `simplify` skill on the branch diff and fix every finding. Then run the `code-review` skill and fix every finding. Then run the `security-review` skill and fix every finding. It must check in particular that nothing logs keys, salts, passwords or health data, that the folder holds no plaintext count, and that an edited lock is never adopted. Re-run Steps 1–3 after the fixes.
- [ ] **Step 5:** Update `docs/ARCHITECTURE.md` as listed.
- [ ] **Step 6: Commit** `docs(architecture): data safety and folder recovery`, plus `fix(...)` commits for any review fixes, made as they land.
