/**
 * Tests for TrendsView component
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { TrendsView } from './TrendsView';
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

// Mock unit conversion service
vi.mock('@services/units', () => ({
  convertValue: vi.fn((biomarkerName: string, value: number, fromUnit: string, toUnit: string) => {
    // Simple mock conversion for Glucose: mmol/L to mg/dL (multiply by 18.0182)
    if (biomarkerName === 'Glucose' && fromUnit === 'mmol/L' && toUnit === 'mg/dL') {
      return { convertedValue: Math.round(value * 18.0182), originalValue: value, originalUnit: fromUnit, targetUnit: toUnit, precision: 0 };
    }
    return { convertedValue: value, originalValue: value, originalUnit: fromUnit, targetUnit: toUnit, precision: 2 };
  }),
  canConvert: vi.fn((biomarkerName: string, fromUnit: string, toUnit: string) => {
    // Glucose supports conversion between mg/dL and mmol/L
    if (biomarkerName === 'Glucose') {
      return (fromUnit === 'mmol/L' && toUnit === 'mg/dL') || (fromUnit === 'mg/dL' && toUnit === 'mmol/L');
    }
    return false;
  }),
}));

// Mock biomarker dictionary
vi.mock('@data/biomarkers/dictionary', () => ({
  findBiomarker: vi.fn((name: string) => {
    if (name === 'Glucose') {
      return { name: 'Glucose', category: 'metabolic', canonicalUnit: 'mg/dL' };
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

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <MantineProvider>
      <DatesProvider settings={{ locale: 'en' }}>{ui}</DatesProvider>
    </MantineProvider>
  );
}

function createMockTestValue(
  id: number,
  labResultId: number,
  biomarkerId: number,
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
    biomarkerId,
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

    // Default mock for useAlerts
    vi.mocked(useAlerts).mockReturnValue({
      alerts: [],
      groupedAlerts: [],
      unacknowledgedCount: 0,
      isLoading: false,
      error: null,
      dismissAlert: vi.fn(),
      acknowledgeAlert: vi.fn(),
      clearDismissed: vi.fn(),
      filterByCategory: vi.fn(() => []),
      getAlertsForBiomarker: vi.fn(() => []),
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
        createMockTestValue(1, 1, 1, 'Glucose', 95),
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
        createMockTestValue(1, 1, 1, 'Glucose', 95),
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
        createMockTestValue(1, 1, 1, 'Glucose', 95),
      ]),
      createMockResult(2, '2024-02-15', [
        createMockTestValue(2, 2, 1, 'Glucose', 100),
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
        createMockTestValue(1, 1, 1, 'Glucose', 95),
        createMockTestValue(2, 1, 2, 'Hemoglobin', 14),
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
        createMockTestValue(1, 1, 1, 'Glucose', 95),
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
        createMockTestValue(1, 1, 1, 'Glucose', 95),
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

  it('should display alert count when alerts exist', () => {
    const results = [
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, 1, 'Glucose', 150, 'high'),
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
          biomarkerId: 1,
          biomarkerName: 'Glucose',
          value: 150,
          unit: 'mg/dL',
          status: 'high',
          date: new Date(),
          labName: 'Test Lab',
          labResultId: 1,
          message: 'Glucose is elevated',
          acknowledged: false,
          dismissed: false,
        },
      ],
      groupedAlerts: [],
      unacknowledgedCount: 1,
      isLoading: false,
      error: null,
      dismissAlert: vi.fn(),
      acknowledgeAlert: vi.fn(),
      clearDismissed: vi.fn(),
      filterByCategory: vi.fn(() => []),
      getAlertsForBiomarker: vi.fn(() => []),
    });

    renderWithProviders(<TrendsView />);

    expect(screen.getByText(/1 alerts/i)).toBeInTheDocument();
  });

  it('should open compare modal when compare button is clicked', async () => {
    const results = [
      createMockResult(1, '2024-01-15', [
        createMockTestValue(1, 1, 1, 'Glucose', 95),
        createMockTestValue(2, 1, 2, 'Hemoglobin', 14),
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

  it('should convert values to canonical unit when biomarker has mixed units', async () => {
    // Glucose with values in different units (mg/dL and mmol/L)
    // 100 mg/dL and 5.55 mmol/L should both be displayed as ~100 mg/dL after conversion
    const results = [
      createMockResult(1, '2024-01-15', [
        // First value in mg/dL (canonical unit)
        createMockTestValue(1, 1, 1, 'Glucose', 100, 'normal', 'mg/dL', 70, 100),
      ]),
      createMockResult(2, '2024-02-15', [
        // Second value in mmol/L (should be converted to mg/dL)
        createMockTestValue(2, 2, 1, 'Glucose', 5.55, 'normal', 'mmol/L', 3.9, 5.6),
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

    // Verify that the unit conversion function was called
    const { canConvert, convertValue } = await import('@services/units');
    expect(canConvert).toHaveBeenCalledWith('Glucose', 'mmol/L', 'mg/dL');
    expect(convertValue).toHaveBeenCalledWith('Glucose', 5.55, 'mmol/L', 'mg/dL');
  });
});
