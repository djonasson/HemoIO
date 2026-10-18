/**
 * Tests for AlertsView
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
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
    groupedAlerts: [],
    unacknowledgedCount: alerts.length,
    isLoading: false,
    error: null,
    dismissAlert: vi.fn(),
    acknowledgeAlert: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn(),
    filterByCategory: vi.fn(() => alerts),
    getAlertsForBiomarker: vi.fn(() => alerts),
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
});
