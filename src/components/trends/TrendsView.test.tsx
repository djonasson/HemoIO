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
import type { LabResultWithDetails, EnrichedTestValue } from '@hooks/useLabResults';

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

// Mock biomarker dictionary
vi.mock('@data/biomarkers/dictionary', () => {
  const mock = {
  findBiomarker: vi.fn((name: string) => {
    if (name === 'Glucose') {
      return {
        name: 'Glucose',
        category: 'metabolic',
        canonicalUnit: 'mg/dL',
        alternativeUnits: ['mmol/L'],
      };
    }
    if (name === 'Hemoglobin') {
      return { name: 'Hemoglobin', category: 'cbc', canonicalUnit: 'g/dL' };
    }
    return null;
  }),
  CATEGORY_NAMES: {
    cbc: 'Complete Blood Count',
    metabolic: 'Metabolic Panel',
    lipid: 'Lipid Panel',
    thyroid: 'Thyroid Function',
    iron: 'Iron Studies',
    vitamin: 'Vitamins',
    urinalysis: 'Urinalysis',
    other: 'Other',
  },
  };
  return {
    ...mock,
    // Test data uses arbitrary IDs, so biomarkers are identified by rawText
    getBiomarkerByKey: () => undefined,
    getBiomarkerForTestValue: (tv: { rawText?: string }) => mock.findBiomarker(tv.rawText ?? ''),
    getBiomarkerDisplayName: (tv: { rawText?: string }) =>
      mock.findBiomarker(tv.rawText ?? '')?.name || tv.rawText || 'Unknown biomarker',
  };
});

// Mock ResizeObserver for Recharts
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MantineProvider env="test">
      <DatesProvider settings={{ locale: 'en' }}>{ui}</DatesProvider>
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

