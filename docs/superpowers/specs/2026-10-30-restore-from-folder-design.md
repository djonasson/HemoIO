# Restore From the Folder Copy — Design

**Date:** 2026-10-30
**Branch:** `feature/restore-from-folder`

## Problem

A user lost their data: the browser's database became empty while a good copy
sat in the synced folder (`hemoio-data.encrypted`). HemoIO only ever writes that
file, never reads it, so the good copy could not help. Worse, on unlock the sync
writes the (empty) browser state straight over it.

## Goal

When the browser has no lab data but the folder copy has some, HemoIO offers to
restore it, and writes nothing to the folder until the user has decided.

### Non-goals

- Refusing to write an empty state over a folder copy, and keeping a previous
  file: that is `fix/sync-never-empty`. This branch reads only the main file.
- Merging a folder copy into a browser that already has data.
- Recovering a copy whose data key is gone (see Risks).

## Design

### When the check runs

`useFolderRestore` (application layer) runs once per session, when the app is
unlocked with folder storage on and folder access granted, and again whenever
folder access changes (access granted after a reload, a folder chosen in
Settings). Until it has an answer, folder sync is **held**: `useFilesystemSync`
takes `{ enabled }` and does nothing, neither the first sync nor the interval,
while it is false.

Without folder access (permission still `prompt`, or no folder remembered)
nothing can be written anyway; the check waits for the access-changed signal.
`StorageSettings` sends it (a window event, `notifyFolderAccessChanged`) after
access is granted, a folder is chosen, or storage is switched to a folder.

### What the check decides (`assessFolderCopy`, service layer)

1. The browser has lab data (any lab result, test value or note row) → **sync**
   as before. Counting rows needs no decryption.
2. No folder file → **sync** (nothing to lose).
3. Read the file, decrypt it with the session key (the data key, so a changed
   app password still opens it), parse it:
   - readable with lab results or notes → **offer** a restore;
   - readable but empty → **sync**;
   - AES-GCM fails → **unreadable: `cannot-decrypt`** (another password, an
     earlier setup, or damage: AES-GCM cannot tell these apart);
   - not a HemoIO folder copy → **unreadable: `not-a-copy`**;
   - newer format version → **unreadable: `newer-version`**;
   - reading the file fails → **unreadable: `read-failed`**.

The folder file format (envelope `{ version, exportedAt, data }`) moves into
`src/services/sync/folderCopy.ts` with the reader, so writer and reader share
one version constant. Parsed data is turned into `ParsedBackupData` through the
same deserialization as a backup restore (`parseBackupData`).

### The dialog (`FolderRestoreModal`)

- **Offer:** "Restore your data from the folder?" with the folder name, when the
  copy was saved, and how many lab results, test values and notes it holds.
  Buttons: *Restore* (primary), *Not now*, *Replace folder copy…*.
- **Unreadable:** "The folder copy can't be read", with a message per reason,
  saying the file has not been changed. Buttons: *Not now*,
  *Replace folder copy…*.
- *Replace folder copy…* asks again, in the dialog, before allowing sync.
- *Not now* (and Escape) keeps sync held for the rest of the session; HemoIO
  asks again at the next unlock or when folder access changes.
- *Restore* runs the existing restore path (`handleRestore` in `AppShell`,
  without AI settings: the folder copy has none) and only then allows sync, so
  the first write after a restore carries the restored data. A failed restore
  keeps the dialog open with the error; nothing is written.

### Security

Only the session key decrypts; nothing is logged with the error or content of
the file. The dialog shows counts and a date only.

## How it combines with `fix/sync-never-empty`

That branch changes what a sync write does (no empty overwrite, keep a previous
file). This branch only decides *whether* a sync may start (`enabled`) and adds
a read path. The overlap in `useFilesystemSync` is the `enabled` guard and the
version constant import.

## Risks

- The data key is wrapped by credentials in localStorage, not in the folder. If
  the whole browser profile is wiped, a new setup has a new key and the folder
  copy reports `cannot-decrypt` even with the same password. Storing the
  wrapped key next to the folder copy would fix that; out of scope here.
