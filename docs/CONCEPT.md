# HemoIO

An application that analyzes the pdf documents (or images) of a patient's laboratory tests (such as blood tests and urine analysis) and catalogs them in a database for later viewing and statistical analysis.

## Target User

Individual patients who want to take control of their health data. Users who:

- Receive lab results from multiple healthcare providers
- Want to understand their health trends over time
- Need a centralized place to store and access their lab history
- Want to be informed participants in their healthcare journey

HemoIO is designed as a **single-user application**. Each installation manages one person's lab results. Users tracking health data for family members would use separate installations/instances.

## Problem Statement

**Fragmented Health Records**: Lab results are scattered across different clinics, hospitals, and testing facilities. Each provider has their own portal or delivers results in different formats (PDF, printed paper, patient portals).

**No Historical Context**: When viewing a single lab result, it's difficult to understand whether values are improving, worsening, or stable over time. A cholesterol reading of 210 means little without knowing it was 240 last year.

**Confusing Reference Ranges**: Lab reports show reference ranges, but they vary between labs and don't account for personal baselines. Users struggle to interpret what their results actually mean for them.

**Difficult to Share**: When visiting a new doctor or specialist, patients often can't easily provide their complete lab history. Important context gets lost.

**Lost Insights**: Without tracking, users miss patterns—like seasonal vitamin D drops or how lifestyle changes correlate with biomarker improvements.

## Scope (Initial Release)

### Supported Test Types

#### Blood Panels

- Complete Blood Count (CBC): WBC, RBC, hemoglobin, hematocrit, platelets, etc.
- Basic Metabolic Panel (BMP): Glucose, calcium, electrolytes, kidney function
- Comprehensive Metabolic Panel (CMP): BMP + liver function tests
- Lipid Panel: Total cholesterol, LDL, HDL, triglycerides
- Thyroid Panel: TSH, T3, T4
- Iron Studies: Serum iron, ferritin, TIBC
- Vitamin Levels: B12, D, folate
- Hemoglobin A1C

#### Urinalysis

- Physical properties: Color, clarity, specific gravity
- Chemical analysis: pH, protein, glucose, ketones, blood, bilirubin
- Microscopic: WBC, RBC, bacteria, casts, crystals

## Core Features

### 1. Document Import Wizard

A multi-step guided workflow for importing lab results:

1. **Upload**: User uploads one or more PDF documents or images (photos/scans). Supports batch upload of multiple documents at once.

2. **Analysis**: System uses AI models (via user-provided API keys) to analyze documents and extract test values, dates, and lab information. Each extracted value is assigned a confidence score.

3. **Review & Verify**: User is presented with a form showing all extracted values.
   - Match quality indicators highlight confidence level for each value
   - Problem areas (low confidence matches) are surfaced first for user attention
   - Only very high confidence matches are pre-filled; others require explicit confirmation
   - User can modify, correct, or reject any extracted value
   - Side-by-side view of original document and extracted data

4. **Confirm & Save**: Final review of all values before committing to storage. Option to attach notes to the overall result set.

### 2. Manual Entry

- Add results manually when automatic parsing fails or for paper-only results
- Quick entry forms organized by test type
- Copy previous entry as template for recurring tests

### 3. Unit Normalization & Conversion

- Same biomarker can be expressed in different units across labs (e.g., glucose in mg/dL vs mmol/L)
- System normalizes all values internally to a canonical unit
- Display shows all common unit representations
- User can configure their preferred default display unit per biomarker
- Automatic conversion between units with clear labeling

### 4. Timeline / History View

- Chronological view of all lab results
- Filter by test type, date range, or specific biomarkers
- Quick visual indicators for normal/abnormal values
- Expandable details for each test date

### 5. Trend Charts

- Line graphs showing biomarker values over time
- Multiple markers on same chart for comparison
- Highlight reference ranges on charts
- Zoom in on specific time periods
- Mark significant events (started medication, lifestyle change, etc.)

### 6. Reference Range Comparison

- Display standard reference ranges alongside values
- Visual indicators: normal (green), borderline (yellow), out of range (red)
- Show which lab provided the reference range
- Option to set personal target ranges

### 7. Alerts for Out-of-Range Values

- Highlight values outside reference ranges
- Summary of flagged items after import
- Historical alerts: track how long a value has been out of range

### 8. User Notes

- Attach notes to individual test results or specific biomarker values
- Add context like "fasting", "after medication change", "feeling unwell"
- Notes appear in timeline and can be shown on trend charts

### 9. Export & Share

- Generate PDF reports of selected results or full history
- Export data in standard formats (CSV, JSON)
- Create shareable summaries for healthcare providers
- Print-friendly views

### 10. Multi-Language Lab Format Support

- Parse lab reports in multiple languages
- Handle international units and naming conventions

