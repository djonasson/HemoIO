/**
 * Tests for AlertsView
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { groupAlerts } from '@services/alerts';
import { AlertsView } from './AlertsView';
import { useAlerts } from '@hooks/useAlerts';
import type { BiomarkerAlert } from '@hooks/useAlerts';

vi.mock('@hooks/useAlerts', () => ({
  useAlerts: vi.fn(),
}));

vi.mock('@data/biomarkers/dictionary', () => ({
  CATEGORY_NAMES: { metabolic: 'Metabolic Panel' },
}));

function alert(options: Partial<BiomarkerAlert> = {}): BiomarkerAlert {
  return {
    id: '1',
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
    message: 'Glucose is high at 150 mg/dL (reference 70 - 100 mg/dL)',
    ...options,
  };
}

function mockAlerts(alerts: BiomarkerAlert[]): void {
  vi.mocked(useAlerts).mockReturnValue({
    alerts,
    groups: groupAlerts(alerts, {}, {}).groups,
    unacknowledgedCount: alerts.length,
    hiddenCount: 0,
    assessedCount: 1,
    isLoading: false,
    error: null,
    dismissGroup: vi.fn(),
    acknowledgeGroup: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn(),
  });
}

describe('AlertsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the trend for the clicked alert', async () => {
    const date = new Date('2024-03-10T10:00:00Z');
    mockAlerts([alert({ biomarkerKey: 'glucose', biomarkerName: 'Glucose', date })]);
    const onOpenTrend = vi.fn();
    render(
      <MantineProvider env="test">
        <AlertsView onOpenTrend={onOpenTrend} />
      </MantineProvider>
    );

    await userEvent.click(screen.getByRole('article', { name: /^Alert for Glucose:/ }));

    expect(onOpenTrend).toHaveBeenCalledWith('glucose', date);
  });

  it("opens the trend at an earlier result's own date", async () => {
    const earlier = new Date('2024-01-15T10:00:00Z');
    mockAlerts([
      alert({ id: 'a', biomarkerKey: 'glucose', date: earlier }),
      alert({ id: 'b', biomarkerKey: 'glucose', date: new Date('2024-03-10T10:00:00Z') }),
    ]);
    const onOpenTrend = vi.fn();
    render(
      <MantineProvider env="test">
        <AlertsView onOpenTrend={onOpenTrend} />
      </MantineProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Show 1 earlier result' }));
    const list = await screen.findByRole('list', { name: 'Earlier Glucose results' });
    await userEvent.click(within(list).getByRole('button'));

    expect(onOpenTrend).toHaveBeenCalledTimes(1);
    expect(onOpenTrend).toHaveBeenCalledWith('glucose', earlier);
  });
});
