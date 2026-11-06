# HemoIO Architecture

This document outlines the architectural decisions and technical design for HemoIO.

## Overview

HemoIO is a client-side Single Page Application (SPA) that runs entirely in the user's browser. There is no server component; all data processing, storage, and API communication happens on the client side.

### Key Architectural Principles

- **Client-only**: No backend server; the application is a static site
- **Local-first**: Data is stored locally by default, with optional cloud storage
- **User-controlled**: Users provide their own API keys and choose their storage location
- **Privacy by design**: All data is encrypted; we never have access to user data
- **Offline-capable**: Core features work offline; AI-powered parsing requires internet

## Technology Stack

### Core

| Category         | Technology    | Purpose                               |
|------------------|---------------|---------------------------------------|
| Language         | TypeScript    | Type safety and developer experience  |
| UI Framework     | React         | Component-based UI                    |
| Build Tool       | Vite          | Fast development and optimized builds |
| State Management | React Context | Application state                     |

### UI & Visualization

| Category          | Technology     | Purpose                                |
|-------------------|----------------|----------------------------------------|
| Component Library | Mantine        | Accessible, feature-rich UI components |
| Table Management  | TanStack Table | Complex table functionality            |
| Charts            | Recharts       | Trend visualization and graphs         |
| Icons             | (TBD)          | UI iconography                         |

### Document Processing

| Category            | Technology   | Purpose                                                                   |
|---------------------|--------------|---------------------------------------------------------------------------|
| PDF Text Extraction | PDF.js       | Extract text from text-based PDFs (client-side)                           |
| OCR                 | Tesseract.js | Optical character recognition for images/scanned PDFs (client-side, WASM) |

### Data & Storage

| Category   | Technology     | Purpose                               |
|------------|----------------|---------------------------------------|
| Database   | Dexie.js       | IndexedDB wrapper for structured data |
| Encryption | Web Crypto API | Client-side encryption                |

### Testing

| Category   | Technology           | Purpose                                     |
|------------|----------------------|---------------------------------------------|
| Unit Tests | Vitest               | Fast unit and integration testing           |
| E2E Tests  | Playwright           | Browser automation testing                  |
| BDD        | Gherkin + Playwright | Feature specifications and acceptance tests |

### Build Tools

| Category | Technology      | Purpose                            |
|----------|-----------------|------------------------------------|
| Bundler  | Vite            | Production builds                  |
| PWA      | vite-plugin-pwa | Offline support and installability |

## Application Architecture

The application follows a layered architecture:

```text
┌─────────────────────────────────────────────────────────┐
│                     UI Layer                            │
│              (React + Mantine + Recharts)               │
├─────────────────────────────────────────────────────────┤
│                  Application Layer                      │
│         (React Context, Business Logic, Hooks)          │
├─────────────────────────────────────────────────────────┤
│                   Service Layer                         │
│   (Document Analysis, Test Identification, Units)       │
├─────────────────────────────────────────────────────────┤
│                    Data Layer                           │
│        (Dexie.js, Storage Providers, Encryption)        │
├─────────────────────────────────────────────────────────┤
│                 Integration Layer                       │
│          (AI Provider APIs, Cloud Storage APIs)         │
└─────────────────────────────────────────────────────────┘
```

### UI Layer

React components organized by feature. Responsible for:

- Rendering the user interface
- Handling user interactions
- Displaying data from the application layer

Uses Mantine for base components, TanStack Table for data tables, and Recharts for trend visualizations.

### Application Layer

Business logic and application state. Responsible for:

- State management via React Context
- Coordinating between UI and services
- Custom hooks for reusable logic
- Validation and business rules

### Service Layer

Domain-specific services. Responsible for:

- Document analysis orchestration
- Identifying each value's LOINC test (see Biomarker Identification)
- Data import/export operations
- Unit reading and conversion (UCUM)
- Trend lines, statistics and alerts over LOINC trend codes

### Data Layer

Data persistence and retrieval. Responsible for:

- Database operations (Dexie.js)
- Encryption/decryption of data
- Storage provider abstraction
- The LOINC catalog and HemoIO's add-ons to it (`src/data/loinc/`)

### Integration Layer

External service communication. Responsible for:

- AI provider API calls (document analysis)
- Cloud storage provider APIs
- Abstracting provider differences behind common interfaces

## Data Model

Tests are identified by LOINC codes. HemoIO keeps no test table of its own:
the tests come from the shipped LOINC catalog (see LOINC Catalog), and
everything the user stores per test is keyed by a code.

