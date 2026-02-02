/**
 * Tests for OutOfRangeAlerts component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { OutOfRangeAlerts } from './OutOfRangeAlerts';
import { useAlerts } from '@hooks/useAlerts';
import type { BiomarkerAlert } from '@hooks/useAlerts';

// Mock useAlerts
vi.mock('@hooks/useAlerts', () => ({
  useAlerts: vi.fn(),
}));

// Mock biomarker dictionary
vi.mock('@data/biomarkers/dictionary', () => ({
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

function renderWithProviders(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

function createMockAlert(id: string, options: Partial<BiomarkerAlert> = {}): BiomarkerAlert {
  return {
    id,
    type: 'out_of_range',
    severity: 'warning',
    biomarkerId: 1,
    biomarkerName: 'Glucose',
    category: 'metabolic',
    value: 150,
    unit: 'mg/dL',
    referenceRange: { low: 70, high: 100 },
    status: 'high',
    date: new Date('2024-01-15'),
    labName: 'Test Lab',
    labResultId: 1,
    message: 'Glucose is elevated at 150 mg/dL',
    acknowledged: false,
    dismissed: false,
    ...options,
  };
}

describe('OutOfRangeAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render loading state', () => {
    vi.mocked(useAlerts).mockReturnValue({
      alerts: [],
      groupedAlerts: [],
      unacknowledgedCount: 0,
      isLoading: true,
      error: null,
      dismissAlert: vi.fn(),
      acknowledgeAlert: vi.fn(),
      clearDismissed: vi.fn(),
      filterByCategory: vi.fn(() => []),
      getAlertsForBiomarker: vi.fn(() => []),
    });

    renderWithProviders(<OutOfRangeAlerts />);

    expect(screen.getByText(/loading alerts/i)).toBeInTheDocument();
  });

  it('should render error state', () => {
    vi.mocked(useAlerts).mockReturnValue({
      alerts: [],
      groupedAlerts: [],
      unacknowledgedCount: 0,
      isLoading: false,
      error: 'Failed to load alerts',
      dismissAlert: vi.fn(),
      acknowledgeAlert: vi.fn(),
      clearDismissed: vi.fn(),
      filterByCategory: vi.fn(() => []),
      getAlertsForBiomarker: vi.fn(() => []),
    });

    renderWithProviders(<OutOfRangeAlerts />);

    expect(screen.getByText(/failed to load alerts/i)).toBeInTheDocument();
  });

  it('should render success state when no alerts', () => {
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

    renderWithProviders(<OutOfRangeAlerts />);

    expect(screen.getByText(/all values within normal range/i)).toBeInTheDocument();
  });

  it('should render alert cards', () => {
    const alerts = [createMockAlert('1')];

    vi.mocked(useAlerts).mockReturnValue({
      alerts,
      groupedAlerts: [],
      unacknowledgedCount: 1,
      isLoading: false,
      error: null,
      dismissAlert: vi.fn(),
      acknowledgeAlert: vi.fn(),
      clearDismissed: vi.fn(),
      filterByCategory: vi.fn(() => alerts),
      getAlertsForBiomarker: vi.fn(() => alerts),
    });

    renderWithProviders(<OutOfRangeAlerts />);

    expect(screen.getByText('Glucose')).toBeInTheDocument();
    expect(screen.getByText(/elevated/i)).toBeInTheDocument();
  });

  it('should display high status badge', () => {
    const alerts = [createMockAlert('1', { status: 'high' })];

    vi.mocked(useAlerts).mockReturnValue({
      alerts,
      groupedAlerts: [],
      unacknowledgedCount: 1,
      isLoading: false,
      error: null,
      dismissAlert: vi.fn(),
      acknowledgeAlert: vi.fn(),
      clearDismissed: vi.fn(),
      filterByCategory: vi.fn(() => alerts),
      getAlertsForBiomarker: vi.fn(() => alerts),
    });

    renderWithProviders(<OutOfRangeAlerts />);

    expect(screen.getByText('high')).toBeInTheDocument();
  });

  it('should display low status badge', () => {
    const alerts = [
      createMockAlert('1', {
        status: 'low',
        message: 'Hemoglobin is low',
        biomarkerName: 'Hemoglobin',
      }),
    ];

    vi.mocked(useAlerts).mockReturnValue({
      alerts,
      groupedAlerts: [],
      unacknowledgedCount: 1,
      isLoading: false,
      error: null,
      dismissAlert: vi.fn(),
      acknowledgeAlert: vi.fn(),
      clearDismissed: vi.fn(),
      filterByCategory: vi.fn(() => alerts),
      getAlertsForBiomarker: vi.fn(() => alerts),
    });

    renderWithProviders(<OutOfRangeAlerts />);

    expect(screen.getByText('low')).toBeInTheDocument();
  });

  it('should call dismissAlert when dismiss button clicked', () => {
    const mockDismiss = vi.fn();
    const alerts = [createMockAlert('1')];

    vi.mocked(useAlerts).mockReturnValue({
      alerts,
      groupedAlerts: [],
      unacknowledgedCount: 1,
      isLoading: false,
      error: null,
      dismissAlert: mockDismiss,
      acknowledgeAlert: vi.fn(),
      clearDismissed: vi.fn(),
      filterByCategory: vi.fn(() => alerts),
      getAlertsForBiomarker: vi.fn(() => alerts),
    });

    renderWithProviders(<OutOfRangeAlerts />);

    const dismissButton = screen.getByRole('button', { name: /dismiss alert/i });
    fireEvent.click(dismissButton);

    expect(mockDismiss).toHaveBeenCalledWith('1');
  });

  it('should call acknowledgeAlert when acknowledge button clicked', () => {
    const mockAcknowledge = vi.fn();
    const alerts = [createMockAlert('1')];

    vi.mocked(useAlerts).mockReturnValue({
      alerts,
      groupedAlerts: [],
      unacknowledgedCount: 1,
      isLoading: false,
      error: null,
      dismissAlert: vi.fn(),
      acknowledgeAlert: mockAcknowledge,
      clearDismissed: vi.fn(),
      filterByCategory: vi.fn(() => alerts),
      getAlertsForBiomarker: vi.fn(() => alerts),
    });

    renderWithProviders(<OutOfRangeAlerts />);

    const acknowledgeButton = screen.getByRole('button', { name: /acknowledge alert/i });
    fireEvent.click(acknowledgeButton);

    expect(mockAcknowledge).toHaveBeenCalledWith('1');
  });

  it('should call onAlertClick when alert is clicked', () => {
    const mockClick = vi.fn();
    const alerts = [createMockAlert('1')];

    vi.mocked(useAlerts).mockReturnValue({
      alerts,
      groupedAlerts: [],
      unacknowledgedCount: 1,
      isLoading: false,
      error: null,
      dismissAlert: vi.fn(),
      acknowledgeAlert: vi.fn(),
      clearDismissed: vi.fn(),
      filterByCategory: vi.fn(() => alerts),
      getAlertsForBiomarker: vi.fn(() => alerts),
    });

    renderWithProviders(<OutOfRangeAlerts onAlertClick={mockClick} />);

    const alertCard = screen.getByRole('article');
    fireEvent.click(alertCard);

    expect(mockClick).toHaveBeenCalledWith(alerts[0]);
  });

  it('should display unacknowledged count badge', () => {
    const alerts = [
      createMockAlert('1'),
      createMockAlert('2', { acknowledged: false }),
    ];

    vi.mocked(useAlerts).mockReturnValue({
      alerts,
      groupedAlerts: [],
      unacknowledgedCount: 2,
      isLoading: false,
      error: null,
      dismissAlert: vi.fn(),
      acknowledgeAlert: vi.fn(),
      clearDismissed: vi.fn(),
      filterByCategory: vi.fn(() => alerts),
      getAlertsForBiomarker: vi.fn(() => alerts),
    });

    renderWithProviders(<OutOfRangeAlerts />);

    expect(screen.getByText('2 new')).toBeInTheDocument();
  });

  it('should show improvement badge for improvement alerts', () => {
    const alerts = [
      createMockAlert('1', {
        type: 'improvement',
        severity: 'positive',
        status: 'normal',
        message: 'Glucose has returned to normal',
      }),
    ];

    vi.mocked(useAlerts).mockReturnValue({
      alerts,
      groupedAlerts: [],
      unacknowledgedCount: 0,
      isLoading: false,
      error: null,
      dismissAlert: vi.fn(),
      acknowledgeAlert: vi.fn(),
      clearDismissed: vi.fn(),
      filterByCategory: vi.fn(() => alerts),
      getAlertsForBiomarker: vi.fn(() => alerts),
    });

    renderWithProviders(<OutOfRangeAlerts />);

    expect(screen.getByText('Improved')).toBeInTheDocument();
  });

  it('should show trend badge for trend alerts', () => {
    const alerts = [
      createMockAlert('1', {
        type: 'trend',
        message: 'Glucose has been consistently elevated',
      }),
    ];

    vi.mocked(useAlerts).mockReturnValue({
      alerts,
      groupedAlerts: [],
      unacknowledgedCount: 1,
      isLoading: false,
      error: null,
      dismissAlert: vi.fn(),
      acknowledgeAlert: vi.fn(),
      clearDismissed: vi.fn(),
      filterByCategory: vi.fn(() => alerts),
      getAlertsForBiomarker: vi.fn(() => alerts),
    });

    renderWithProviders(<OutOfRangeAlerts />);

    expect(screen.getByText('Trend')).toBeInTheDocument();
  });

  it('should limit visible alerts based on maxVisible', () => {
    const alerts = Array.from({ length: 10 }, (_, i) =>
      createMockAlert(`${i}`, { biomarkerName: `Marker ${i}` })
    );

    vi.mocked(useAlerts).mockReturnValue({
      alerts,
      groupedAlerts: [],
      unacknowledgedCount: 10,
      isLoading: false,
      error: null,
      dismissAlert: vi.fn(),
      acknowledgeAlert: vi.fn(),
      clearDismissed: vi.fn(),
      filterByCategory: vi.fn(() => alerts),
      getAlertsForBiomarker: vi.fn(() => alerts),
    });

    renderWithProviders(<OutOfRangeAlerts maxVisible={3} />);

    // Should show "show more" button
    expect(screen.getByText(/show 7 more alerts/i)).toBeInTheDocument();

    // Should only show 3 alerts initially
    const alertCards = screen.getAllByRole('article');
    expect(alertCards).toHaveLength(3);
  });

  it('should expand to show all alerts when show more is clicked', async () => {
    const alerts = Array.from({ length: 10 }, (_, i) =>
      createMockAlert(`${i}`, { biomarkerName: `Marker ${i}` })
    );

    vi.mocked(useAlerts).mockReturnValue({
      alerts,
      groupedAlerts: [],
      unacknowledgedCount: 10,
      isLoading: false,
      error: null,
      dismissAlert: vi.fn(),
      acknowledgeAlert: vi.fn(),
      clearDismissed: vi.fn(),
      filterByCategory: vi.fn(() => alerts),
      getAlertsForBiomarker: vi.fn(() => alerts),
    });

    renderWithProviders(<OutOfRangeAlerts maxVisible={3} />);

    const showMoreButton = screen.getByRole('button', { name: /show 7 more/i });
    fireEvent.click(showMoreButton);

    await waitFor(() => {
      const alertCards = screen.getAllByRole('article');
      expect(alertCards).toHaveLength(10);
    });
  });

  it('should hide acknowledge button for acknowledged alerts', () => {
    const alerts = [createMockAlert('1', { acknowledged: true })];

    vi.mocked(useAlerts).mockReturnValue({
      alerts,
      groupedAlerts: [],
      unacknowledgedCount: 0,
      isLoading: false,
      error: null,
      dismissAlert: vi.fn(),
      acknowledgeAlert: vi.fn(),
      clearDismissed: vi.fn(),
      filterByCategory: vi.fn(() => alerts),
      getAlertsForBiomarker: vi.fn(() => alerts),
    });

    renderWithProviders(<OutOfRangeAlerts />);

    expect(screen.queryByRole('button', { name: /acknowledge/i })).not.toBeInTheDocument();
  });

  it('should display lab name and relative time', () => {
    const alerts = [
      createMockAlert('1', {
        labName: 'Quest Diagnostics',
        date: new Date(), // Today
      }),
    ];

    vi.mocked(useAlerts).mockReturnValue({
      alerts,
      groupedAlerts: [],
      unacknowledgedCount: 1,
      isLoading: false,
      error: null,
      dismissAlert: vi.fn(),
      acknowledgeAlert: vi.fn(),
      clearDismissed: vi.fn(),
      filterByCategory: vi.fn(() => alerts),
      getAlertsForBiomarker: vi.fn(() => alerts),
    });

    renderWithProviders(<OutOfRangeAlerts />);

    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText(/quest diagnostics/i)).toBeInTheDocument();
  });
});
