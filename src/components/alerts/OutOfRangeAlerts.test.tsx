/**
 * Tests for OutOfRangeAlerts component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { OutOfRangeAlerts } from './OutOfRangeAlerts';
import { useAlerts } from '@hooks/useAlerts';
import type { BiomarkerAlert } from '@hooks/useAlerts';
import type { OutOfRangeAlertsProps } from './OutOfRangeAlerts';

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
  return render(<MantineProvider env="test">{ui}</MantineProvider>);
}

function createMockAlert(id: string, options: Partial<BiomarkerAlert> = {}): BiomarkerAlert {
  return {
    id,
    type: 'out_of_range',
    severity: 'warning',
    biomarkerKey: 'marker-1',
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
    ...options,
  };
}

function alert(options: Partial<BiomarkerAlert> = {}): BiomarkerAlert {
  return createMockAlert(options.id ?? '1', options);
}

function mockAlerts(alerts: BiomarkerAlert[]): void {
  vi.mocked(useAlerts).mockReturnValue({
    alerts,
    groupedAlerts: [],
    unacknowledgedCount: alerts.length,
    isLoading: false,
    error: null,
    dismissAlert: vi.fn(),
    acknowledgeAlert: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn(),
    filterByCategory: vi.fn(() => alerts),
  });
}

function renderAlerts(props: OutOfRangeAlertsProps = {}) {
  return renderWithProviders(<OutOfRangeAlerts {...props} />);
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
      acknowledgeAlert: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn(),
      filterByCategory: vi.fn(() => []),
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
      acknowledgeAlert: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn(),
      filterByCategory: vi.fn(() => []),
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
      acknowledgeAlert: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn(),
      filterByCategory: vi.fn(() => []),
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
      acknowledgeAlert: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn(),
      filterByCategory: vi.fn(() => alerts),
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
      acknowledgeAlert: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn(),
      filterByCategory: vi.fn(() => alerts),
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
      acknowledgeAlert: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn(),
      filterByCategory: vi.fn(() => alerts),
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
      acknowledgeAlert: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn(),
      filterByCategory: vi.fn(() => alerts),
    });

    renderWithProviders(<OutOfRangeAlerts />);

    const dismissButton = screen.getByRole('button', { name: /dismiss alert/i });
    fireEvent.click(dismissButton);

    expect(mockDismiss).toHaveBeenCalledWith('1');
  });

  it('should call acknowledgeAlert when acknowledge button clicked', () => {
    const mockAcknowledge = vi.fn().mockResolvedValue(undefined);
    const alerts = [createMockAlert('1')];

    vi.mocked(useAlerts).mockReturnValue({
      alerts,
      groupedAlerts: [],
      unacknowledgedCount: 1,
      isLoading: false,
      error: null,
      dismissAlert: vi.fn(),
      acknowledgeAlert: mockAcknowledge,
      refresh: vi.fn(),
      filterByCategory: vi.fn(() => alerts),
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
      acknowledgeAlert: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn(),
      filterByCategory: vi.fn(() => alerts),
    });

    renderWithProviders(<OutOfRangeAlerts onAlertClick={mockClick} />);

    const alertCard = screen.getByRole('article');
    fireEvent.click(alertCard);

    expect(mockClick).toHaveBeenCalledWith(alerts[0]);
  });

  it('should display unacknowledged count badge', () => {
    const alerts = [
      createMockAlert('1'),
      createMockAlert('2'),
    ];

    vi.mocked(useAlerts).mockReturnValue({
      alerts,
      groupedAlerts: [],
      unacknowledgedCount: 2,
      isLoading: false,
      error: null,
      dismissAlert: vi.fn(),
      acknowledgeAlert: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn(),
      filterByCategory: vi.fn(() => alerts),
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
      acknowledgeAlert: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn(),
      filterByCategory: vi.fn(() => alerts),
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
      acknowledgeAlert: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn(),
      filterByCategory: vi.fn(() => alerts),
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
      acknowledgeAlert: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn(),
      filterByCategory: vi.fn(() => alerts),
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
      acknowledgeAlert: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn(),
      filterByCategory: vi.fn(() => alerts),
    });

    renderWithProviders(<OutOfRangeAlerts maxVisible={3} />);

    const showMoreButton = screen.getByRole('button', { name: /show 7 more/i });
    fireEvent.click(showMoreButton);

    await waitFor(() => {
      const alertCards = screen.getAllByRole('article');
      expect(alertCards).toHaveLength(10);
    });
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
      acknowledgeAlert: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn(),
      filterByCategory: vi.fn(() => alerts),
    });

    renderWithProviders(<OutOfRangeAlerts />);

    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText(/quest diagnostics/i)).toBeInTheDocument();
  });
  it('colours the indicator by direction: high red, low orange', () => {
    mockAlerts([
      alert({ id: 'a', biomarkerName: 'Glucose', status: 'high', severity: 'critical' }),
      alert({ id: 'b', biomarkerName: 'Hemoglobin', status: 'low', severity: 'critical' }),
    ]);
    renderAlerts();

    expect(screen.getByRole('article', { name: /^Alert for Glucose:/ })).toHaveStyle({
      borderLeftColor: 'var(--mantine-color-red-6)',
    });
    expect(screen.getByRole('article', { name: /^Alert for Hemoglobin:/ })).toHaveStyle({
      borderLeftColor: 'var(--mantine-color-orange-6)',
    });
  });

  it('announces severity and direction in the accessible name', () => {
    mockAlerts([
      alert({
        biomarkerName: 'Glucose',
        status: 'high',
        severity: 'critical',
        message: 'Glucose is high at 150 mg/dL',
      }),
    ]);
    renderAlerts();

    expect(screen.getByRole('article')).toHaveAccessibleName(
      'Alert for Glucose: critical, high. Glucose is high at 150 mg/dL'
    );
  });

  it('gives critical alerts stronger styling than warnings', () => {
    mockAlerts([
      alert({ id: 'a', biomarkerName: 'Glucose', severity: 'critical' }),
      alert({
        id: 'b',
        biomarkerName: 'Hemoglobin',
        severity: 'warning',
        status: 'low',
        message: 'Hemoglobin is low at 10 g/dL',
      }),
    ]);
    renderAlerts();

    expect(screen.getByRole('article', { name: /Glucose/ })).toHaveStyle({ borderLeftWidth: '6px' });
    expect(screen.getByRole('article', { name: /Hemoglobin/ })).toHaveStyle({
      borderLeftWidth: '4px',
    });
    expect(
      within(screen.getByRole('article', { name: /Glucose/ })).getByText('Critical')
    ).toBeInTheDocument();
  });

  it('opens the alert with Enter when it is focused', async () => {
    const onAlertClick = vi.fn();
    mockAlerts([alert({ biomarkerName: 'Glucose' })]);
    renderAlerts({ onAlertClick });

    const card = screen.getByRole('article');
    card.focus();
    await userEvent.keyboard('{Enter}');

    expect(onAlertClick).toHaveBeenCalledWith(
      expect.objectContaining({ biomarkerName: 'Glucose' })
    );
  });
  it('lets keyboard users expand a biomarker group', async () => {
    const glucose = [alert({ id: 'a' }), alert({ id: 'b', date: new Date('2024-02-15') })];
    const hemoglobin = [alert({ id: 'c', biomarkerKey: 'marker-2', biomarkerName: 'Hemoglobin', status: 'low' })];
    mockAlerts([...glucose, ...hemoglobin]);
    vi.mocked(useAlerts).mockReturnValue({
      ...vi.mocked(useAlerts)(),
      groupedAlerts: [
        { biomarkerKey: 'marker-1', biomarkerName: 'Glucose', alerts: glucose, latestAlert: glucose[0], unacknowledgedCount: 2, severity: 'warning' },
        { biomarkerKey: 'marker-2', biomarkerName: 'Hemoglobin', alerts: hemoglobin, latestAlert: hemoglobin[0], unacknowledgedCount: 1, severity: 'warning' },
      ],
    });
    renderAlerts();

    const toggle = screen.getByRole('button', { name: 'Glucose: 2 alerts' });
    toggle.focus();
    expect(toggle).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAccessibleName();
    }
  });

  it('lets keyboard users read the full date', async () => {
    mockAlerts([alert({ date: new Date('2024-01-15T12:00:00Z') })]);
    renderAlerts();

    const time = screen.getByText(/ago$/);
    expect(time.tagName).toBe('TIME');
    act(() => time.focus());
    expect(time).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      new Date('2024-01-15T12:00:00Z').toLocaleDateString()
    );
  });

  it('points the icon of a trend alert in the direction of the trend', () => {
    mockAlerts([
      alert({ type: 'trend', status: 'high', direction: 'decreasing', message: 'Consistently decreasing' }),
    ]);
    const { container } = renderAlerts();

    expect(container.querySelector('.tabler-icon-trending-down')).not.toBeNull();
    expect(container.querySelector('.tabler-icon-trending-up')).toBeNull();
  });

  it('shows an error when an acknowledgement cannot be saved', async () => {
    mockAlerts([alert()]);
    vi.mocked(useAlerts).mockReturnValue({
      ...vi.mocked(useAlerts)(),
      acknowledgeAlert: vi.fn().mockRejectedValue(new Error('quota')),
    });
    renderAlerts();

    await userEvent.click(screen.getByRole('button', { name: 'Acknowledge alert' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not save/i);
  });
});
