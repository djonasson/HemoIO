/**
 * Tests for TrendsView component
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { TrendsView } from './TrendsView';
import { SaveError } from '@data/db/saveError';
import { useLabResults } from '@hooks/useLabResults';
import { useAlerts } from '@hooks/useAlerts';
import { CatalogContext } from '@contexts/useCatalog';
import { fixtureCatalog } from '@/test/loincFixture';
import { testKey } from '@data/loinc/display';
import type { LabResultWithDetails, EnrichedTestValue } from '@hooks/useLabResults';

const catalog = fixtureCatalog();

// Mock hooks
vi.mock('@hooks/useLabResults', () => ({
  useLabResults: vi.fn(),
}));

vi.mock('@hooks/useAlerts', () => ({
  useAlerts: vi.fn(),
}));

vi.mock('@hooks/useNotes', () => ({
  useNotes: vi.fn(() => ({
    notes: [],
    isLoading: false,
    error: null,
    filters: {},
    setFilters: vi.fn(),
    createNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
    refresh: vi.fn(),
    getNotesForLabResult: vi.fn(() => []),
    getNotesForBiomarker: vi.fn(() => []),
    getNotesForTestValue: vi.fn(() => []),
    allTags: [],
  })),
}));

const mockSetPreferredUnit = vi.fn();
let mockUnitPreferences: Record<string, string> = {};
vi.mock('@hooks/usePreferences', () => ({
  usePreferences: () => ({
    unitPreferences: mockUnitPreferences,
    personalTargets: {},
    isLoaded: true,
    setPreferredUnit: mockSetPreferredUnit,
    setPersonalTarget: vi.fn(),
    reload: vi.fn(),
  }),
}));

const mockShowNotification = vi.fn();
vi.mock('@mantine/notifications', () => ({
  notifications: { show: (...args: unknown[]) => mockShowNotification(...args) },
}));

// Mock ResizeObserver for Recharts
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

/** useAlerts with this many unacknowledged alerts */
function mockAlerts(unacknowledgedCount = 0): void {
  vi.mocked(useAlerts).mockReturnValue({
    groups: [],
    unacknowledgedCount,
    hiddenCount: 0,
    assessedCount: 1,
    isLoading: false,
    error: null,
    dismissGroup: vi.fn(),
    acknowledgeGroup: vi.fn(),
    refresh: vi.fn(),
  });
}

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MantineProvider env="test">
      <DatesProvider settings={{ locale: 'en' }}>
        <CatalogContext.Provider value={catalog}>{ui}</CatalogContext.Provider>
      </DatesProvider>
    </MantineProvider>
  );
}