```text
┌──────────────┐     ┌────────────────────┐     ┌────────────────────┐
│   LabResult  │────<│     TestValue      │>────│  CatalogTest       │
│              │     │                    │     │  (shipped, read-   │
│ - date       │     │ - biomarkerKey     │     │   only LOINC data) │
│ - labName    │     │   (LOINC code, or  │     │ - code, long name  │
│ - notes      │     │   unknown:<name>)  │     │ - component, prop, │
└──────────────┘     │ - value, unit      │     │   system, method   │
                     │ - refRangeLo/Hi    │     │ - names, units     │
                     │ - rawText (printed │     │ - rank, groups     │
                     │   name)            │     └─────────┬──────────┘
                     └────────────────────┘               │ 0..1
                                                ┌─────────┴──────────┐
┌────────────────────┐   ┌──────────────┐       │  TestAddon         │
│  UserPreferences   │   │   UserNote   │       │  (addons.ts)       │
│                    │   │              │       │ - short name       │
│ - unitPreferences  │   │ - content    │       │ - description      │
│ - personalTargets  │   │ - biomarker- │       │ - standard range   │
│ - acknowledged-    │   │   Key (trend │       │ - units offered    │
│   Alerts           │   │   code)      │       └────────────────────┘
│   (by test key)    │   │ - labResult/ │
│ - learnedTests     │   │   testValue  │       ┌──────────────┐
│   (wording|unit →  │   └──────────────┘       │   Settings   │
│    code)           │                          │ - storage,   │
│ - theme, dateFormat│                          │   AI config  │
└────────────────────┘                          └──────────────┘
```

### Key Entities

- **LabResult**: A single lab report/visit (date, lab name, notes)
- **TestValue**: One measurement. `biomarkerKey` holds the test's LOINC code
  ("2345-7"), or `unknown:<name key>` for a value the user saved as "not a
  LOINC test", which is then trended by its printed name and unit only.
- **CatalogTest**: A LOINC test of the shipped catalog. Never stored in the
  database: a value refers to it by code.
- **TestAddon**: What HemoIO adds to LOINC for the tests it describes: a
  short name, a description, a standard adult range and the units it offers.
  A code without an add-on uses that of a code it trends with, else shows its
  LOINC name and the range printed on the report.
