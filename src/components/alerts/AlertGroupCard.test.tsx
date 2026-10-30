/**
 * Tests for AlertGroupCard: one test's alert card
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { groupAlerts } from '@services/alerts';
import { AlertGroupCard } from './AlertGroupCard';
import type { BiomarkerAlert, GroupedAlert } from '@hooks/useAlerts';

vi.mock('@data/biomarkers/dictionary', () => ({
  CATEGORY_NAMES: { metabolic: 'Metabolic Panel' },
}));

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
    latestStatus: 'high',
    message: 'Glucose is high at 150 mg/dL (reference 70 - 100 mg/dL)',
    ...options,
  };
}

/** The card the alerts make, with these acknowledgements */
function groupOf(
  alerts: BiomarkerAlert[],
  acknowledgedThrough: Record<string, Date> = {}
): GroupedAlert {
  return groupAlerts(alerts, acknowledgedThrough, {}).groups[0];
}

function renderCard(group: GroupedAlert) {
  const props = {
    group,
    onAcknowledge: vi.fn(),
    onDismiss: vi.fn(),
    onOpen: vi.fn<(alert: BiomarkerAlert) => void>(),
  };
  render(
    <MantineProvider env="test">
      <AlertGroupCard {...props} />
    </MantineProvider>
  );
  return props;
}

const THREE_GLUCOSE = [
  alert({ id: 'a', value: 150, date: new Date('2024-01-15T10:00:00Z'), labName: 'January Lab' }),
  alert({ id: 'b', value: 140, date: new Date('2024-03-10T10:00:00Z'), labName: 'March Lab' }),
  alert({
    id: 'c',
    value: 130,
    date: new Date('2024-05-20T10:00:00Z'),
    labName: 'May Lab',
    message: 'Glucose is high at 130 mg/dL (reference 70 - 100 mg/dL)',
  }),
];