function createMockTestValue(
  id: number,
  labResultId: number,
  biomarkerKey: string,
  rawText: string,
  value: number,
  status: 'normal' | 'high' | 'low' | 'unknown' = 'normal',
  unit = 'mg/dL',
  referenceRangeLow = 70,
  referenceRangeHigh = 100
): EnrichedTestValue {
  return {
    id,
    labResultId,
    biomarkerKey,
    value,
    unit,
    status,
    rawText,
    referenceRangeLow,
    referenceRangeHigh,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createMockResult(
  id: number,
  date: string,
  testValues: EnrichedTestValue[]
): LabResultWithDetails {
  return {
    id,
    date: new Date(date),
    labName: 'Test Lab',
    createdAt: new Date(),
    updatedAt: new Date(),
    testValues,
    abnormalCount: testValues.filter((tv) => tv.status === 'high' || tv.status === 'low').length,
    totalCount: testValues.length,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUnitPreferences = {};
  mockSetPreferredUnit.mockReset().mockResolvedValue(undefined);
  mockShowNotification.mockReset();
  mockAlerts();
});

describe('TrendsView', () => {
  it('should render loading state', () => {
    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results: [],
      isLoading: true,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TrendsView />);

    expect(screen.getByText(/loading trend data/i)).toBeInTheDocument();
  });

  it('should render error state', () => {
    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results: [],
      isLoading: false,
      error: 'Database connection failed',
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TrendsView />);

    expect(screen.getByText(/database connection failed/i)).toBeInTheDocument();
  });

  it('should render empty state when no results', () => {
    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results: [],
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TrendsView />);

    expect(screen.getByText(/no lab results yet/i)).toBeInTheDocument();
    expect(screen.getByText(/import lab results/i)).toBeInTheDocument();
  });

  it('should render biomarker selection when data available', () => {
    const results = [
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, '2345-7', 'Glucose', 95),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TrendsView />);

    expect(screen.getByText('Trends')).toBeInTheDocument();
    expect(screen.getByText('Select Biomarker')).toBeInTheDocument();
  });

  it('should show empty prompt when no biomarker selected', () => {
    const results = [
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, '2345-7', 'Glucose', 95),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TrendsView />);

    expect(screen.getByText(/select a biomarker to view its trend/i)).toBeInTheDocument();
  });

  it('should show trend chart when biomarker is selected', async () => {
    const results = [
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, '2345-7', 'Glucose', 95),
      ]),
      createMockResult(2, '2024-02-15', [
        createMockTestValue(2, 2, '2345-7', 'Glucose', 100),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TrendsView />);

    // Open dropdown
    const selectInput = screen.getByPlaceholderText(/choose a biomarker/i);
    fireEvent.click(selectInput);

    // Wait for dropdown to open
    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    // Select the Glucose option using text content
    const glucoseOption = screen.getByText(/glucose \(2 values\)/i);
    fireEvent.click(glucoseOption);

    // Chart should be visible
    await waitFor(() => {
      expect(screen.getByText('Glucose (mg/dL)')).toBeInTheDocument();
    });
  });

  it('should show compare button when multiple biomarkers available', () => {
    const results = [
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, '2345-7', 'Glucose', 95),
        createMockTestValue(2, 1, '718-7', 'Hemoglobin', 14),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TrendsView />);

    expect(screen.getByText(/compare markers/i)).toBeInTheDocument();
  });

  it('should have date filter inputs', () => {
    const results = [
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, '2345-7', 'Glucose', 95),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TrendsView />);

    expect(screen.getByLabelText(/from date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/to date/i)).toBeInTheDocument();
  });

  it('should have reset button', () => {
    const results = [
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, '2345-7', 'Glucose', 95),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TrendsView />);

    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
  });

  it('links its alert count to the Alerts view', async () => {
    const results = [
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, '2345-7', 'Glucose', 150, 'high'),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    mockAlerts(1);

    const onNavigateToAlerts = vi.fn();
    renderWithProviders(<TrendsView onNavigateToAlerts={onNavigateToAlerts} />);

    await userEvent.click(screen.getByRole('button', { name: /View \d+ alerts?/ }));
    expect(onNavigateToAlerts).toHaveBeenCalled();
  });

  it('opens with the requested biomarker selected', () => {
    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results: [
        createMockResult(1, '2024-01-15', [
          createMockTestValue(1, 1, '2345-7', 'Glucose', 95),
          createMockTestValue(2, 1, '718-7', 'Hemoglobin', 14, 'normal', 'g/dL', 12, 16),
        ]),
        createMockResult(2, '2024-02-15', [
          createMockTestValue(3, 2, '2345-7', 'Glucose', 100),
          createMockTestValue(4, 2, '718-7', 'Hemoglobin', 13, 'normal', 'g/dL', 12, 16),
        ]),
      ],
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TrendsView initialBiomarkerKey="2345-7" />);

    expect(screen.getByText('Glucose (mg/dL)')).toBeInTheDocument();
    // Opened from elsewhere: keyboard focus starts at the top of the view
    expect(screen.getByRole('heading', { name: 'Trends' })).toHaveFocus();
  });

  it('starts a fresh note editor for another biomarker, so a draft is not saved under it', async () => {
    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results: [
        createMockResult(1, '2024-01-15', [
          createMockTestValue(1, 1, '2345-7', 'Glucose', 95),
          createMockTestValue(2, 1, '718-7', 'Hemoglobin', 14, 'normal', 'g/dL', 12, 16),
        ]),
      ],
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });
    renderWithProviders(<TrendsView initialBiomarkerKey="2345-7" />);
    const notes = screen.getByRole('button', { name: /Notes for Glucose section/ }).closest('.mantine-Paper-root') as HTMLElement;
    fireEvent.click(within(notes).getByRole('button', { name: /add note/i }));
    fireEvent.change(within(notes).getByRole('textbox', { name: /note content/i }), {
      target: { value: 'Felt dizzy' },
    });

    fireEvent.click(screen.getByPlaceholderText(/choose a biomarker/i));
    fireEvent.click(await screen.findByText(/hemoglobin \(1 values?\)/i));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Notes for Hemoglobin section/ })).toBeInTheDocument()
    );
    expect(screen.queryByDisplayValue('Felt dizzy')).not.toBeInTheDocument();
  });

  it('should open compare modal when compare button is clicked', async () => {
    const results = [
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, '2345-7', 'Glucose', 95),
        createMockTestValue(2, 1, '718-7', 'Hemoglobin', 14),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TrendsView />);

    // Select a biomarker first
    const selectInput = screen.getByPlaceholderText(/choose a biomarker/i);
    fireEvent.click(selectInput);

    // Wait for dropdown to open
    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    // Select glucose option using text content
    const glucoseOption = screen.getByText(/glucose \(1 value\)/i);
    fireEvent.click(glucoseOption);

    // Wait for chart to appear (single data point shows special view)
    await waitFor(() => {
      expect(screen.getByText('Glucose')).toBeInTheDocument();
    });

    // Click compare button
    const compareButton = screen.getByRole('button', { name: /compare markers/i });
    fireEvent.click(compareButton);

    // Modal should open
    await waitFor(() => {
      expect(screen.getByText('Compare Biomarkers')).toBeInTheDocument();
    });
  });

  it('puts values in a unit the chart unit cannot convert on a line of their own, and says so', async () => {
    const results = [
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, '2345-7', 'Glucose', 100, 'normal', 'mg/dL', 70, 100),
      ]),
      createMockResult(2, '2024-02-15', [
        createMockTestValue(2, 2, '2345-7', 'Glucose', 110, 'high', 'mg/dL', 70, 100),
      ]),
      createMockResult(3, '2024-03-15', [
        createMockTestValue(3, 3, '2345-7', 'Glucose', 150, 'high', 'xyz/dL', 70, 100),
      ]),
    ];
    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TrendsView initialBiomarkerKey="2345-7" />);

    // Plotted on the mg/dL scale, 150 xyz/dL would read as 150 mg/dL
    const latestCard = (await screen.findByText('Latest Value')).closest(
      '.mantine-Paper-root'
    ) as HTMLElement;
    expect(within(latestCard).getByText('110.0')).toBeInTheDocument();
    expect(
      screen.getByText(
        '1 value recorded in xyz/dL is shown on a line of its own: it cannot be converted to mg/dL.'
      )
    ).toBeInTheDocument();

    await userEvent.click(screen.getByPlaceholderText(/choose a biomarker/i));
    expect(await screen.findByRole('option', { name: 'Glucose in xyz/dL (1 value)' })).toBeInTheDocument();
  });

  it('opens on the line a linked value is on, not the line of a same-day value', async () => {
    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results: [
        createMockResult(1, '2024-01-15', [
          createMockTestValue(1, 1, '2345-7', 'Glucose', 100, 'normal', 'mg/dL', 70, 100),
          // The same day, in a unit glucose does not convert to: a line of its own
          createMockTestValue(2, 1, '2345-7', 'Glucose', 150, 'high', 'xyz/dL', 70, 100),
        ]),
        createMockResult(2, '2024-02-15', [
          createMockTestValue(3, 2, '2345-7', 'Glucose', 110, 'high', 'mg/dL', 70, 100),
        ]),
      ],
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(
      <TrendsView initialBiomarkerKey="2345-7" highlightDate={new Date('2024-01-15')} highlightTestValueId={2} />
    );

    // The value's own line, not the test's line its same-day value is on
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/choose a biomarker/i)).toHaveValue('Glucose in xyz/dL (1 value)')
    );
  });

  it('says which values have no unit, and never "converted to ." for a line with none', async () => {
    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results: [
        createMockResult(1, '2024-01-15', [
          createMockTestValue(1, 1, 'unknown:zorblatin', 'Zorblatin', 4, 'normal', ''),
        ]),
        createMockResult(2, '2024-02-15', [
          createMockTestValue(2, 2, 'unknown:zorblatin', 'Zorblatin', 5, 'normal', ''),
          createMockTestValue(3, 2, 'unknown:zorblatin', 'Zorblatin', 9, 'normal', 'mg/L'),
        ]),
      ],
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TrendsView initialBiomarkerKey="unknown:zorblatin" />);

    expect(
      await screen.findByText(
        "1 value recorded in mg/L is shown on a line of its own: it cannot be compared with this line's values, which have no unit."
      )
    ).toBeInTheDocument();
  });

  it('one line for glucose in mg/dL and mmol/L, in the preferred unit', async () => {
    // Glucose under its mass code in mg/dL and its molar code in mmol/L: one
    // test, so 100 mg/dL and 5.55 mmol/L are both shown as ~100 mg/dL
    const results = [
      createMockResult(1, '2024-01-15', [
        // First value in mg/dL (canonical unit)
        createMockTestValue(1, 1, '2345-7', 'Glucose', 100, 'normal', 'mg/dL', 70, 100),
      ]),
      createMockResult(2, '2024-02-15', [
        // Second value in mmol/L (should be converted to mg/dL)
        createMockTestValue(2, 2, '14749-6', 'Glicemia', 5.55, 'normal', 'mmol/L', 3.9, 5.6),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
      undatedResults: [],
      hiddenUndatedCount: 0,
      results,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TrendsView />);

    // Open dropdown
    const selectInput = screen.getByPlaceholderText(/choose a biomarker/i);
    fireEvent.click(selectInput);

    // Wait for dropdown to open
    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    // Select Glucose
    const glucoseOption = screen.getByText(/glucose \(2 values\)/i);
    fireEvent.click(glucoseOption);

    // The chart should display with the canonical unit (mg/dL)
    await waitFor(() => {
      expect(screen.getByText('Glucose (mg/dL)')).toBeInTheDocument();
    });

    // The latest value (5.55 mmol/L) is shown converted to the chart's unit
    const latestCard = screen.getByText('Latest Value').closest('.mantine-Paper-root') as HTMLElement;
    expect(within(latestCard).getByText('100.0')).toBeInTheDocument();
    expect(within(latestCard).getByText('mg/dL')).toBeInTheDocument();
    expect(screen.queryByText('5.55')).not.toBeInTheDocument();
  });
});

