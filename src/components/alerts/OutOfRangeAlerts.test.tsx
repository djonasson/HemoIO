/**
 * Tests for OutOfRangeAlerts: the list of alert cards, one per test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { groupAlerts } from '@services/alerts';
import { OutOfRangeAlerts } from './OutOfRangeAlerts';
import { useAlerts } from '@hooks/useAlerts';
import type { BiomarkerAlert, UseAlertsResult } from '@hooks/useAlerts';
import type { OutOfRangeAlertsProps } from './OutOfRangeAlerts';

vi.mock('@hooks/useAlerts', () => ({
  useAlerts: vi.fn(),
}));

vi.mock('@data/biomarkers/dictionary', () => ({
  CATEGORY_NAMES: {
    cbc: 'Complete Blood Count',
    metabolic: 'Metabolic Panel',
    lipid: 'Lipid Panel',
  },
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(<MantineProvider env="test">{ui}</MantineProvider>);
}

function alert(options: Partial<BiomarkerAlert> = {}): BiomarkerAlert {
  return {
    id: '1',
    type: 'out_of_range',
    severity: 'warning',
    biomarkerKey: 'glucose',
    biomarkerName: 'Glucose',
    category: 'metabolic',
    value: 150,
    unit: 'mg/dL',
    referenceRange: { low: 70, high: 100 },
    status: 'high',
    date: new Date('2024-01-15T10:00:00Z'),
    labName: 'Test Lab',
    labResultId: 1,
    backInRange: false,
    message: 'Glucose is elevated at 150 mg/dL',
    ...options,
  };
}

/** useAlerts for these alerts, none acknowledged or dismissed */
function mockAlerts(alerts: BiomarkerAlert[], overrides: Partial<UseAlertsResult> = {}): UseAlertsResult {
  const { groups, hiddenCount } = groupAlerts(alerts, {}, {});
  const result: UseAlertsResult = {
    groups,
    unacknowledgedCount: groups.reduce((sum, g) => sum + g.newCount, 0),
    hiddenCount,
    assessedCount: 1,
    isLoading: false,
    error: null,
    dismissGroup: vi.fn(),
    acknowledgeGroup: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn(),
    ...overrides,
  };
  vi.mocked(useAlerts).mockReturnValue(result);
  return result;
}

function renderAlerts(props: OutOfRangeAlertsProps = {}) {
  return renderWithProviders(<OutOfRangeAlerts {...props} />);
}

/** One alert for each of `count` different tests */
function manyTests(count: number): BiomarkerAlert[] {
  return Array.from({ length: count }, (_, i) =>
    alert({ id: `${i}`, biomarkerKey: `marker-${i}`, biomarkerName: `Marker ${i}` })
  );
}

