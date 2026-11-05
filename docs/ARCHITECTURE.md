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
db.version(7).stores({
  labResults: '++id',
  testValues: '++id, labResultId',
  userPreferences: '++id',
  settings: '++id',
  userNotes: '++id, labResultId, testValueId',
});
```

Version 7 moved tests onto LOINC codes. There is no migration: the upgrade
clears lab results, values, notes and preferences and keeps the settings,
and backups made before it are refused with a message saying why.

### Encryption

Data is encrypted at rest using the Web Crypto API:

- User's password derives an encryption key (PBKDF2)
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

- Encryption key derived from password using PBKDF2 with high iteration count
- Key exists only in memory during session
- Optional 2FA adds additional verification (not part of key derivation)
- No key recovery possible without password (by design)

### Sensitive Data Handling

- API keys stored encrypted in settings
- Decrypted only when needed for API calls
- Never logged or exposed in error messages

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
- **Locally** (`src/services/analysis/loincMatch.ts`). The printed name is searched in the catalog's English and Italian names, read with its sample (a prefix such as "S-" or "U-", sample words anywhere in the name such as "urina", "siero" or "sangue", or the AI's specimen hint) and with the LOINC properties its UCUM unit implies. "Blood" is said loosely of serum tests too, so a blood word or hint leaves blood and serum tests both open. A LOINC long common name printed in full is that test. A bracket counts as another name or a qualifier ("Tirotropina (TSH)"); Italian and English word endings count as one word ("proteine", "protein"); a word no name has may be two name words written as one ("Alfafetoproteina"); a name ending in "-uria" is its substance in urine ("Microalbuminuria"), and one ending in "-emia" its substance said of blood, loosely ("Proteinemia"); "ematico" and "eritrocitario" are sample words too. A bracket or a part after a spaced dash finds a test alone only when it is one of the test's names, so "C3 attivatore (complemento)" is not complement C3. Antibody wordings ("Anticorpi anti-", "Ab anti", "A.A.", "(anticorpi)") are read as LOINC's "Ab", Greek letters and their symbol-font stand-ins ("a1-", "b2-") are spelled out, and a letter and its number written apart ("B 12") are one word. A variant LOINC names with a challenge or a time ("^post …") is taken only when it fits better than the plain test, so the name must say it. Units are read for their LOINC property: international units per volume are never a ratio, and are an enzyme activity only for a test LOINC gives in enzyme units (a renin activity is not read in µIU/mL). There is no alias list: a wording LOINC does not know ("Glicemia", "PCR") goes to the AI or the user, and is learned once chosen. A test HemoIO describes in a unit LOINC files under another property (HbA1c in mmol/mol) is a candidate only when no test of the unit's own property fits. A test is taken without asking when its name fits best by a margin, or when the tests that fit as well differ in what the name does not say: a test and its variants by method or collection time are one fit (variants that each name a method, such as D-dimer FEU and DDU, are not), and among different tests the one HemoIO describes, or one at least ten times more common by LOINC's rank, is the usual meaning. So with no sample said, the serum test is usually taken over the blood one ("Potassio" from a blood gas report too). A value said loosely of blood is never given a serum test when LOINC has a blood test of it, in any unit, that trends apart ("Etanolo ematico" is asked); a blood test is taken for it when it stands out ("Platelet count" with a blood hint). A test HemoIO describes by calculation stands for a name that does not say so only when no measured variant is about as common ("Colesterolo LDL" may be calculated or direct, so it is asked); counts by machine or by hand measure one thing alike. In a count unit, "absolute" only says the count ("Neutrophil, Absolute"). Other values keep up to eight candidates; a name that fits nothing well gets the most common tests of its sample and unit as well. A value without a readable unit is never matched.
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