describe('AlertGroupCard', () => {
  it('shows the latest result and how many results are new', () => {
    renderCard(groupOf(THREE_GLUCOSE, { glucose: new Date('2024-01-15T10:00:00Z') }));

    const card = screen.getByRole('article', { name: /^Alert for Glucose:/ });
    expect(card).toHaveTextContent('Glucose is high at 130 mg/dL');
    expect(card).toHaveTextContent('May Lab');
    expect(within(card).getByText('3 results · 2 new')).toBeInTheDocument();
  });

  it('uses the singular for one result', () => {
    renderCard(groupOf([alert()]));

    expect(screen.getByText('1 result · 1 new')).toBeInTheDocument();
  });

  it('leaves out the new count when no result is new', () => {
    renderCard(
      groupOf(
        [
          alert({ id: 'r' }),
          alert({
            id: 'i',
            type: 'improvement',
            severity: 'positive',
            status: 'normal',
            date: new Date('2024-03-10T10:00:00Z'),
            message: 'Improved: Glucose now within range',
          }),
        ],
        { glucose: new Date('2024-01-15T10:00:00Z') }
      )
    );

    expect(screen.getByText('1 result', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Improved')).toBeInTheDocument();
  });

  it('announces severity, direction and counts in the accessible name', () => {
    renderCard(groupOf([alert({ severity: 'critical', message: 'Glucose is high at 150 mg/dL' })]));

    expect(screen.getByRole('article')).toHaveAccessibleName(
      'Alert for Glucose: critical, high. Glucose is high at 150 mg/dL. 1 result, 1 new'
    );
  });

  it('colours the indicator by direction: high red, low orange', () => {
    renderCard(groupOf([alert({ status: 'low', message: 'low' })]));

    expect(screen.getByRole('article')).toHaveStyle({
      borderLeftColor: 'var(--mantine-color-orange-6)',
    });
  });

  it('gives critical cards stronger styling, with a Critical badge', () => {
    renderCard(groupOf([alert({ severity: 'critical' })]));

    const card = screen.getByRole('article');
    expect(card).toHaveStyle({ borderLeftWidth: '6px' });
    expect(within(card).getByText('Critical')).toBeInTheDocument();
  });

  it('shows a trend on the card of its test', () => {
    const results = [11.5, 11, 10.5, 10].map((value, i) =>
      alert({
        id: `r${i}`,
        biomarkerName: 'Hemoglobin',
        biomarkerKey: 'hemoglobin',
        status: 'low',
        value,
        date: new Date(`2024-0${i + 1}-10T10:00:00Z`),
      })
    );
    const trend = alert({
      id: 't',
      type: 'trend',
      biomarkerName: 'Hemoglobin',
      biomarkerKey: 'hemoglobin',
      status: 'low',
      direction: 'decreasing',
      date: new Date('2024-04-10T10:00:00Z'),
      message: 'Consistently decreasing over 3 months',
    });
    const { container } = render(
      <MantineProvider env="test">
        <AlertGroupCard
          group={groupOf([...results, trend])}
          onAcknowledge={vi.fn()}
          onDismiss={vi.fn()}
        />
      </MantineProvider>
    );

    const card = screen.getByRole('article');
    expect(within(card).getByText('Trend')).toBeInTheDocument();
    expect(card).toHaveTextContent('Consistently decreasing over 3 months');
    expect(within(card).getByText('4 results · 4 new')).toBeInTheDocument();
    // The icon points the way the trend moves
    expect(container.querySelector('.tabler-icon-trending-down')).not.toBeNull();
    expect(container.querySelector('.tabler-icon-trending-up')).toBeNull();
  });

  it('opens the latest result when the card is clicked, or Enter is pressed on it', async () => {
    const { onOpen } = renderCard(groupOf(THREE_GLUCOSE));

    const card = screen.getByRole('article');
    await userEvent.click(within(card).getByText('May Lab', { exact: false }));
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'c' }));

    onOpen.mockClear();
    act(() => card.focus());
    await userEvent.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }));
  });

  it('expands to list the earlier results, most recent first, each marked new when it is', async () => {
    const { onOpen } = renderCard(
      groupOf(THREE_GLUCOSE, { glucose: new Date('2024-01-15T10:00:00Z') })
    );

    const toggle = screen.getByRole('button', { name: 'Show 2 earlier results' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAccessibleName('Hide earlier results');
    expect(onOpen).not.toHaveBeenCalled();
    // Collapse shows its content on the next animation frame
    const list = await screen.findByRole('list', { name: 'Earlier Glucose results' });
    const rows = within(list).getAllByRole('button');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Mar 10, 2024');
    expect(rows[0]).toHaveTextContent('140 mg/dL');
    expect(rows[0]).toHaveTextContent('March Lab');
    expect(within(rows[0]).getByText('New')).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent('Jan 15, 2024');
    expect(within(rows[1]).queryByText('New')).toBeNull();
    expect(rows[0]).toHaveAccessibleName('Open trend at Mar 10, 2024: 140 mg/dL, high, March Lab, new');
  });

  it('opens an earlier result at its own date', async () => {
    const { onOpen } = renderCard(groupOf(THREE_GLUCOSE));

    await userEvent.click(screen.getByRole('button', { name: /earlier results$/ }));
    await userEvent.click(await screen.findByRole('button', { name: /^Open trend at Jan 15, 2024/ }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('offers no toggle without earlier results', () => {
    renderCard(groupOf([alert()]));

    expect(screen.queryByRole('button', { name: /earlier results?$/ })).toBeNull();
  });

  it('acknowledges and dismisses the whole test without opening it', async () => {
    const { onAcknowledge, onDismiss, onOpen } = renderCard(groupOf(THREE_GLUCOSE));

    await userEvent.click(screen.getByRole('button', { name: 'Acknowledge all Glucose results' }));
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss Glucose alert' }));

    expect(onAcknowledge).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('lets keyboard users read the full date', async () => {
    renderCard(groupOf([alert()]));

    const time = screen.getByText(/ago$/);
    expect(time.tagName).toBe('TIME');
    act(() => time.focus());
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      new Date('2024-01-15T10:00:00Z').toLocaleDateString()
    );
  });

  it('is not focusable or clickable without onOpen', () => {
    render(
      <MantineProvider env="test">
        <AlertGroupCard group={groupOf([alert()])} onAcknowledge={vi.fn()} onDismiss={vi.fn()} />
      </MantineProvider>
    );

    expect(screen.getByRole('article')).not.toHaveAttribute('tabindex');
  });
  it('shows a new critical result on its card even when the latest result is a warning', () => {
    renderCard(
      groupOf([
        alert({ id: 'a', severity: 'critical', value: 300 }),
        alert({ id: 'b', date: new Date('2024-03-10T10:00:00Z'), message: 'Glucose is high at 110 mg/dL' }),
      ])
    );

    const card = screen.getByRole('article');
    // The headline's badge; the critical earlier result has its own, collapsed
    expect(within(card).getAllByText('Critical')[0]).toBeVisible();
    expect(card).toHaveStyle({ borderLeftWidth: '6px' });
    expect(card).toHaveAccessibleName(/^Alert for Glucose: critical, high\./);
  });

  it("says when the test's latest value is back in range", () => {
    renderCard(groupOf([alert({ latestStatus: 'normal' })]));

    const card = screen.getByRole('article');
    expect(within(card).getByText('Latest result within range')).toBeInTheDocument();
    expect(card).toHaveAccessibleName(/Latest result within range/);
  });

  it("says when the test's latest value has no reference range", () => {
    renderCard(groupOf([alert({ latestStatus: 'unknown' })]));

    expect(screen.getByText('Latest result has no reference range')).toBeInTheDocument();
  });

  it('colours a critical card by its critical result, not by an improvement heading it', () => {
    renderCard(
      groupOf([
        alert({ id: 'r', severity: 'critical', value: 250 }),
        alert({
          id: 'i',
          type: 'improvement',
          severity: 'positive',
          status: 'normal',
          latestStatus: 'normal',
          date: new Date('2024-03-10T10:00:00Z'),
          message: 'Improved: Glucose now within range',
        }),
      ])
    );

    const card = screen.getByRole('article');
    expect(card).toHaveStyle({ borderLeftColor: 'var(--mantine-color-red-6)' });
    expect(within(card).getAllByText('Critical')[0]).toBeVisible();
    expect(within(card).getByText('Improved')).toBeInTheDocument();
  });

  it('marks a critical earlier result, visibly and for screen readers', async () => {
    renderCard(
      groupOf([
        alert({ id: 'a', severity: 'critical', value: 300 }),
        alert({ id: 'b', date: new Date('2024-03-10T10:00:00Z') }),
      ])
    );

    await userEvent.click(screen.getByRole('button', { name: /earlier result$/ }));
    const row = await screen.findByRole('button', { name: /^Open trend at Jan 15, 2024/ });

    expect(within(row).getByText('Critical')).toBeInTheDocument();
    expect(row).toHaveAccessibleName('Open trend at Jan 15, 2024: 300 mg/dL, high, critical, Test Lab, new');
  });

  it('does not open the latest result for a click between earlier results', async () => {
    const { onOpen } = renderCard(groupOf(THREE_GLUCOSE));

    await userEvent.click(screen.getByRole('button', { name: /earlier results$/ }));
    fireEvent.click(await screen.findByRole('list', { name: 'Earlier Glucose results' }));

    expect(onOpen).not.toHaveBeenCalled();
  });
});