describe('OutOfRangeAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render loading state', () => {
    mockAlerts([], { isLoading: true });
    renderAlerts();

    expect(screen.getByText(/loading alerts/i)).toBeInTheDocument();
  });

  it('should render error state', () => {
    mockAlerts([], { error: 'Failed to load alerts' });
    renderAlerts();

    expect(screen.getByText(/failed to load alerts/i)).toBeInTheDocument();
  });

  it('should render success state when no alerts', () => {
    mockAlerts([]);
    renderAlerts();

    expect(screen.getByText(/all values within normal range/i)).toBeInTheDocument();
  });

  it('does not claim values are normal when none was checked against a range', () => {
    mockAlerts([], { assessedCount: 0 });
    renderAlerts();

    expect(screen.queryByText(/all values within normal range/i)).not.toBeInTheDocument();
    expect(screen.getByText('No values to check yet')).toBeInTheDocument();
  });

  it('does not claim values are normal when every card was acknowledged', () => {
    mockAlerts([], { hiddenCount: 2 });
    renderAlerts();

    expect(screen.getByText('No new alerts')).toBeInTheDocument();
    expect(screen.queryByText(/all values within normal range/i)).not.toBeInTheDocument();
  });

  it('shows one card per test, and no separate summary', () => {
    mockAlerts([
      alert({ id: 'a' }),
      alert({ id: 'b', date: new Date('2024-03-10T10:00:00Z') }),
      alert({ id: 'c', biomarkerKey: 'hb', biomarkerName: 'Hemoglobin', status: 'low' }),
    ]);
    renderAlerts();

    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByRole('article', { name: /^Alert for Glucose:/ })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: /^Alert for Hemoglobin:/ })).toBeInTheDocument();
    expect(screen.queryByText('By Biomarker')).not.toBeInTheDocument();
  });

  it('shows how many results are new in the header', () => {
    mockAlerts([alert({ id: 'a' }), alert({ id: 'b', date: new Date('2024-03-10T10:00:00Z') })]);
    renderAlerts();

    expect(screen.getByText('2 new')).toBeInTheDocument();
  });

  it('opens the trend of the clicked card', async () => {
    const onAlertClick = vi.fn();
    mockAlerts([alert()]);
    renderAlerts({ onAlertClick });

    await userEvent.click(screen.getByRole('article'));

    expect(onAlertClick).toHaveBeenCalledWith(expect.objectContaining({ biomarkerKey: 'glucose' }));
  });

  it("acknowledges and dismisses a card's whole test", async () => {
    const { acknowledgeGroup, dismissGroup } = mockAlerts([alert()]);
    renderAlerts();

    await userEvent.click(screen.getByRole('button', { name: 'Acknowledge all Glucose results' }));
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss Glucose alert' }));

    expect(acknowledgeGroup).toHaveBeenCalledWith(expect.objectContaining({ biomarkerKey: 'glucose' }));
    expect(dismissGroup).toHaveBeenCalledWith(expect.objectContaining({ biomarkerKey: 'glucose' }));
  });

  it('shows an error when an acknowledgement cannot be saved', async () => {
    mockAlerts([alert()], { acknowledgeGroup: vi.fn().mockRejectedValue(new Error('quota')) });
    renderAlerts();

    await userEvent.click(screen.getByRole('button', { name: 'Acknowledge all Glucose results' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not save/i);
  });

  it('limits the visible cards to maxVisible', () => {
    mockAlerts(manyTests(10));
    renderAlerts({ maxVisible: 3 });

    expect(screen.getByRole('button', { name: 'Show 7 more alerts' })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });

  it('shows every card when show more is clicked', async () => {
    mockAlerts(manyTests(10));
    renderAlerts({ maxVisible: 3 });

    await userEvent.click(screen.getByRole('button', { name: 'Show 7 more alerts' }));

    expect(screen.getAllByRole('article')).toHaveLength(10);
  });

  it('filters cards by category', async () => {
    mockAlerts([
      alert({ id: 'm' }),
      alert({ id: 'c', category: 'cbc', biomarkerName: 'Hemoglobin', biomarkerKey: 'hb' }),
    ]);
    renderAlerts();

    await userEvent.click(screen.getByRole('textbox', { name: 'Filter alerts by category' }));
    await userEvent.click(await screen.findByRole('option', { name: /^Metabolic/ }));

    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('article', { name: /^Alert for Glucose:/ })).toBeInTheDocument();
  });

  it('drops a category filter once that category has no cards left', async () => {
    const metabolic = alert({ id: 'm' });
    const cbc = alert({ id: 'c', category: 'cbc', biomarkerName: 'Hemoglobin', biomarkerKey: 'hb' });

    mockAlerts([metabolic, cbc]);
    const { rerender } = renderAlerts();
    await userEvent.click(screen.getByRole('textbox', { name: 'Filter alerts by category' }));
    await userEvent.click(await screen.findByRole('option', { name: /^Metabolic/ }));

    // Glucose is acknowledged: no metabolic card remains
    mockAlerts([cbc]);
    rerender(
      <MantineProvider env="test">
        <OutOfRangeAlerts />
      </MantineProvider>
    );

    expect(screen.getByRole('article', { name: /^Alert for Hemoglobin:/ })).toBeInTheDocument();
  });
});