### 11. Biomarker Dictionary

An educational reference providing context about each biomarker:

- What the biomarker measures (e.g., "Hemoglobin measures the oxygen-carrying protein in red blood cells")
- Which organs or body systems it relates to
- Common reasons it might be tested
- Factors that can influence levels (e.g., "Vitamin D levels are often lower in winter months")
- Links to reputable external sources for further reading

The dictionary is strictly educational and informational. It does not provide:

- Diagnostic interpretations of user's specific values
- Treatment recommendations or medical advice
- Suggestions about what actions to take based on results

Clear disclaimers accompany all dictionary content emphasizing that users should consult healthcare professionals for interpretation of their personal results.

## Statistical Analysis (Phase 1)

### Trends Over Time

- Visualize how each biomarker changes across all recorded tests
- Calculate direction of change (improving, worsening, stable)
- Show rate of change (e.g., "LDL decreased 15% over 6 months")
- Identify patterns (seasonal variations, cyclical changes)
- Compare pre/post periods (before and after a lifestyle change or treatment)

## User Scenarios

### Scenario 1: New User Onboarding

Maria starts using HemoIO and uploads 3 years of lab results she's collected as PDFs. The import wizard guides her through verifying the extracted data, flagging a few low-confidence readings for her review. Once imported, she immediately sees that her vitamin D has been consistently low every winter—something she never noticed looking at individual reports.

### Scenario 2: Tracking Progress

John is working on lowering his cholesterol through diet. Every 3 months he uploads his new lipid panel. HemoIO shows him a trend chart demonstrating his LDL dropping from 165 → 142 → 128 over 9 months, motivating him to continue. He adds notes to each result documenting his dietary changes.

### Scenario 3: Doctor Visit Preparation

Sofia has an appointment with a new endocrinologist. She exports her thyroid panel history from HemoIO as a PDF, giving her new doctor immediate context about her TSH fluctuations over the past 2 years.

### Scenario 4: Catching Anomalies

David imports his latest CBC and HemoIO flags that his platelet count has been steadily declining over his last 4 tests, even though each individual result was still within "normal" range. He brings this trend to his doctor's attention.

### Scenario 5: International User

Yuki moved from Japan to Germany and has lab results in both Japanese and German formats, using different units. HemoIO normalizes everything, showing her glucose readings on a single trend chart regardless of whether the original was in mg/dL or mmol/L.

## Design Decisions

### Data Presentation Only

HemoIO displays data and trends without providing medical interpretations or health advice. This is a data management and visualization tool, not a diagnostic tool. Users are expected to discuss their results with healthcare professionals. This approach avoids legal and regulatory issues around medical device classification.

### Security & Authentication

All user data is encrypted at rest using an encrypted SQLite database. Users must authenticate to unlock and access their data each session.

#### Authentication

- Password required with enforced security criteria (length, complexity)
- Optional 2FA support via authenticator apps (TOTP) or physical security keys (FIDO2/WebAuthn, e.g., YubiKey)
- Authentication configured during first-run setup

#### Data Ownership

Users have complete ownership and control of their data:

- Data is stored on a device or service chosen by the user
- HemoIO never has access to user data
- No central servers, no accounts with us, no telemetry
- This eliminates GDPR obligations and data breach concerns on our end
- Backup and recovery is the user's responsibility (see Data Management below)

### Storage Architecture

Storage is abstracted behind a well-defined interface, allowing for multiple storage providers:

- **Local storage**: Data stays on user's device
- **Cloud storage**: User can configure their own cloud provider (e.g., personal Dropbox, Google Drive, etc.)

The storage provider abstraction allows adding new backends without changing core application logic. The underlying storage format is an encrypted SQLite database file.

### Original Document Handling

Original PDF documents and images are **not retained** after parsing. Once the user has verified and confirmed the extracted data through the import wizard, the source document is discarded. Users should keep their own copies of original documents if needed for reference.

Rationale: Reduces storage requirements, simplifies data management, and avoids storing potentially large files. The extracted, structured data is what provides value for trending and analysis.

### Data Management

#### Duplicate Prevention

The system helps users avoid importing duplicate results:

- Detection of likely duplicates based on date, lab, and test type during import
- Warning prompts when a potential duplicate is detected
- User can proceed anyway or cancel the import

#### Editing & Deletion

- All imported data can be edited by the user at any time
- Individual results or entire test dates can be deleted
- Destructive actions (delete, bulk edit) require explicit confirmation
- No undo functionality; changes are permanent

#### Backup & Recovery

- Users can manually create backups at any time (exports a copy of the encrypted database)
- Backups can be stored wherever the user chooses
- Restore by replacing the current database with a backup copy
- Backup/recovery is entirely user-managed; HemoIO provides the mechanism but no automated or cloud backup service

