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
│    (Document Analysis, Export, Biomarker Dictionary)    │
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
- Data import/export operations
- Unit conversion and normalization
- Biomarker dictionary management
- Reference range handling

### Data Layer

Data persistence and retrieval. Responsible for:

- Database operations (Dexie.js)
- Encryption/decryption of data
- Storage provider abstraction
- Data migration between schema versions

### Integration Layer

External service communication. Responsible for:

- AI provider API calls (document analysis)
- Cloud storage provider APIs
- Abstracting provider differences behind common interfaces

## Data Model

High-level entity relationships:

```text
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   LabResult  │────<│  TestValue   │>────│  Biomarker   │
│              │     │              │     │  (reference) │
│ - date       │     │ - value      │     │              │
│ - labName    │     │ - unit       │     │ - name       │
│ - notes      │     │ - refRangeLo │     │ - category   │
└──────────────┘     │ - refRangeHi │     │ - units[]    │
                     │ - qualType   │     │ - description│
                     └──────────────┘     └──────────────┘

┌──────────────┐     ┌──────────────┐
│    User      │     │   Settings   │
│  Preferences │     │              │
│              │     │ - storageProvider
│ - unitPrefs  │     │ - aiProvider │
│ - targets    │     │ - theme      │
└──────────────┘     └──────────────┘
```

### Key Entities

- **LabResult**: A single lab report/visit (date, lab name, notes)
- **TestValue**: Individual test measurement within a lab result
- **Biomarker**: Reference data about a type of test (canonical units, description, category)
- **UserPreferences**: User's display preferences, personal target ranges
- **Settings**: Application configuration (storage provider, AI keys, etc.)

## Storage Architecture

### Dexie.js Database

All user data is stored in IndexedDB via Dexie.js:

```typescript
// Simplified schema
const db = new Dexie('HemoIO');
db.version(1).stores({
  labResults: '++id, date, labName',
  testValues: '++id, labResultId, biomarkerId, date',
  biomarkers: '++id, name, category',
  userPreferences: 'id',
  settings: 'id'
});
```

### Encryption

Data is encrypted at rest using the Web Crypto API:

- User's password derives an encryption key (PBKDF2)
- AES-GCM for symmetric encryption
- Encryption happens at the data layer before storage
- Decryption requires authentication each session

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
- Extract biomarker names, values, units, and reference ranges
- Handle varied lab report formats
- Assign confidence scores to extractions

```typescript
interface AIProvider {
  analyzeLabReport(extractedText: string): Promise<AnalysisResult>;
}

interface AnalysisResult {
  labDate: ValueWithConfidence<Date>;
  labName: ValueWithConfidence<string>;
  values: ExtractedValue[];
}

interface ExtractedValue {
  biomarkerName: string;
  value: string | number;
  unit: string;
  referenceRange?: { low?: number; high?: number };
  confidence: number; // 0-1
  rawText: string; // Original text this was extracted from
}

interface ValueWithConfidence<T> {
  value: T;
  confidence: number;
}
```

Multiple AI providers can be supported (OpenAI, Anthropic, etc.) behind this interface.

### Offline Capability

With local text extraction:

- **Fully offline**: Viewing data, manual entry, trends, export
- **Partially offline**: Text extraction from documents (PDF.js, Tesseract.js)
- **Requires internet**: AI-powered intelligent parsing of extracted text

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

- **Offline support**: Service worker caches application shell
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
│   │   └── analysis/       # Document analysis orchestration
│   ├── data/               # Data layer
│   │   ├── db/             # Dexie.js database setup
│   │   ├── storage/        # Storage provider implementations
│   │   └── encryption/     # Encryption utilities
│   ├── types/              # TypeScript type definitions
│   ├── utils/              # Utility functions
│   ├── App.tsx             # Root component
│   └── main.tsx            # Entry point
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
- **Additional test types**: Biomarker reference data can be extended
- **Localization**: Component structure supports i18n integration
