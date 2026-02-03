# HemoIO Copilot Instructions

Quick reference for working effectively in the HemoIO repository. See `CLAUDE.md` for detailed guidance, `ARCHITECTURE.md` for technical decisions, and `CONCEPT.md` for product vision.

## Build, Test & Lint

### Development
```bash
npm run dev          # Start dev server (Vite) on http://localhost:5173
npm run build        # Production build (runs TypeScript check first)
npm run preview      # Preview production build locally
```

### Testing - Unit Tests (Vitest)
```bash
npm run test         # Watch mode (re-runs on file changes)
npm run test:run     # Run once and exit
npm run test:coverage # Generate coverage report
```

**Key setup:**
- Test environment: jsdom
- Setup file: `src/test/setup.ts`
- Include pattern: `src/**/*.{test,spec}.{ts,tsx}`
- Coverage excludes: `node_modules/`, `src/test/`, `*.d.ts`, config files, types

### Testing - E2E Tests (Playwright)
```bash
npm run e2e          # Run all browsers (Chrome, Firefox, Safari) in parallel
npm run e2e:ui       # Interactive UI mode for debugging
npm run e2e:headed   # Run with visible browser window
```

**Key config:**
- Test directory: `e2e/`
- Base URL: `http://localhost:5173`
- Dev server auto-starts for tests
- Parallel execution enabled (1 worker in CI, unlimited locally)
- Screenshots on failure, traces on first retry

### Linting
```bash
npm lint             # Check ESLint rules (no auto-fix)
```

**ESLint rules:**
- Flat config format (ESLint 9+)
- TypeScript strict recommended
- React Hooks plugin enabled
- React Refresh plugin for Vite

## Project Architecture

HemoIO is a **client-side Single Page Application** that processes lab test results entirely in the browser. See `ARCHITECTURE.md` for full technical design.

### Layered Architecture

```
UI Layer (React + Mantine + Recharts)
         ↓
Application Layer (React Context, hooks, business logic)
         ↓
Service Layer (document analysis, export, biomarker logic)
         ↓
Data Layer (Dexie.js database, encryption, storage providers)
         ↓
Integration Layer (AI/cloud APIs)
```

**Layer rules:**
- **UI**: No direct database access, no business logic
- **Application**: Coordinates UI and services, manages state
- **Service**: Business logic only, no UI concerns, no direct storage
- **Data**: Storage operations, encryption, no business logic
- **Integration**: External API communication only

### Technology Stack

| Layer        | Technology      | Purpose                          |
|--------------|-----------------|----------------------------------|
| UI           | React 19, Mantine, Recharts | Components, tables, charts |
| Styling      | Emotion (@emotion/react) | CSS-in-JS styling |
| State        | React Context  | Application state management |
| Database     | Dexie.js       | IndexedDB wrapper |
| Encryption   | Web Crypto API | Client-side encryption |
| Document Processing | PDF.js, Tesseract.js | Text extraction and OCR |
| Build        | Vite, TypeScript | Fast builds with type safety |
| PWA          | vite-plugin-pwa | Offline support |

### Key File Structure

```
src/
├── components/     # React components by feature
│   ├── common/     # Reusable components
│   ├── import/     # Import wizard
│   ├── timeline/   # Timeline view
│   ├── trends/     # Charts
│   └── settings/   # Settings
├── contexts/       # React Context providers
├── hooks/          # Custom React hooks
├── services/       # Business logic
│   ├── ai/         # AI provider integrations
│   ├── ocr/        # PDF.js, Tesseract.js wrappers
│   ├── export/     # Data export
│   └── analysis/   # Document analysis orchestration
├── data/           # Data layer
│   ├── db/         # Dexie.js database
│   ├── storage/    # Storage provider implementations
│   └── encryption/ # Encryption utilities
├── types/          # TypeScript definitions
├── utils/          # Utility functions
├── test/           # Test setup files
├── App.tsx         # Root component
└── main.tsx        # Entry point

features/          # Gherkin feature specifications
e2e/               # Playwright tests
└── steps/          # Step definitions
```

### Path Aliases

The project uses TypeScript path aliases configured in `tsconfig`:

```typescript
'@' → './src'
'@components' → './src/components'
'@contexts' → './src/contexts'
'@hooks' → './src/hooks'
'@services' → './src/services'
'@data' → './src/data'
'@types' → './src/types'
'@utils' → './src/utils'
```

Use these aliases for imports instead of relative paths.

## Key Conventions

### Testing Requirements (CRITICAL)

Every feature requires three testing artifacts:

1. **Gherkin Feature File** (`features/*.feature`) - Business-language specification
2. **E2E Tests** (`e2e/*.spec.ts`) - Playwright browser automation tests
3. **Unit Tests** (`src/**/*.test.ts`) - Co-located with source code

Development workflow:
```
Write Gherkin → Write E2E tests → Write unit tests → Implement feature → Verify all pass
```

### TypeScript & Code Style

- **Strict mode**: `strict: true` in tsconfig
- **Exports**: Explicit return types required
- **Interfaces**: Prefer `interface` over `type` for objects
- **Components**: Functional only, one per file
- **Naming**:
  - Components: `PascalCase.tsx`
  - Hooks: `useCamelCase.ts`
  - Props interface: `ComponentNameProps`
  - Constants: `SCREAMING_SNAKE_CASE`
  - Test files: `*.test.ts(x)`
  - Feature files: `kebab-case.feature`

### Import Order

1. React and external libraries
2. Internal absolute imports (`@/...`)
3. Relative imports
4. Type imports
5. Style imports

### Git Workflow

**Branch naming:**
- `feature/short-description` - New features
- `fix/issue-description` - Bug fixes
- `refactor/what-is-being-refactored` - Refactoring
- `test/what-is-being-tested` - New tests
- `docs/what-documentation` - Documentation

**Commits:** Follow conventional commits format
```
type(scope): short description

[optional body]
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `chore`

**PR Requirements:**
- All tests passing (Gherkin, E2E, unit)
- No linting errors
- Meaningful description
- Link related issues

### Accessibility & Security

- **Accessibility**: European Accessibility Act (EAA) compliant
  - Semantic HTML, ARIA labels, keyboard navigation, WCAG AA contrast
  - Use `@html-expert` sub-agent for accessible components
- **Security**: 
  - Never log passwords, API keys, health data, or encryption keys
  - All sensitive data encrypted at rest (Web Crypto API)
  - Keys exist only in memory during session

### Data Model

Main entities in IndexedDB:
- **LabResult**: A lab report/visit (date, lab name, notes)
- **TestValue**: Individual test measurement (value, unit, reference ranges)
- **Biomarker**: Reference data about test types (units, description, category)
- **UserPreferences**: Display preferences, personal targets
- **Settings**: App config (storage/AI providers, theme)

See `ARCHITECTURE.md` for full data model diagram.

### Gherkin Best Practices

Feature files are **primary documentation**. They must be:
- Written in business language (understandable to non-developers)
- Comprehensive (happy paths and edge cases)
- Located in `features/` directory
- Descriptively named

Example structure:
```gherkin
Feature: Import Lab Results
  As a user
  I want to import lab test results from PDF files
  So that I can track my health data

  Background:
    Given I am logged into HemoIO

  Scenario: Successfully import a valid lab result PDF
    When I upload a lab result PDF
    Then I should see the extracted values for review
    And low confidence values should be highlighted
    When I confirm the import
    Then the results should appear in my timeline
```

### Document Analysis Pipeline

Hybrid approach: local text extraction + AI-powered parsing

1. **Local**: PDF.js extracts text from text-based PDFs, Tesseract.js handles OCR for scanned documents (both client-side, no API calls)
2. **AI Service**: Receives extracted text (not raw documents) for intelligent parsing
   - Identifies document structure
   - Extracts biomarker names, values, units, reference ranges
   - Assigns confidence scores

Result: Documents stay local (privacy), API costs reduced, partial offline support.

### Adding a New Feature

1. Create Gherkin feature file in `features/`
2. Create E2E test file in `e2e/` and step definitions in `e2e/steps/`
3. Create component(s) in `src/components/`
4. Create unit tests alongside components
5. Add service logic in `src/services/` if needed
6. Update types in `src/types/` if needed
7. Verify all tests pass
8. Update `ARCHITECTURE.md` if making architectural changes

### Storage & Encryption

- **Database**: Dexie.js wrapper around IndexedDB
- **Encryption**: Web Crypto API (PBKDF2 for key derivation, AES-GCM for encryption)
- **Storage Providers**: Abstract interface for local/cloud storage
  - Current: Local storage support
  - Future: Dropbox, Google Drive providers

### Vitest Coverage Reports

Coverage reports generated to:
- Terminal output (text format)
- `coverage/` directory (HTML and JSON formats)

View HTML report in browser for detailed coverage analysis.

### AI Providers

Pluggable architecture behind `AIProvider` interface:

```typescript
interface AIProvider {
  analyzeLabReport(extractedText: string): Promise<AnalysisResult>;
}
```

Enables support for multiple providers (OpenAI, Anthropic, etc.) without core logic changes.