/** Renders Trends opened on the given biomarker, recorded twice */
function renderWithTwoValues(
  key: string,
  rawText: string,
  props: Partial<React.ComponentProps<typeof TrendsView>> = {}
): void {
  vi.mocked(useLabResults).mockReturnValue({
    undatedResults: [],
    hiddenUndatedCount: 0,
    results: [
      createMockResult(1, '2024-01-15', [createMockTestValue(1, 1, key, rawText, 95)]),
      createMockResult(2, '2024-02-15', [createMockTestValue(2, 2, key, rawText, 120)]),
    ],
    isLoading: false,
    error: null,
    filters: {},
    setFilters: vi.fn(),
    refresh: vi.fn(),
    deleteResult: vi.fn(),
  });
  renderWithProviders(<TrendsView initialBiomarkerKey={key} {...props} />);
}

describe('TrendsView preferred unit', () => {
  const renderWithGlucose = () => renderWithTwoValues('2345-7', 'Glucose');

  it('shows glucose in the stored preferred unit', () => {
    mockUnitPreferences = { [testKey(catalog, '2345-7')]: 'mmol/L' };
    renderWithGlucose();

    expect(screen.getByRole('textbox', { name: 'Preferred unit' })).toHaveValue('mmol/L');
    expect(screen.getByText('Glucose (mmol/L)')).toBeInTheDocument();
  });

  it('saves the unit chosen in the select', async () => {
    renderWithGlucose();
    await userEvent.click(screen.getByRole('textbox', { name: 'Preferred unit' }));
    await userEvent.click(await screen.findByRole('option', { name: 'mmol/L' }));

    // Kept under the test's LOINC group
    expect(mockSetPreferredUnit).toHaveBeenCalledWith(testKey(catalog, '2345-7'), 'mmol/L');
  });

  it('tells the user when the unit could not be saved', async () => {
    mockSetPreferredUnit.mockRejectedValueOnce(new SaveError('quota'));
    renderWithGlucose();
    await userEvent.click(screen.getByRole('textbox', { name: 'Preferred unit' }));
    await userEvent.click(await screen.findByRole('option', { name: 'mmol/L' }));

    await waitFor(() =>
      expect(mockShowNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Preferred unit not saved',
          message: expect.stringMatching(/no room left/),
          color: 'red',
        })
      )
    );
  });

  it('offers no unit choice for a value that is not a LOINC test', () => {
    renderWithTwoValues('unknown:mysterymarker', 'Mystery Marker');
    expect(screen.getByText('Mystery Marker (mg/dL)')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Preferred unit' })).not.toBeInTheDocument();
  });
});

