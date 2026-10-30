# Show save errors — design

## Problem

A user's imports never reached IndexedDB, yet the tab showed them; after a
lock and unlock they were gone. Whatever broke the storage, the app must
never let a write that did not commit look saved.

Gaps found in the write paths:

- **Import**: the lab result and its values were written in two
  transactions, so a failure in between left a result without values. A
  failed file was reported as "Import Partially Complete" (yellow), the app
  learned aliases from it and went to the timeline. The Save button gave no
  sign of saving and could be pressed twice.
- **Notes**: a failed create, edit or delete rejected into nothing: no
  message, the editor just stayed open.
- **Delete lab result**: values and result were deleted in two transactions.
- **Theme, date format, AI provider and model**: failures were only logged;
  the new value stayed on screen and "Settings saved" showed before the
  write even started.
- **Learned names**: removal rolled back but told the user nothing.
- **All writes**: a write that never settles (the database waiting to open,
  blocked by another tab) hung forever; raw error text reached
  notifications and the console.

Preferences (units, targets), alert acknowledgements and restore already
rolled back or were atomic; they get the shared error messages.

## Design

### One write path in the data layer

`EncryptedDb` sends every write through one private `write(tables, fn)`:

- one `rw` Dexie transaction, so a write is all or nothing. Dexie resolves
  only on the transaction's `complete` event: an abort at commit time
  (quota is often reported there) rejects.
- a deadline (`WRITE_TIMEOUT_MS`, 30 s; injectable for tests). When it
  passes before the transaction started, the transaction is cancelled (its
  body throws on entry, so a late start writes nothing) and the write
  rejects. When it passes during the transaction, the transaction is
  aborted; if it is already committing (abort throws), the write waits for
  the real outcome instead. So the reported result is always true: a
  rejected write never commits later.
- every failure becomes a `SaveError` with a `kind` — `quota`, `closed`,
  `timeout` or `failed` — read from the error's name and Dexie's inner
  errors. Its message is fixed text per kind and never includes the
  underlying error, which can quote keys or values.

Import gets `addLabResultsWithValues` (every file of an import in one
transaction) and `deleteLabResult` deletes values and result in one.

### Memory follows the database

Two strategies, by kind of data:

- **Lab results and notes: reload from the database.** Views show only what
  was read back; after a write commits they re-read. A failed write changes
  nothing in memory, which matches the database because the transaction
  rolled back. Reloading (rather than inserting into state) means the
  screen is exactly what a later unlock will show.
- **Preferences, acknowledgements, theme, date format, AI settings: roll
  back.** These show at once (a unit switch must not wait on storage) and
  a failed write puts the stored value back (not the one shown before it,
  which may not have been saved either), unless a newer change already
  replaced it. A failed theme keeps the colors in use before it. A reload
  instead would throw away other changes still in flight, and needs a read
  from a database that just failed.
- **A failure is never unseen.** A note editor or dialog shows its own
  failure while open; one that fails after it was closed is notified, so
  closing is never held up by a save.

### Import is all or nothing

All files of an import are saved in one transaction. A partial import
would be worse than none: retrying it would duplicate the files that did
save. On failure the wizard stays on Confirm with everything reviewed, so
the user can retry; nothing is learned and the app stays put. Save shows a
loading state and cannot be pressed twice, and the steps and the sidebar
cannot be used until the import is saved (names are learned, and the folder
synced, after). Locking stays possible: it is a security control.

### Messages

Each failure says what was not saved and why, in plain language and
without any health data (no lab names, biomarkers, values, notes or file
names); e.g. "Import not saved — There is no room left in this browser's
storage…". Failed saves are not logged: the user is told, and an error can quote stored data.

## Testing

- Gherkin `features/save-errors.feature`.
- E2E `e2e/save-errors.spec.ts` breaks storage in the page: writes that
  throw `QuotaExceededError`, and write transactions aborted after their
  requests succeeded (the original bug: a write that never commits). Each
  checks the error, that the screen did not keep the change, and after a
  lock and unlock that the database agrees.
- Unit tests: `SaveError` classification, `EncryptedDb.write` (abort at
  commit, quota, closed database, deadline before and during a
  transaction), import persistence, and each context/component path.