describe('TrendsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnitPreferences = {};
    mockSetPreferredUnit.mockReset().mockResolvedValue(undefined);
    mockShowNotification.mockReset();

    // Default mock for useAlerts
    vi.mocked(useAlerts).mockReturnValue({
      alerts: [],
      groupedAlerts: [],
      unacknowledgedCount: 0,
      hiddenCount: 0,
      assessedCount: 1,
      isLoading: false,
      error: null,
      dismissAlert: vi.fn(),
      acknowledgeAlert: vi.fn(),
      refresh: vi.fn(),
      filterByCategory: vi.fn(() => []),
    });
  });

  it('should render loading state', () => {
    vi.mocked(useLabResults).mockReturnValue({
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
        createMockTestValue(1, 1, 'marker-1', 'Glucose', 95),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
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
        createMockTestValue(1, 1, 'marker-1', 'Glucose', 95),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
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
        createMockTestValue(1, 1, 'marker-1', 'Glucose', 95),
      ]),
      createMockResult(2, '2024-02-15', [
        createMockTestValue(2, 2, 'marker-1', 'Glucose', 100),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
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
        createMockTestValue(1, 1, 'marker-1', 'Glucose', 95),
        createMockTestValue(2, 1, 'marker-2', 'Hemoglobin', 14),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
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
        createMockTestValue(1, 1, 'marker-1', 'Glucose', 95),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
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
        createMockTestValue(1, 1, 'marker-1', 'Glucose', 95),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
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
        createMockTestValue(1, 1, 'marker-1', 'Glucose', 150, 'high'),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
      results,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    vi.mocked(useAlerts).mockReturnValue({
      alerts: [
        {
          id: '1',
          type: 'out_of_range',
          severity: 'warning',
          biomarkerKey: 'marker-1',
          biomarkerName: 'Glucose',
          value: 150,
          unit: 'mg/dL',
          status: 'high',
          date: new Date(),
          labName: 'Test Lab',
          labResultId: 1,
          message: 'Glucose is elevated',
        },
      ],
      groupedAlerts: [],
      unacknowledgedCount: 1,
      hiddenCount: 0,
      assessedCount: 1,
      isLoading: false,
      error: null,
      dismissAlert: vi.fn(),
      acknowledgeAlert: vi.fn(),
      refresh: vi.fn(),
      filterByCategory: vi.fn(() => []),
    });

    const onNavigateToAlerts = vi.fn();
    renderWithProviders(<TrendsView onNavigateToAlerts={onNavigateToAlerts} />);

    await userEvent.click(screen.getByRole('button', { name: /View \d+ alerts?/ }));
    expect(onNavigateToAlerts).toHaveBeenCalled();
  });

  it('opens with the requested biomarker selected', () => {
    vi.mocked(useLabResults).mockReturnValue({
      results: [
        createMockResult(1, '2024-01-15', [
          createMockTestValue(1, 1, 'marker-1', 'Glucose', 95),
          createMockTestValue(2, 1, 'marker-2', 'Hemoglobin', 14, 'normal', 'g/dL', 12, 16),
        ]),
        createMockResult(2, '2024-02-15', [
          createMockTestValue(3, 2, 'marker-1', 'Glucose', 100),
          createMockTestValue(4, 2, 'marker-2', 'Hemoglobin', 13, 'normal', 'g/dL', 12, 16),
        ]),
      ],
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TrendsView initialBiomarkerKey="marker-1" />);

    expect(screen.getByText('Glucose (mg/dL)')).toBeInTheDocument();
    // Opened from elsewhere: keyboard focus starts at the top of the view
    expect(screen.getByRole('heading', { name: 'Trends' })).toHaveFocus();
  });

  it('starts a fresh note editor for another biomarker, so a draft is not saved under it', async () => {
    vi.mocked(useLabResults).mockReturnValue({
      results: [
        createMockResult(1, '2024-01-15', [
          createMockTestValue(1, 1, 'marker-1', 'Glucose', 95),
          createMockTestValue(2, 1, 'marker-2', 'Hemoglobin', 14, 'normal', 'g/dL', 12, 16),
        ]),
      ],
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });
    renderWithProviders(<TrendsView initialBiomarkerKey="marker-1" />);
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
        createMockTestValue(1, 1, 'marker-1', 'Glucose', 95),
        createMockTestValue(2, 1, 'marker-2', 'Hemoglobin', 14),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
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

  it('leaves out values in a unit the chart unit cannot convert, and says so', async () => {
    const results = [
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, 'marker-1', 'Glucose', 100, 'normal', 'mg/dL', 70, 100),
      ]),
      createMockResult(2, '2024-02-15', [
        createMockTestValue(2, 2, 'marker-1', 'Glucose', 110, 'high', 'mg/dL', 70, 100),
      ]),
      createMockResult(3, '2024-03-15', [
        createMockTestValue(3, 3, 'marker-1', 'Glucose', 150, 'high', 'xyz/dL', 70, 100),
      ]),
    ];
    vi.mocked(useLabResults).mockReturnValue({
      results,
      isLoading: false,
      error: null,
      filters: {},
      setFilters: vi.fn(),
      refresh: vi.fn(),
      deleteResult: vi.fn(),
    });

    renderWithProviders(<TrendsView initialBiomarkerKey="marker-1" />);

    // Plotted on the mg/dL scale, 150 xyz/dL would read as 150 mg/dL
    const latestCard = (await screen.findByText('Latest Value')).closest(
      '.mantine-Paper-root'
    ) as HTMLElement;
    expect(within(latestCard).getByText('110.0')).toBeInTheDocument();
    expect(
      screen.getByText('1 value recorded in xyz/dL is not shown: it cannot be converted to mg/dL.')
    ).toBeInTheDocument();
  });

  it('should convert values to canonical unit when biomarker has mixed units', async () => {
    // Glucose with values in different units (mg/dL and mmol/L)
    // 100 mg/dL and 5.55 mmol/L should both be displayed as ~100 mg/dL after conversion
    const results = [
      createMockResult(1, '2024-01-15', [
        // First value in mg/dL (canonical unit)
        createMockTestValue(1, 1, 'marker-1', 'Glucose', 100, 'normal', 'mg/dL', 70, 100),
      ]),
      createMockResult(2, '2024-02-15', [
        // Second value in mmol/L (should be converted to mg/dL)
        createMockTestValue(2, 2, 'marker-1', 'Glucose', 5.55, 'normal', 'mmol/L', 3.9, 5.6),
      ]),
    ];

    vi.mocked(useLabResults).mockReturnValue({
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
function renderWithTwoValues(key: string, rawText: string): void {
  vi.mocked(useLabResults).mockReturnValue({
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
  renderWithProviders(<TrendsView initialBiomarkerKey={key} />);
}

describe('TrendsView preferred unit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnitPreferences = {};
    mockSetPreferredUnit.mockReset().mockResolvedValue(undefined);
    mockShowNotification.mockReset();
    vi.mocked(useAlerts).mockReturnValue({
      alerts: [],
      groupedAlerts: [],
      unacknowledgedCount: 0,
      hiddenCount: 0,
      assessedCount: 1,
      isLoading: false,
      error: null,
      dismissAlert: vi.fn(),
      acknowledgeAlert: vi.fn(),
      refresh: vi.fn(),
      filterByCategory: vi.fn(() => []),
    });
  });

  const renderWithGlucose = () => renderWithTwoValues('glucose', 'Glucose');

  it('shows glucose in the stored preferred unit', () => {
    mockUnitPreferences = { glucose: 'mmol/L' };
    renderWithGlucose();

    expect(screen.getByRole('textbox', { name: 'Preferred unit' })).toHaveValue('mmol/L');
    expect(screen.getByText('Glucose (mmol/L)')).toBeInTheDocument();
  });

  it('saves the unit chosen in the select', async () => {
    renderWithGlucose();
    await userEvent.click(screen.getByRole('textbox', { name: 'Preferred unit' }));
    await userEvent.click(await screen.findByRole('option', { name: 'mmol/L' }));

    expect(mockSetPreferredUnit).toHaveBeenCalledWith('glucose', 'mmol/L');
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

  it('offers no unit choice for a biomarker outside the dictionary', () => {
    renderWithTwoValues('mystery', 'Mystery Marker');
    expect(screen.getByText('Mystery Marker (mg/dL)')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Preferred unit' })).not.toBeInTheDocument();
  });
});