### First-Run Setup

When opening HemoIO for the first time, users complete an initial setup process:

1. **Create Password**: Set up authentication credentials meeting security requirements. Optionally configure 2FA.

2. **Configure Storage**: Choose where to store the encrypted database (local device or cloud provider).

3. **AI Service Configuration**: Provide API key(s) for the AI models used in document analysis. Users supply their own keys (e.g., for OCR and language model services).

4. **Setup Complete**: User is ready to begin importing lab results.

Configuration settings are saved locally in encrypted storage (browser localStorage or equivalent).

### Modular Architecture

The system is designed with modularity in mind:

- Document parsing is separate from storage
- Analysis engine is independent of UI
- Export formats are pluggable
- This allows future extensibility (e.g., patient portal integration) without architectural changes

### Patient Portal Integration

Not planned for initial release. However, the modular architecture should accommodate future integration with standards like FHIR, Apple Health, or provider-specific APIs if the need arises.

### Reference Range Handling

Reference ranges vary between labs for legitimate reasons:

- Different testing methodologies and equipment
- Different calibration standards
- Population differences (some labs adjust for regional demographics)
- Updated medical guidelines over time

HemoIO uses a hybrid approach:

1. **Preserve original ranges**: Each result stores the reference range provided by the originating lab. This is always available and clearly attributed.

2. **Standardized reference overlay**: Users can optionally view their results against a standardized reference range for comparison across labs. This is clearly marked as a general reference, not the lab-specific range.

3. **Personal target ranges**: Users can define their own target ranges for any biomarker (e.g., a diabetic patient might set a tighter glucose target based on their doctor's guidance).

4. **Visual distinction on trend charts**: When displaying trends across multiple labs, reference range bands are visually distinguished by lab source. Users can toggle between viewing lab-specific ranges, standardized ranges, or personal targets.

5. **Range difference alerts**: When a new result comes from a lab with notably different reference ranges than previous results, the system highlights this to prevent confusion.

### Qualitative Value Handling

Lab results include both quantitative (numeric) and qualitative (descriptive) values. Qualitative values are categorized into three types for appropriate handling:

#### Boolean Values

Binary results that can be treated as true/false:

- Examples: positive/negative, reactive/non-reactive, detected/not detected, present/absent
- Storage: Stored as boolean internally
- Trending: Can show timeline of status changes (e.g., "was negative, now positive")
- Statistics: Can calculate frequency (e.g., "positive 2 out of 5 tests")

#### Ordinal Values

Results that represent a relative scale with a natural ordering:

- Examples: absent → trace → few → moderate → many; none → rare → occasional → frequent; negative → weakly positive → positive → strongly positive
- Storage: Mapped to integer values based on the scale
- Scale mapping: Dynamic based on the specific test's possible values; the system maintains a mapping table for known ordinal scales
- Trending: Can show progression along the scale (e.g., "protein in urine increased from trace to moderate")
- Statistics: Can identify worsening/improving trends
- Display: Always shows the original qualitative term alongside any numeric representation

#### Descriptive Values

Free-form qualitative results that don't fit boolean or ordinal patterns:

- Examples: urine color ("pale yellow", "amber"), appearance ("clear", "cloudy", "turbid"), specific observations
- Storage: Stored as strings
- Trending: Listed chronologically but not graphed numerically
- Statistics: Not applicable; these remain for user reference and historical record only
- Display: Shown in timeline and result details for consultation

The system attempts to auto-classify qualitative values during import, but users can adjust the classification if needed.

### Accessibility

HemoIO aims to comply with the European Accessibility Act (EAA) guidelines wherever possible:

- Semantic HTML structure for screen reader compatibility
- ARIA labels and roles for interactive elements
- Keyboard navigation support throughout the application
- Sufficient color contrast ratios
- Not relying solely on color to convey information (patterns, icons, or text labels accompany color indicators)
- Resizable text and responsive layouts
- Clear focus indicators for keyboard users
- Descriptive alt text for charts and visualizations

Accessibility is a core requirement, not an afterthought.

### Data Portability

#### Full Data Export

Users can export all their data in standard, open formats:

- Complete database export (encrypted or unencrypted, user's choice)
- Structured data export (JSON, CSV) containing all results, notes, and settings
- Export includes all metadata (dates, labs, reference ranges, user notes)

#### Full Data Import

Users can import previously exported HemoIO data:

- Restore from a full database export
- Import from structured data formats (JSON)
- Merge imported data with existing data or replace entirely

#### Import from Other Services

Not planned for initial release. The modular architecture should allow adding importers for other health apps or services in the future if demand arises.

#### Device Migration

Not explicitly handled as a separate feature. Users who configure cloud storage as their storage provider can seamlessly access their data from multiple devices or migrate to a new device by simply configuring the same cloud storage location.
