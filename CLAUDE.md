# HemoIO Project Instructions

This file provides instructions for Claude when working on the HemoIO project.

## Project Overview

HemoIO is a client-side application for analyzing and cataloging patient laboratory test results. See `CONCEPT.md` for the full product concept and `ARCHITECTURE.md` for technical design decisions.

## Browser Debugging & Verification

You have access to the `chrome-devtools` MCP server which allows direct browser interaction. Use this to verify and debug functionality yourself instead of asking the user.

### Available Capabilities

- **Page Navigation**: Navigate to URLs, reload, go back/forward
- **Element Interaction**: Click, fill forms, hover, drag and drop
- **Page Inspection**: Take snapshots (accessibility tree), screenshots
- **Console & Network**: View console messages, inspect network requests
- **Performance**: Record and analyze performance traces
- **Script Execution**: Run JavaScript in the page context

### When to Use

- Verifying that implemented features work correctly
- Debugging UI issues or unexpected behavior
- Testing form interactions and validation
- Checking responsive layouts
- Inspecting network requests to AI/storage providers
- Validating accessibility (via snapshot inspection)

### Key Tools

| Tool                    | Purpose                                |
|-------------------------|----------------------------------------|
| `take_snapshot`         | Get accessibility tree of current page |
| `take_screenshot`       | Capture visual state                   |
| `click`, `fill`         | Interact with elements                 |
| `navigate_page`         | Go to URLs or navigate history         |
| `list_console_messages` | Check for errors/warnings              |
| `list_network_requests` | Inspect API calls                      |
| `evaluate_script`       | Run JavaScript in page context         |

Always verify functionality in the browser when implementing UI features rather than assuming they work.

## Sub-Agent Usage

Use specialized sub-agents proactively when working in their domains. Sub-agents are located in `~/.claude/claude-code-subagents/agents/`.

### Primary Sub-Agents

| Sub-Agent           | When to Use                                                              |
|---------------------|--------------------------------------------------------------------------|
| `react-expert`      | Component development, hooks, state management, React performance issues |
| `vitest-expert`     | Writing unit tests, test configuration, mocking strategies               |
| `playwright-expert` | E2E test creation, browser automation, test fixtures                     |
| `typescript-expert` | Type definitions, generics, TypeScript configuration                     |

### Secondary Sub-Agents (Use When Relevant)

| Sub-Agent               | When to Use                         |
|-------------------------|-------------------------------------|
| `css-expert`            | Styling issues, CSS architecture    |
| `html-expert`           | Semantic HTML, accessibility markup |
| `github-actions-expert` | CI/CD pipeline configuration        |
| `docker-expert`         | Containerization (if needed)        |
| `openai-api-expert`     | AI provider integration             |

## Testing Requirements

**CRITICAL: Every feature MUST have all three testing artifacts:**

1. **Gherkin Feature File** (FIRST) - Located in `features/`
2. **E2E Tests** - Located in `e2e/`
3. **Unit Tests** - Located alongside source code as `*.test.ts`

### Development Workflow

```text
1. Write Gherkin scenarios    →  features/feature-name.feature
2. Implement E2E tests        →  e2e/feature-name.spec.ts
3. Write unit tests           →  src/**/*.test.ts
4. Implement the feature      →  src/**/
5. Verify all tests pass
```

### Gherkin Guidelines

Gherkin files serve as the **primary documentation** for features. They must be:

- Written in business language, understandable by non-developers
- Comprehensive, covering happy paths and edge cases
- Located in `features/` directory
- Named descriptively: `import-wizard.feature`, `trend-charts.feature`

Example structure:

```gherkin
Feature: [Feature Name]
  As a [user type]
  I want to [action]
  So that [benefit]

  Background:
    Given [common preconditions]

  Scenario: [Happy path scenario]
    Given [context]
    When [action]
    Then [expected outcome]

  Scenario: [Edge case or error scenario]
    Given [context]
    When [action]
    Then [expected outcome]
```

### Unit Test Guidelines

- Use `vitest-expert` sub-agent for complex test scenarios
- Test behavior, not implementation details
- Mock external dependencies (AI services, storage)
- Aim for meaningful coverage, not 100% line coverage
- Co-locate tests with source: `ComponentName.tsx` → `ComponentName.test.tsx`

### E2E Test Guidelines

- Use `playwright-expert` sub-agent for complex scenarios
- Use Page Object Model for test structure
- Implement step definitions in `e2e/steps/`
- Tests should be independent and idempotent
- Handle async operations with proper waits, not arbitrary timeouts

## Code Style & Conventions

### TypeScript

- Strict mode enabled (`strict: true` in tsconfig)
- Explicit return types on exported functions
- Prefer `interface` over `type` for object shapes
- Use `unknown` over `any` when type is truly unknown
- No `@ts-ignore` without explanatory comment

### React Components

- Functional components only (no class components)
- One component per file
- Component file naming: `PascalCase.tsx`
- Hook file naming: `useCamelCase.ts`
- Props interface named: `ComponentNameProps`

Example structure:

```typescript
interface ImportWizardProps {
  onComplete: (result: ImportResult) => void;
  initialStep?: number;
}

export function ImportWizard({ onComplete, initialStep = 0 }: ImportWizardProps) {
  // Implementation
}
```

### File Organization