describe('TrendsView reference link', () => {
  it("opens the chart's biomarker reference page", async () => {
    const onOpenReference = vi.fn();
    renderWithTwoValues('2345-7', 'Glucose', { onOpenReference });

    await userEvent.click(screen.getByRole('button', { name: 'View reference for Glucose' }));

    expect(onOpenReference).toHaveBeenCalledWith('2345-7');
  });

  it('shows the link with a short visible label', () => {
    renderWithTwoValues('2345-7', 'Glucose', { onOpenReference: vi.fn() });

    expect(screen.getByRole('button', { name: 'View reference for Glucose' })).toHaveTextContent(
      /^View reference$/
    );
  });

  it('offers no link for a value that is not a LOINC test', () => {
    renderWithTwoValues('unknown:mysterymarker', 'Mystery Marker', { onOpenReference: vi.fn() });

    expect(screen.getByText('Mystery Marker (mg/dL)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^View reference/ })).not.toBeInTheDocument();
  });

  it('offers the link for a biomarker with a single unit, which has no unit choice', async () => {
    // Neutrophils as a share of white cells has a single unit
    const onOpenReference = vi.fn();
    renderWithTwoValues('770-8', 'Neutrofili %', { onOpenReference });

    expect(screen.queryByRole('textbox', { name: 'Preferred unit' })).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'View reference for Neutrophils Percentage' })
    );
    expect(onOpenReference).toHaveBeenCalledWith('770-8');
  });

  it('offers no link when nowhere to open it', () => {
    renderWithTwoValues('2345-7', 'Glucose');

    expect(screen.getByText('Glucose (mg/dL)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^View reference/ })).not.toBeInTheDocument();
  });
});