- **UserPreferences**: Preferred units, personal targets and acknowledged
  alerts, each keyed by **test key** (the test's LOINC trend group); the tests the user taught
  (`learnedTests`: a lab's wording and UCUM unit → the code chosen); theme
  and date format.
- **UserNote**: A note on a lab result, a value, or a test (by trend code).
- **Settings**: Device configuration (storage provider, AI provider and key).
- **SetAsideRow**: A stored row the session key cannot open, kept aside
  rather than deleted: the table it came from, the row exactly as stored
  (readable IDs and links, ciphertext), and whether the user has saved it
  to a file (`savedToFile`). See Unreadable Records.

### Trend Codes

Several LOINC codes can be one test to the user: glucose in mg/dL (2345-7)
and in mmol/L (14749-6), a day's creatinine in g and in mmol, a
protein/creatinine ratio in mg/g and in mg/mmol, or a test's blood, serum
and plasma codes when LOINC groups them. `Catalog.trendGroup` joins them,
from LOINC's group files: a parent group that joins mass and substance
concentrations, the groups of a rate's or a ratio's mass and molar forms
(same component and sample), else a group of a test in any of blood, serum
or plasma. `testKey` (`display.ts`) is that group: unit preferences,
personal targets and acknowledged alerts are kept under it, so they stay
when HemoIO's add-ons or LOINC's ranks change. `trendCode` names a group by
the member HemoIO describes, else its most common code, a code of blood in
general before an arterial or venous one; trend lines, notes, the Biomarkers
page and the CSV export show a test under it, and `testName` names it. Each
value still converts through its own code, so a value whose unit cannot be
converted gets a line of its own instead of being dropped; a link into
Trends names the value, so Trends opens the line that value is on.

## Storage Architecture

### Dexie.js Database

All user data is stored in IndexedDB via Dexie.js:

```typescript
// Current schema: only IDs and links are indexed, the rest is encrypted
const db = new Dexie('HemoIO');
db.version(8).stores({
  labResults: '++id',
  testValues: '++id, labResultId',
  userPreferences: '++id',
  settings: '++id',
  userNotes: '++id, labResultId, testValueId',
  setAside: '++id',
});
```

Version 7 moved tests onto LOINC codes. There is no migration: the upgrade
clears lab results, values, notes and preferences and keeps the settings,
and backups made before it are refused with a message saying why.

Version 8 adds the `setAside` table, where rows the session key cannot open
are kept (see Unreadable Records). It has no upgrade function: nothing is
migrated.

### Unreadable Records

A row the session key cannot decrypt was sealed under another data key (a
second setup in another tab, or leftovers of an earlier setup whose
credentials were lost), or is damaged. HemoIO never deletes such a row on
its own, and never lets it be lost by a later step:

- **The unlock sweep.** Every unlock, setup and recovery runs
  `settleUnreadable` before the app reads anything. It decrypts every row
  outside any transaction, in a read-only pass; only when a row is to move
  does it open one write transaction, which moves a row into `setAside` only
  if its ciphertext is still the one that was tried, and then returns the
  set-aside rows that the key now opens (a key recovered from a folder can
  make old rows readable again). IDs are kept unless taken meanwhile. A
  failed sweep is logged with a fixed message and does not stop the unlock;
  the next unlock tries again.
- **Writes that meet unreadable rows.** A restore moves unreadable lab rows
  aside instead of clearing them, and a preferences save moves unreadable
  preferences aside first (the user is told once a session). A row written
  since the sweep by another tab under another key is skipped on read, with
  a fixed-text warning.
- **The banner.** It says how many records cannot be opened, never what
  they hold, and offers two ways to settle them: a sealed file (the rows
  exactly as stored, still encrypted; a restore refuses it), saved through
  the save picker where the browser has one, or a delete the user confirms,
  which deletes only the rows the confirmation counted. A row counts as
  saved only once the picker wrote the file, or once the user says a plain
  download saved.
- **Exports and restores say so.** A backup export that leaves set-aside
  records out asks first; a restore confirmation says how many are kept
  aside and will not be deleted.
- **Folder sync waits.** While any set-aside row is unsaved, the folder copy
  may be the only place that still holds those records: sync neither writes
  over it nor loads a newer copy over this browser's data, and says it is
  paused.

Counting stored data ("does this browser hold HemoIO data?") counts readable
and unreadable rows apart, so the setup wizard can tell a fresh browser
from one that lost only its credentials. In that case setup first offers to
keep the stored data aside and set up anew, to clear it, or to set up from
a folder copy.

### Encryption

Data is encrypted at rest using the Web Crypto API:

- A random data key (DEK) encrypts everything. It is stored wrapped by a
  key derived from the password (the KEK, PBKDF2 with 600,000 iterations):
  the "lock" (`StoredCredentialsV2`: KEK salt, iterations, wrap IV, wrapped
  key, and `changedAt`). A password change re-wraps the same DEK; no data
  is re-encrypted. Credentials of the earlier format (v1, where the key was
  derived from the password directly) are converted to a lock at unlock,
  wrapping the same key.
- AES-GCM for symmetric encryption
- Encryption happens at the data layer before storage
- Decryption requires authentication each session
- Lab data is stored sealed: each lab result, test value, note and the
  preferences record keeps only its ID and the IDs it links to readable
  (which the indexes need); every other field is one AES-GCM encrypted JSON
  blob. The stored data does not show which tests were done, when, or with
  what results. Dates and biomarker keys are therefore not indexed: lookups
  and sorting by them happen on decrypted records.
- Settings are device configuration: only the AI API key is encrypted.

### Storage Provider Abstraction

A common interface abstracts storage location:

```typescript
interface StorageProvider {
  save(data: EncryptedBlob): Promise<void>;
  load(): Promise<EncryptedBlob>;
  exists(): Promise<boolean>;
}

// Implementations
class LocalStorageProvider implements StorageProvider { ... }
class DropboxStorageProvider implements StorageProvider { ... }
class GoogleDriveStorageProvider implements StorageProvider { ... }
```

Initial release supports local storage. Cloud providers can be added without changing core logic.

### Folder Sync

With folder storage on (File System Access API, Chromium only), the
database is copied to a folder the user chose, which a sync service such as
Dropbox or OneDrive may share with their other computers. The folder holds:

- `hemoio-data.encrypted`: the folder copy, the only sealed file that
  carries the lock;
- `hemoio-lock.json`: the current lock again, as plain JSON
  `{ format: "hemoio-folder-lock", version: 1, lock }`, so a password can
  still unwrap the DEK when the copy is missing or its header is damaged;
- `hemoio-data.previous.encrypted`: the copy a write replaced, to undo a
  bad write from. A replaced copy becomes the previous copy only when it
  holds at least half the records of the one already there, so a browser
  that lost its data cannot push the full history out in two writes;
- `hemoio-backups/`: dated backups (below).

**The envelope.** A folder copy is JSON `{ format: "hemoio-folder-copy",
version: 1, lock, sealed }`. Only the format, its version and the lock are
plaintext: with them, and the password, a browser that lost its credentials
or another computer can open the copy. `sealed` is the AES-GCM ciphertext
of the sync file, sealed under the DEK with the header (in a fixed key
order) as additional data, so a lock edited in the file, or swapped for
another, makes the copy fail to open rather than be adopted. Nothing else
is readable: no record counts, and no health data in file names. A copy in
the earlier raw format (IV and ciphertext, no lock) is still read by a
browser that has its credentials.

**The sync file** inside is `{ version, exportedAt, revision, ancestors,
data }`. `version` is the backup schema version, so a restore reads a copy
as it reads a backup. `revision` is a new UUID with every write, and
`ancestors` lists the revisions the copy was built on, newest first (the
copy it replaced, then that copy's ancestors), up to 200.

**Only the current lock is kept.** The previous copy and every dated
backup are sealed with `lock: null`. A password change re-wraps the same
DEK, so an older lock left in an older file would let an old password
unwrap the key that opens the current copy too. The lock file holds the
same lock as the copy: a sync writes it, when it differs, before every
copy that carries a lock (setup, a password change), and brings it up to
date when it leaves the copy unchanged (a lock adopted from another
computer); recovery writes it too. Restoring the previous copy or a backup
from Settings uses the session key, which an unlocked session always has.
The DEK never rotates, so the lock file and the copy cannot disagree on
the key, only on the password.

**A password change on another computer.** A sync writes the later of this
browser's lock and the folder's (by `changedAt`, sealed in the additional
data, so a replayed older envelope never wins). A later lock in the folder
is adopted, and the user is told to use the new password at the next
unlock, but only from a copy whose body opened under the session key: only
a holder of the DEK can have written it. Other tabs pick the adopted lock
up from the `storage` event, keeping their session key.

**The sync state.** Each browser remembers the revision it last read or
wrote and a SHA-256 digest of its own data at that moment
(`hemoio_folder_sync_state` in localStorage, encrypted with the session
key, so nothing about the folder can be read there without the password).
The digest is over a canonical, ID-free form of the lab data and
preferences; the settings belong to each computer and are left out.

**Each sync** runs at unlock, every 30 seconds, after a restore or a
password change, and when the set-aside rows change. It exports the database, decrypts the folder copy
in memory and decides:

- the folder copy is left alone when it cannot be opened (`unreadable`), was
  made by another setup (`another-setup`), by a newer HemoIO (`newer`) or
  before LOINC (`before-loinc`), when this browser holds no health records
  but the copy does (`empty`), or while set-aside rows are unsaved
  (`set-aside`). The user is told why;
- a copy this browser saw last (same revision, or the same data it saw then)
  is written over when this browser changed something, and left as it is
  when nothing changed, unless only the lock must reach the folder;
- a copy written elsewhere since is never written over unseen. It is
  **loaded automatically** only when this browser changed nothing since it
  last saw the folder, the copy descends from that one (`lastSeen.revision`
  is among its `ancestors`), and it takes no health records away. Clocks
  are never trusted: an older copy put back from a cloud drive's history,
  one saved at the same moment elsewhere, or one more than 200 writes ahead
  is asked about instead. Before loading, this browser's data is kept as an
  autobackup, and a failed backup loads nothing. The rows are stamped before
  that backup's export, and the load replaces them only while they are as
  stamped, checked inside the replacing transaction: a change saved at any
  moment meanwhile is kept, nothing is loaded, and the next sync asks;
- otherwise the user **chooses**. The dialog shows both sides as counts and
  dates, never values: load the folder copy (this browser's data is kept as
  a dated backup first), keep this computer's data (the folder copy is kept
  as a dated backup first, and the new copy names both sides as ancestors,
  so the other computer then loads it without asking), or decide later,
  which holds syncs for the session. A choice writes over only the copy the
  user saw; one changed meanwhile asks again.

**Dated backups** (`hemoio-backups/`) come in two kinds, each keeping its
own 10 newest, so routine loads never push out the user's choices:
`hemoio-backup-<time>.encrypted`, the side of a choice not taken, and
`hemoio-autobackup-<time>.encrypted`, this computer's data kept before an
automatic load. Times are UTC to the millisecond. Pruning never deletes the
backup just saved, nor one shown in an open restore confirmation in this
tab. Settings > Data lists both kinds and restores one after a confirmation;
the current folder copy is kept as a dated backup first, once per
confirmation, unless it cannot be opened, in which case it is left as it is.

**Restoring when this browser lost its data.** At unlock, a browser with no
readable data whose folder holds a copy is offered to restore it, with its
counts and date; syncs wait for the answer. "Replace folder copy" keeps the
folder copy as a dated backup before the next sync writes over it.

**One at a time across tabs.** Every sync holds the `hemoio-folder-sync`
Web Lock, and so do the answers to its questions (a conflict choice,
"Replace folder copy", recording a restored copy as seen), which run after
the syncs already asked for: two tabs never sync the folder at once. A load
runs inside the sync that found it and never asks for another sync, which
would wait for it in turn.

## Security Architecture

### Authentication Flow

```text
┌─────────────────────────────────────────────────────────┐
│                    App Startup                          │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  First run? (no db)   │
              └───────────────────────┘
                    │           │
                   Yes          No
                    │           │
                    ▼           ▼
          ┌─────────────┐  ┌─────────────┐
          │ Setup Wizard│  │ Login Screen│
          └─────────────┘  └─────────────┘
                    │           │
                    ▼           ▼
          ┌─────────────────────────────┐
          │  Derive key from password   │
          │  (+ verify 2FA if enabled)  │
          └─────────────────────────────┘
                          │
                          ▼
          ┌─────────────────────────────┐
          │  Decrypt database / Unlock  │
          └─────────────────────────────┘
                          │
                          ▼
          ┌─────────────────────────────┐
          │      Application Ready      │
          └─────────────────────────────┘
```

### Key Management

- The data key is wrapped by a key derived from the password using PBKDF2
  with a high iteration count; a lock asking for more than 6,000,000
  iterations (ten times what setup uses) is rejected everywhere, so a lock
  planted in a folder cannot keep unlocking busy
- Keys exist only in memory during a session
- Optional 2FA adds additional verification (not part of key derivation)
- No key recovery possible without password (by design)
- A password change re-wraps the data key; it never rotates it. A wrapped
  key copied before the change (from a cloud drive's file history, say, or
  an old copy of localStorage) therefore still opens the data with the old
  password. Rotating the key would mean re-encrypting all data, and is out
  of scope. Keeping the lock only in the current folder copy limits the
  folder to one lock going forward.

### Setup, Recovery and Start Over

**Setup in two tabs.** Setup, recovery from a folder, the conversion of v1
credentials and the setup wizard's count or clear of stored data each hold
the `hemoio-setup` Web Lock, and read the stored credentials again under it:
when another tab finished setup first, this tab unlocks with them (or shows
the unlock screen) instead of making a second data key. Other tabs leave
setup when credentials appear (`storage` event). Credentials, once written,
are never taken back by setup: another tab may already have sealed records
under them.

**Recovery from the folder.** At first run, "I already have a folder copy"
asks for the folder and the password used there. The lock is the current
copy's when its header can be read, else the lock file's; it must be a
valid v2 lock and the password must unwrap it. The unwrapped key is then
tried on the current copy, the previous copy, and the dated backups,
newest first: the first body that opens under it, with its header as
additional data, proves the key (AES-GCM authenticates it), and that file
is the one restored. A lock planted in the copy or as the lock file proves
nothing unless a body opens under its key; until one does, nothing is
stored. A current copy that opens but cannot be restored (a newer HemoIO's,
or one from before LOINC) is reported, never passed over for an older one.
Then, under `hemoio-setup`, the lock is saved, folder storage is chosen and
the folder kept, the unlock sweep runs (returning set-aside rows the
recovered key opens), and the file is restored when this browser holds no
readable lab data, its revision marked seen, and the lock file written.
When the file restored was the previous copy or a backup, the current copy
was missing or damaged: the restored data is written as the new copy
(with the lock, built on the restored revision, under
`hemoio-folder-sync`), so syncing goes on, and the user is told which file
was restored and when it was saved. Data still in the browser is left for
the first sync, which asks when it differs from the copy. The password
stays the same.

**Start over** (Settings > Security, after an offer to export and a typed
confirmation) drops the session key at once, so no sync or decryption
starts, then takes `hemoio-setup` and, nested in it, `hemoio-folder-sync`,
waiting for any sync in flight. It empties every table but `setAside` and
removes every `hemoio_` key in localStorage and the stored folder handle.
The set-aside rows stay because a key recovered from a folder copy may
open them: the dialog says how many stay, and after the reload setup's
existing-data step offers recovery from the folder (which returns the rows
that key opens), keeping them aside, or clearing them. The folder and its
files are never touched. The page then reloads, whatever the outcome,
so no state of the old setup (API key caches, AI choices, preferences)
stays in memory. Removing the credentials sends other tabs back to setup,
and a tab that held the old setup, locked or unlocked, reloads too.

**Lock order.** The two Web Locks are only ever nested as `hemoio-setup`
then `hemoio-folder-sync`; a sync never asks for the setup lock, so they
cannot deadlock.

### Sensitive Data Handling

- API keys stored encrypted in settings; one that cannot be decrypted is
  treated as not set
- Decrypted only when needed for API calls
- Never logged or exposed in error messages
- Keys, salts, passwords, locks, revisions and health data are never
  logged: failures that could name stored data log a fixed message, never
  the caught error
- Dialogs and banners about stored data show counts and dates, never values

## Document Analysis Pipeline

### Hybrid Processing Approach

Document analysis uses a hybrid approach: text extraction happens locally in the browser, while intelligent parsing uses AI services. This improves privacy (raw documents stay local), reduces API costs (only text is sent), and enables partial offline functionality.

```text
┌─────────────┐
│   Upload    │
│  Document   │
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│   Detect Type    │
└──────┬───────────┘
       │
       ├─────────────────────────────────────┐
       │ Image / Scanned PDF                 │ Text-based PDF
       ▼                                     ▼
┌──────────────────┐               ┌──────────────────┐
│  Tesseract.js    │               │     PDF.js       │
│  (local OCR)     │               │ (text extraction)│
│                  │               │                  │
│  Runs in browser │               │  Runs in browser │
│  via WebAssembly │               │  No external API │
└──────────┬───────┘               └────────┬─────────┘
           │                                │
           └───────────┬────────────────────┘
                       │
                       ▼ Raw extracted text
           ┌───────────────────────┐
           │   AI Service (API)    │
           │                       │
           │ - Structure analysis  │
           │ - Value extraction    │
           │ - Unit recognition    │
           │ - Confidence scoring  │
           └───────────┬───────────┘
                       │
                       ▼ Structured data
           ┌───────────────────────┐
           │   Review & Verify     │
           │                       │
           │ - User confirmation   │
           │ - Edit/correct values │
           │ - Low confidence flags│
           └───────────┬───────────┘
                       │
                       ▼
           ┌───────────────────────┐
           │     Save to DB        │
           └───────────────────────┘
```

### Local Processing (PDF.js + Tesseract.js)

**PDF.js** handles text-based PDFs:

- Extracts text content and positioning from PDF documents
- Works entirely client-side, no external API needed
- Most digital lab reports (not scanned) are text-based

**Tesseract.js** handles images and scanned documents:

- OCR engine compiled to WebAssembly
- Runs entirely in the browser
- Supports 100+ languages
- Initial load includes language data (~2-3MB for English)

### AI Provider Integration

AI services receive extracted text (not raw documents) and perform intelligent parsing:

- Identify document structure and layout semantics
- Extract each value's printed name, value, unit, reference range and the
  sample the report names for it (its specimen hint)
- Handle varied lab report formats
- Assign confidence scores to extractions
- Choose, for the values the catalog search leaves open, one of the
  candidate LOINC tests it is given, or none

The extraction asks for no codes: the AI never names a LOINC code itself.

```typescript
// src/services/ai/types.ts (abridged)
interface AIProvider {
  analyzeLabReport(text: string, options?: AnalysisOptions): Promise<LabReportAnalysisResult>;
  chooseTests(requests: TestChoiceRequest[], options?: …): Promise<TestChoice[]>;
}

interface ExtractedBiomarker {
  name: string; // as printed
  value: number;
  unit: string;
  referenceRange?: { low?: number; high?: number; unit: string };
  specimenHint?: string; // "urine", "24h urine", "serum", "blood"
  confidence: number; // 0-1
}

interface TestChoiceRequest {
  id: string;
  name: string;
  unit: string;
  specimenHint?: string;
  candidates: TestCandidate[]; // code and LOINC long common name
}

interface TestChoice {
  id: string;
  code: string | null; // one of the candidates, or none
  confident: boolean;
}
```

OpenAI, Anthropic and Ollama implement this interface.

### Biomarker Identification

Each extracted value is filed under a LOINC code from the shipped catalog (`src/data/loinc/`), or saved as "not a LOINC test" under its printed name. The steps run in order, each only for the values the one before left open: learned, local, AI, user. What the user confirms is learned when the import is saved.

- **Learned.** A code the user saved for the same printed name and unit is taken first.
- **Locally** (`src/services/analysis/loincMatch.ts`). The printed name is searched in the catalog's English and Italian names, read with its sample (a prefix such as "S-" or "U-", sample words anywhere in the name such as "urina", "siero" or "sangue", or the AI's specimen hint) and with the LOINC properties its UCUM unit implies. "Blood" is said loosely of serum tests too, so a blood word or hint leaves blood and serum tests both open. A LOINC long common name printed in full is that test. A bracket counts as another name or a qualifier ("Tirotropina (TSH)"); Italian and English word endings count as one word ("proteine", "protein"); a word no name has may be two name words written as one ("Alfafetoproteina"); a name ending in "-uria" is its substance in urine ("Microalbuminuria"); "ematico" and "eritrocitario" are sample words too. A name ending in "-emia" is not cut to its stem, which may be another test's abbreviation ("Ferremia" is not ferritin's "ferr"). A bracket found alone is another name of the test unless the rest of the name fits another test ("Troponina I (hs)" is not troponin T hs), and below a full fit it must be a name of the test the rest names too ("eGFR (CKD-EPI)"), so "C3 attivatore (complemento)" is not complement C3; a part after a spaced dash is only ever such another name ("Creatinchinasi - CK"). A bracket naming no test is a qualifier ("(metodo enzimatico)"), but when the whole name fits a test or panel the bracket words may change the test, so the plain one is not set above the others ("Bilirubina (diretta)" is asked). Besides the name as printed, the matcher searches readings of it and keeps the best fit: with antibody words as LOINC's "Ab" ("Anticorpi anti-", "Ac anti", "Ab anti", "(anticorpi)"; a lab's own abbreviation is learned), with symbol-font stand-ins of Greek letters spelled out ("a1-", "b2-"; Greek letters themselves always are), and with a letter and its two-digit number written apart joined ("B 12"; "Emoglobina A 1", a series' number, is not "A1"). The printed name still competes, so "g-GT", "Anti-Xa" and "Glucosio a 30 min" are read as printed. A variant LOINC names with a challenge or a time ("^post …") is taken only when it fits better than the plain test, so the name must say it. Units are read for their LOINC property: international units per volume are never a ratio, and international units per volume or per time are an enzyme activity only for a test LOINC gives in enzyme units (a renin activity is not read in µIU/mL). There is no alias list: a wording LOINC does not know ("Glicemia", "PCR") goes to the AI or the user, and is learned once chosen. A test HemoIO describes in a unit LOINC files under another property (HbA1c in mmol/mol) is a candidate only when no test of the unit's own property fits. A test is taken without asking when its name fits best by a margin, or when the tests that fit as well differ in what the name does not say: a test and its variants by method or collection time are one fit (variants that each name a method, such as D-dimer FEU and DDU, are not), and among different tests the one HemoIO describes, or one at least ten times more common by LOINC's rank, is the usual meaning. So with no sample said, the serum test is usually taken over the blood one ("Potassio" from a blood gas report too). A value said loosely of blood is never given a serum test when LOINC has a blood test of it, in any unit, that trends apart ("Etanolo ematico" is asked); a blood test is taken for it when it stands out ("Platelet count" with a blood hint). A test HemoIO describes by calculation stands for a name that does not say so only when no measured variant is about as common ("Colesterolo LDL" may be calculated or direct, so it is asked); counts by machine or by hand measure one thing alike. In a count unit, "absolute" only says the count ("Neutrophil, Absolute"). Other values keep up to eight candidates; a name that fits nothing well gets the most common tests of its sample and unit as well. A value without a readable unit is never matched.
- **By the AI.** The undecided values go to the configured AI in one request with their candidates; it picks one, or none. It never invents a code.
- **Review** shows each value's code with its LOINC name, the candidates, and labels for what needs checking. The user may pick another candidate, search the whole catalog, or choose "Not a LOINC test". Values of one test given in two units are merged once they have one (in the analysis, or when the user gives a value the test of another), unless the test's values conflict.
- **Learned on save.** Each value whose test the user chose is remembered under its printed name and UCUM unit (`learnedTests`), so the next report with that wording is matched without asking. Settings lists what was learned and lets the user remove it.
- The tuning runner `scripts/match-reports.ts` (run with `vitest.match-reports.config.ts`) prints, for local reports, each printed name, unit, local status and top candidates, never a value. With `MATCH_ROWS` it reads printed names, units and specimen hints from a JSON file outside the repository instead (such as rows parsed from a lab's public test guide), counts them per group, and with `MATCH_ROWS_OUT` writes each row's result to a file outside the repository.
- **Ollama** is called through its native `/api/chat` with a context size fitted to the prompt (its OpenAI-compatible endpoint cannot set one).

## LOINC Catalog

LOINC (Logical Observation Identifiers Names and Codes) is the code system
for lab tests. HemoIO ships a generated subset of it; the LOINC notice is in
the README and under Settings → About. See `docs/LOINC.md` for downloading a
release.

- **Generated subset.** `npm run loinc:catalog` (`scripts/loinc-catalog.mjs`)
  reads a release in `~/loinc/<version>/files` and writes
  `src/data/loinc/catalog.generated.json` (about 18,000 tests, 13 MB). It
  keeps the active laboratory codes that LOINC ranks as common tests, plus
  the unranked codes HemoIO needs (`EXTRA_CODES`). Each test carries its
  long common name, short name, component, property, system, scale and
  method, class, example UCUM units, common-test rank, LOINC groups, and
  its names: the component, its related names, the short name and the
  abbreviation leading it, and the Italian component. The file is
  committed and deterministic, so building never needs the release. Tests
  of the generator run on fixture rows cut from the release.
- **Fetched, not bundled.** The build emits the file as a hashed JSON
  asset. `loadCatalog` fetches it once the app is unlocked (a failed
  `import()` stays failed in a browser, a failed fetch can be tried again);
  `CatalogProvider` shows a loader, then the app, or an error with "Try
  again". Unit tests import the file instead.
- **Runtime cache.** The service worker caches the file on first use
  (CacheFirst, one entry, as the hashed name changes with its content)
  instead of precaching it, which it is too large for. After one online
  visit the app works offline; before it, offline shows the catalog error.
- **Runtime catalog** (`catalog.ts`). `createCatalog` builds the indexes
  once: tests by code and long name, a word index weighted by rarity, and
  trend groups (see Trend Codes). `search`/`scoredSearch` score names
  (1 for a name equal to the query, up to 0.9 for one sharing its words,
  less for close word forms), ignoring sample and other generic words;
  `common` lists the most common tests of a property and sample.
- **Display** (`display.ts`). A test's name is the add-on's short name,
  else LOINC's short name, else its long name; codes are shown with their
  LOINC long common name. A standard range is only offered in a unit the
  code itself has.

## Units (UCUM)

Units are read and converted with UCUM, through `@lhncbc/ucum-lhc`
(`src/services/units/ucum.ts`); its notice, and that of is-finite which it
ships, are in the README and under Settings → About, with the library's
installed version (`packageVersions.config.ts`).

- **`toUcum`** turns a printed spelling into UCUM ("x10³/µL" → "10*3/uL",
  "mUI/mL" → "m[IU]/mL", "/24h" → "/(24.h)", "mm/1h" → "mm/h", "fl" →
  "fL", "RBC/HPF" → "{RBC}/[HPF]", "‰" → "[ppth]"), or null when UCUM
  rejects it. The library's own console output on rejected units is
  silenced.
- **`ucumProperties`** reads which LOINC properties a unit implies from its
  dimension: mass per volume is MCnc, amount per volume SCnc, a share NFr,
  MFr or VFr, and so on. International units per volume are ACnc and also
  CCnc, as labs print enzyme activity in IU/L. The per-cell properties
  (MCV, MCH, MCHC) are read only from fL, pg and g/dL or g/L. Matching
  searches only tests of these properties.
- **`ucumConversion`** converts what UCUM can: a unit to itself however
  spelled, units of one dimension (g/dL → g/L, cells/µL → 10^9/L), one
  arbitrary unit rescaled (mIU/mL → IU/L), and, given a substance's molar
  mass and charge, mass ↔ moles ↔ equivalents. It never converts between
  shares or ratios of no dimension, nor between different arbitrary units.
  `definitions.ts` holds each LOINC component's molar mass and charge (a
  component with a subpart, "Cholesterol.in LDL", uses its substance's),
  and only the conversions UCUM cannot give: the HbA1c equation, IU/L ↔
  U/L, shares against ratios, approximations for one sample. A test checks
  that no such row is one UCUM converts too. Each value converts through its
  own code's component.

### Offline Capability

With local text extraction:

- **Fully offline**: Viewing data, manual entry, trends, export, once the
  LOINC catalog was loaded online once
- **Partially offline**: Text extraction from documents (PDF.js, Tesseract.js)
- **Requires internet**: AI-powered intelligent parsing of extracted text, and the first download of the OCR files and of the LOINC catalog

Users could potentially extract text offline and queue documents for AI processing when connectivity is restored (future enhancement).

## Testing Strategy

### Unit Tests (Vitest)

- Test business logic in isolation
- Test utility functions (unit conversion, validation)
- Test hooks and context logic
- Mock external dependencies

Location: `*.test.ts` files alongside source code or in `__tests__` directories.

### End-to-End Tests (Playwright)

- Test complete user workflows
- Test across different browsers
- Visual regression testing (optional)

Location: `e2e/` directory.

### BDD with Gherkin

Feature files define acceptance criteria in business language:

```gherkin
Feature: Import Lab Results

  Scenario: Successfully import a lab result PDF
    Given I am logged into HemoIO
    When I upload a valid lab result PDF
    Then I should see the extracted values for review
    And low confidence values should be highlighted
    When I confirm the import
    Then the results should appear in my timeline
```

Gherkin scenarios are executed via Playwright with a cucumber-style integration.

Location: `features/` directory with step definitions in `e2e/steps/`.

## Build & Deployment

### Development

```bash
npm run dev      # Start development server
npm run test     # Run unit tests
npm run e2e      # Run end-to-end tests
```

### Production Build

```bash
npm run build    # Build for production
npm run preview  # Preview production build
```

### PWA Configuration

The application is configured as a Progressive Web App via `vite-plugin-pwa`:

- **Offline support**: Service worker precaches the application shell, and caches the OCR files and the LOINC catalog on first use
- **Installable**: Can be installed on desktop and mobile
- **Updates**: Prompt user when new version is available

Note: AI-powered document parsing requires internet connectivity. Offline mode supports viewing data, manual entry, trends, export, and local text extraction (PDF.js/Tesseract.js). Intelligent parsing of extracted text requires an internet connection to the AI provider.

### Deployment

The built application is a static site that can be deployed to any static hosting:

- Netlify
- Vercel
- GitHub Pages
- Self-hosted

No server infrastructure required.

## Project Structure

```sh
hemoio/
├── public/                 # Static assets
├── src/
│   ├── components/         # React components
│   │   ├── common/         # Shared/reusable components
│   │   ├── import/         # Import wizard components
│   │   ├── timeline/       # Timeline view components
│   │   ├── trends/         # Charts and trend components
│   │   └── settings/       # Settings and configuration
│   ├── contexts/           # React Context providers
│   ├── hooks/              # Custom React hooks
│   ├── services/           # Business logic services
│   │   ├── ai/             # AI provider integrations
│   │   ├── ocr/            # PDF.js and Tesseract.js wrappers
│   │   ├── export/         # Data export functionality
│   │   ├── units/          # UCUM reading and unit conversion
│   │   ├── statistics/     # Trend lines and statistics
│   │   └── analysis/       # Document analysis and LOINC matching
│   ├── data/               # Data layer
│   │   ├── db/             # Dexie.js database setup
│   │   ├── loinc/          # LOINC catalog, add-ons, display, keys
│   │   ├── storage/        # Storage provider implementations
│   │   └── encryption/     # Encryption utilities
│   ├── types/              # TypeScript type definitions
│   ├── utils/              # Utility functions
│   ├── App.tsx             # Root component
│   └── main.tsx            # Entry point
├── scripts/                # LOINC download and catalog generator, tuning runner
├── features/               # Gherkin feature files
├── e2e/                    # Playwright tests and step definitions
├── index.html
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
└── package.json
```

## Future Considerations

Items not in initial release but architecturally accommodated:

- **Additional AI providers**: New providers implement `AIProvider` interface
- **Cloud storage providers**: New providers implement `StorageProvider` interface
- **Patient portal integration**: New data sources implement an import interface
- **Additional test types**: Any LOINC test in the catalog already works; an add-on in `addons.ts` gives one a description, range and units
- **Localization**: Component structure supports i18n integration