Follow the structure defined in `ARCHITECTURE.md`:

```text
src/
├── components/     # React components by feature
├── contexts/       # React Context providers
├── hooks/          # Custom React hooks
├── services/       # Business logic services
├── data/           # Data layer (db, storage, encryption)
├── types/          # TypeScript type definitions
└── utils/          # Utility functions
```

### Naming Conventions

| Type             | Convention         | Example                  |
|------------------|--------------------|--------------------------|
| Components       | PascalCase         | `ImportWizard.tsx`       |
| Hooks            | camelCase with use | `useLabResults.ts`       |
| Utilities        | camelCase          | `unitConversion.ts`      |
| Types/Interfaces | PascalCase         | `LabResult`, `TestValue` |
| Constants        | SCREAMING_SNAKE    | `MAX_FILE_SIZE`          |
| Test files       | *.test.ts(x)       | `ImportWizard.test.tsx`  |
| Feature files    | kebab-case         | `import-wizard.feature`  |

### Import Order

1. React and external libraries
2. Internal absolute imports (components, hooks, services)
3. Relative imports
4. Type imports
5. Style imports

## Architecture Adherence

Always refer to `ARCHITECTURE.md` for:

- Layer responsibilities (UI → Application → Service → Data → Integration)
- Data model structure
- Storage and encryption approach
- AI integration patterns

### Layer Separation Rules

- **UI Layer**: No direct database access, no business logic
- **Application Layer**: Coordinates UI and services, manages state
- **Service Layer**: Business logic, no UI concerns, no direct storage
- **Data Layer**: Storage operations, encryption, no business logic
- **Integration Layer**: External API communication only

## Accessibility Requirements

HemoIO must comply with European Accessibility Act (EAA) guidelines:

- Semantic HTML structure
- ARIA labels on all interactive elements
- Keyboard navigation support throughout
- Color contrast ratios meeting WCAG AA
- Never rely solely on color to convey information
- Screen reader compatibility
- Focus indicators visible for keyboard users

Use `html-expert` sub-agent when implementing accessible components.

## Security Requirements

### Never Log or Expose

- User passwords or derived keys
- API keys (even in error messages)
- Health data in console or error reports
- Encryption keys or salts

### Encryption Handling

- All sensitive data encrypted at rest
- Use Web Crypto API for encryption operations
- Keys exist only in memory during session
- See `ARCHITECTURE.md` Security Architecture section

## Documentation

### Code Comments

- Explain "why", not "what"
- Document non-obvious business logic
- JSDoc for exported functions and complex types
- No commented-out code in commits

### Feature Documentation

- Gherkin files are the primary feature documentation
- Update Gherkin when feature behavior changes
- README updates for setup/configuration changes only

## Git Workflow

### Branch Naming

```text
feature/short-description
fix/issue-description
refactor/what-is-being-refactored
test/what-is-being-tested
docs/what-documentation
```

### Commit Messages

Follow conventional commits format:

```text
type(scope): short description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `chore`

Examples:

```text
feat(import): add PDF text extraction with PDF.js
fix(trends): correct unit conversion for glucose values
test(import): add e2e tests for import wizard flow
docs(readme): update setup instructions
```

### Pull Request Requirements

- All tests passing (Gherkin scenarios, E2E, unit)
- No linting errors
- Meaningful PR description
- Link to related issues if applicable

## Common Patterns

### Adding a New Feature

1. Create Gherkin feature file in `features/`
2. Create E2E test file in `e2e/`
3. Create step definitions in `e2e/steps/`
4. Create component(s) in `src/components/`
5. Create unit tests alongside components
6. Add service logic if needed in `src/services/`
7. Verify all tests pass
8. Update types in `src/types/` if needed

### Adding a New Service

1. Define interface in `src/types/`
2. Implement in `src/services/[domain]/`
3. Add unit tests
4. Wire up in application layer

### Adding a New Storage Provider

1. Implement `StorageProvider` interface
2. Add to `src/data/storage/`
3. Add configuration option in settings
4. Add unit tests for the provider

### Adding a New AI Provider

1. Implement `AIProvider` interface
2. Add to `src/services/ai/`
3. Add configuration option in settings
4. Add unit tests with mocked responses

## Codebase Health

**CRITICAL: You own the entire codebase, not just your current changes.**

### Build and Lint Requirements

- **The build MUST pass**: `npm run build` must complete without errors
- **Lint MUST pass**: `npm run lint` must complete without errors
- **Tests MUST pass**: `npm run test` must complete without failures

### No "Not My Problem" Mentality

- If you encounter build errors, lint errors, or test failures - **fix them**
- Never dismiss errors as "pre-existing" or "unrelated to current changes"
- If a previous implementation introduced issues, fix them now
- The codebase should always be in a working state after your changes

### Before Completing Any Task

1. Run `npm run build` and fix any errors
2. Run `npm run lint` and fix any errors
3. Run `npm run test` and fix any failures
4. Only consider the task complete when all three pass

### Regression Prevention

- When modifying shared code (types, utilities, factories), verify all consumers still work
- Update tests when changing behavior
- If you break something, fix it immediately - don't leave it for later

## Reference Documents

- `CONCEPT.md` - Product concept, features, design decisions
- `ARCHITECTURE.md` - Technical architecture, data model, technology stack
