# Folder Sync Never Writes Empty — Design

**Date:** 2026-10-30
**Branch:** `fix/sync-never-empty`

## Problem

The browser's IndexedDB became empty. On the next unlock the folder sync wrote
the current (empty) state over `hemoio-data.encrypted`, destroying the user's
only good copy. `useFilesystemSync` encrypts `db.exportAllData()` and saves it
blindly, on unlock, every 30 seconds and after an import or restore.

## Goals

1. Sync never replaces a folder copy that holds health data with one that has none.
2. Before any overwrite, the replaced bytes are kept next to it, so one bad
   write can be undone.
3. When the guard stops a write, the user is told in plain language.
4. Nothing about the folder copy's content leaks: no plaintext markers, no logs.

Non-goals (parallel branch `feature/restore-from-folder`): offering to restore
from the folder copy. This branch only guards the write side and names the
previous file so that branch can read it.

## How "has data" is told without exposing anything

The folder copy is AES-GCM encrypted with the session key. Rather than adding a
plaintext record count (which would leak how many results a person has), the
sync **decrypts the existing folder copy in memory** with the session key and
looks at it:

- *Has health data* = at least one lab result, test value or note. Settings and
  preferences alone do not count: a fresh setup has them too.
- The decrypted content is only compared and counted, never logged or kept.

| Folder copy          | Browser has health data | Outcome                         |
|----------------------|-------------------------|---------------------------------|
| none / empty file    | any                     | write                           |
| same content         | any                     | `unchanged` — no write          |
| readable, has data   | no                      | `protected` (reason `empty`)    |
| readable, no data    | any                     | write                           |
| readable, has data   | yes                     | write                           |
| written by a newer version | any               | `protected` (reason `newer`)    |
| cannot be decrypted, or not a sync file | any  | `protected` (reason `unreadable`) |

A copy the session key cannot open was saved with another password (or is
damaged). Replacing it could destroy data the user can still open elsewhere, so
it is never replaced; the user is told to choose another folder.

"Same content" compares the serialised `data` section (not `exportedAt`), so a
periodic sync with no changes does not write — and, importantly, does not rotate
the good copy out of the previous-file slot.

## Previous file

`FileSystemStorageProvider.save(data, previous?)` writes `previous` (the bytes
of the copy being replaced, unchanged) to `FOLDER_PREVIOUS_FILE_NAME`
(`hemoio-data.previous.encrypted`) before it replaces `FOLDER_DATA_FILE_NAME`
(`hemoio-data.encrypted`). If keeping the previous copy fails, the main file is
not touched. `loadCurrent()` and `loadPrevious()` return the bytes or `null`.
Both files have the same format and encryption: an encrypted JSON
`{ version, exportedAt, data }`. The constants are exported from
`src/data/storage/FileSystemStorageProvider.ts` and documented there.

The sync decides what is kept, because only it can read the copies: the
replaced copy becomes the previous copy only if it holds health records and at
least half as many (lab results + test values + notes) as the previous copy
already there. So a browser that lost its data and then gains a result or two
cannot push the full history out of the folder with its second write, while a
cleanup that keeps at least half of the records still lets it move on. A
previous copy that cannot be read is no copy to undo to and is replaced; one
written by a newer HemoIO is kept.

One level of history is kept: enough to undo a bad write, without filling a
synced folder with copies of health data.

## Layers

- **Data** — `FileSystemStorageProvider.save()` keeps the previous file. No
  decisions about content.
- **Service** — `src/services/sync/folderSync.ts`: `writeFolderCopy(store, data, key)`
  decides `written | unchanged | protected` (with a reason) and encrypts.
- **Application** — `useFilesystemSync` calls the service and exposes
  `protection` (React state: `null` or the reason).
- **Application** also creates the provider afresh for each sync, so a folder
  just chosen in Settings is the one written, and runs syncs one after another
  (any number asked for during a sync share one more run). A waiting sync
  reads the session when it starts, so after locking it finds no key. Whether
  folder storage is on is checked at each sync, so switching it on in Settings
  takes effect within 30 seconds. `syncNow` rejects when a sync fails, so a
  restore lists it among its failed steps and an import says so.
- **UI** — `AppShell` shows one persistent notification while sync is held back
  (not repeated every 30 s), and hides it once a sync writes again.

## Messages

- *empty*: "Folder sync skipped. This browser has no lab results right now, but
  your folder copy does. HemoIO left your folder copy as it is. Syncing starts
  again once you add or restore results."
- *unreadable*: "Folder sync skipped. The copy in your folder cannot be read: it
  was saved by a different HemoIO setup, or it is damaged. HemoIO left it as it is.
  To keep syncing, choose a different folder in Settings > Data."
- *newer*: "Folder sync skipped. The copy in your folder was saved by a newer
  version of HemoIO, so this version left it as it is. Reload HemoIO to update
  it and keep syncing." (Unit-tested only: E2E cannot seal a file with the
  session key.)

## Decisions

- Deleting every result on purpose also holds sync back; the folder keeps the
  last copy with data. Safer than the reverse; sync resumes when data returns.
- A partial drop (100 results → 1) is written; the previous file keeps the
  larger copy until the data is back to at least half of it.
- Not done here: asking the browser to keep its storage
  (`navigator.storage.persist()`), the likeliest root cause of an emptied
  IndexedDB. It belongs with the restore work and shows a prompt in Firefox.
- No migration: the previous file simply appears with the next write.
