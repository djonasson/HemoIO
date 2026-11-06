# Data safety and folder recovery

Date: 2026-11-06. Status: design, for review.

## Why

HemoIO may hold someone's only record of years of lab results. Two gaps
can lose that data today:

1. **The folder copy can't be opened after the browser forgets HemoIO.**
   The data key is stored, wrapped by the password, only in the browser's
   localStorage. After the browser's data is wiped, or on another computer
   that sees the same synced folder, setup makes a new key, so the folder
   copy can't be opened even with the right password.
2. **Records the current key can't read are skipped without a word**, and
   later steps can destroy them or let a fuller copy be overwritten. An
   investigation on 2026-11-06 (main 5d948ca) reproduced eleven problems,
   listed under "Unreadable records" below.

**Success:** with the folder and the password, the user always gets their
data back, on this browser after a wipe or on another computer. No step
deletes or overwrites data the user hasn't been told about.

## Goals

### Folder recovery (user's decisions)

- **Both situations:** restore after this browser's data was wiped, and
  set HemoIO up on another computer or browser that sees the same synced
  folder (Dropbox, OneDrive…).
- **First run:** setup offers "I already have a folder copy". The user
  picks the folder and enters the password they used. HemoIO unlocks the
  copy and restores it. The password stays the same.
- **Key beside the copy:** the folder holds the wrapped data key with its
  KEK salt, iterations and wrap IV (today's `StoredCredentialsV2`). They
  are useless without the password, so the copy is as safe as now. A
  password change updates them in the folder too. Where exactly they live
  (inside the copy's envelope, or a file beside it) is the builder's call,
  provided a copy and its key can never get out of step.
- **Password change on another computer (user's decision):** the folder
  holds the current password lock. A computer with an older lock picks up
  the change at its next sync and keeps working. It asks for the new
  password the next time it unlocks. If both computers change the
  password, the later change wins.
- **Two computers keep syncing to the same folder, safely:** a computer
  never writes over a folder copy newer than the one it last read or wrote.
- **Newer folder copy, no local changes (user's decision):** this is
  checked at unlock and during the session. HemoIO loads the newer copy
  and shows a short notice ("Updated from the folder: saved on <date>").
- **Conflict: ask, never lose either.** When the folder copy is newer
  than what this computer last read and this computer also has changes,
  HemoIO shows both sides (counts and save dates, never health values)
  and lets the user load the folder copy or keep this computer's data.
  The side not chosen is saved as a dated backup file in the folder,
  sealed under the same key.
- **Conflict backups can be restored (user's decision):** Settings lists
  the dated backups and can restore one, with the usual confirmation.
  HemoIO keeps the 10 newest and deletes older ones.
- **Data still in the browser becomes readable again (Claude's call,
  following "ask, never lose either"):** after only localStorage was lost,
  recovering the key from the folder can make the browser's own records
  readable again. If they differ from the folder copy, HemoIO shows the
  conflict choice instead of replacing them.
- **Start over (user's decision, 2026-11-06):** Settings gets a "Start over" action. After an offer to export first and a strong confirmation, it deletes this browser's HemoIO data (never the folder) and returns to first run.
- **Joining a folder from Settings is out of scope (user's decision):** a
  computer already set up with its own key that picks a folder made with
  another key gets a clear explanation. That folder belongs to another
  setup, and the way to join it is to start over from the folder copy at
  first run.

### Unreadable records (user's decision: keep them aside, tell me)

- Records the session key can't decrypt are **moved aside, never deleted
  on their own**. A banner says how many there are, with no health data.
  The user can download them as a sealed file or delete them explicitly.
  Whenever HemoIO gets another key, such as one recovered from a folder,
  it tries the set-aside records again and returns those that now open
  (Claude's call). The download is an inert sealed archive, not imported
  back.
- Each problem found by the investigation is fixed:
  1. **Setup in two tabs makes two data keys** and orphans one tab's
     records. Setup re-reads the stored credentials just before saving and
     unlocks instead when they exist, serialised across tabs (Web Locks);
     other tabs leave setup when credentials appear (`storage` event).
  2. **Setup goes ahead over existing data** when only the credentials
     were lost. Setup checks for stored data first and says so. With a
     folder copy, it offers recovery (above). Without one, it offers to
     keep the unreadable data aside or clear it explicitly.
  3. **A sync that skipped records can overwrite a fuller folder copy.**
     A sync with any unreadable records protects the folder copy, as an
     empty or unreadable one is protected today, and tells the user.
  4. **A backup export silently leaves skipped records out.** The export
     says so and asks for confirmation.
  5. **A restore clears unreadable rows unannounced.** They are moved
     aside, not cleared, and the confirmation says how many there are.
  6. **A preferences save replaces unreadable preferences.** The old row
     is moved aside first, and the user is told once.
  7. **The skip is only in the console.** The banner above.
  8. **"Has data" counts unreadable rows**, so the folder restore offer is
     hidden. Readable and unreadable records are counted apart.
  9. **Results and notes with an invalid date vanish, and the next
     restore deletes them with their values.** Backup parsing rejects or
     repairs bad dates, and exports keep every record. Only views filter.
  10. **The setup wizard can be submitted twice.** It gets a ref guard, as
      ChangePassword has.
  11. **An API key that can't be decrypted is kept as if it were
      plaintext.** It becomes unset instead.

## Non-goals

- Recovering a forgotten password. That stays impossible by design.
- Merging two computers' changes record by record (user chose ask over
  merge).
- Syncing through anything but the folder (no server, no cloud API).
- Migrating old data or folder copies made before this change (no
  backwards compatibility in development). An old copy without a key
  beside it can still be restored by a browser that has its credentials,
  as now.

## Anti-goals

- Anything readable without the password in the folder: no plaintext
  key, no plaintext record counts, no health data in file names.
- Deleting or overwriting user data without saying so first.
- Logging keys, salts, passwords or health data, including in errors.

## Constraints

- Follow CLAUDE.md:
  - Gherkin first, then E2E and unit tests;
  - the layer rules;
  - EAA/WCAG AA for every new dialog and banner;
  - Web Crypto only;
  - keys only in memory during a session.
- All quality gates pass before the branch closes: build, lint,
  noise-free vitest, full Playwright on all four projects, and the
  simplify, code-review and security-review skills.
- Folder storage uses the File System Access API (Chromium only, as now).
- Never run prettier. Never commit `test-data/`.
- The investigation report (file:line references for every problem) is at
  `/tmp/claude-1000/-home-daniel-projects-react-hemoio/1d40f854-f49b-46ff-900e-9e92d270355a/scratchpad/skipped-records/report.md`.

## Left to the builder

- Where the wrapped key lives in the folder, and how a copy and its key
  are written so they never disagree.
- How "newer than what this computer last read" is tracked (save time,
  a counter, or a hash of the last copy read).
- The storage shape of records moved aside, and the sealed download's
  format.
- Banner and dialog wording, within the current look.
- Splitting the work into tasks and branches.
