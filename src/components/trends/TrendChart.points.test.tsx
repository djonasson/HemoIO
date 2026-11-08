/**
 * TrendChart data points. Recharts' ResponsiveContainer has no size in jsdom,
 * so it is replaced by a fixed-size container to get the points drawn.
 */
import { describe, it, expect, vi } from 'vitest';
import { cloneElement, isValidElement, useState } from 'react';
import { render, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { TrendChart } from './TrendChart';
import type { TrendDataPoint } from '@services/statistics/trendAnalysis';

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
      isValidElement<{ width?: number; height?: number }>(children)
        ? cloneElement(children, { width: 800, height: 400 })
        : children,
  };
});

const POINTS: TrendDataPoint[] = [
  { date: new Date('2024-01-15T12:00:00Z'), value: 125, unit: 'mg/dL', status: 'high', testValueId: 2 },
  { date: new Date('2024-02-20T12:00:00Z'), value: 98, unit: 'mg/dL', status: 'normal', testValueId: 4 },
];

function renderChart(props: Partial<React.ComponentProps<typeof TrendChart>> = {}) {
  return render(
    <MantineProvider env="test">
      <TrendChart dataPoints={POINTS} biomarkerName="Glucose" unit="mg/dL" {...props} />
    </MantineProvider>
  );
}

function point(value: string): Element {
  const found = document.querySelector(`circle[aria-label*=": ${value}"]`);
  if (!found) throw new Error(`no point ${value}`);
  return found;
}

describe('TrendChart points', () => {
  it('marks points with notes in their accessible label', () => {
    renderChart({ notePreviews: { 2: 'Big dinner' } });
    expect(point('125 mg/dL').getAttribute('aria-label')).toMatch(/, has notes$/);
    expect(point('98 mg/dL').getAttribute('aria-label')).not.toMatch(/notes/);
  });

  it("labels an interval's point with its ends, though it is drawn at its midpoint", () => {
    renderChart({
      dataPoints: [...POINTS, { ...POINTS[1], date: new Date('2024-03-20T12:00:00Z'), value: 7.5, interval: { low: 5, high: 10 } }],
    });
    expect(point('5-10 mg/dL')).toBeInTheDocument();
  });

  it('shows a single interval as its ends', () => {
    const { getByText } = renderChart({ dataPoints: [{ ...POINTS[0], value: 7.5, interval: { low: 5, high: 10 } }] });
    expect(getByText('5-10')).toBeInTheDocument();
  });

  it('highlights the linked value itself, not every point of its day', () => {
    const sameDay = [
      ...POINTS,
      { date: new Date('2024-01-15T15:00:00Z'), value: 130, unit: 'mg/dL', status: 'high' as const, testValueId: 7 },
    ];
    renderChart({ dataPoints: sameDay, highlightDate: new Date('2024-01-15'), highlightTestValueId: 7 });
    expect(point('130 mg/dL')).toHaveAttribute('aria-current', 'true');
    expect(point('125 mg/dL')).not.toHaveAttribute('aria-current');
  });

  it('makes points buttons that open with click, Enter and Space', async () => {
    const onPointSelect = vi.fn();
    renderChart({ onPointSelect });

    const first = point('125 mg/dL') as SVGElement;
    expect(first).toHaveAttribute('role', 'button');
    expect(first).toHaveAttribute('tabindex', '0');

    await userEvent.click(first);
    act(() => first.focus());
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');

    expect(onPointSelect).toHaveBeenCalledTimes(3);
    expect(onPointSelect).toHaveBeenCalledWith(expect.objectContaining({ testValueId: 2 }));
  });

  it('keeps focus on a point selected with the keyboard when the page re-renders', async () => {
    // The trends view stores the selected point, which re-renders the chart
    function Page() {
      const [selected, setSelected] = useState<TrendDataPoint | null>(null);
      return (
        <MantineProvider env="test">
          <TrendChart
            dataPoints={POINTS}
            biomarkerName="Glucose"
            unit="mg/dL"
            onPointSelect={setSelected}
            highlightDate={selected?.date}
          />
        </MantineProvider>
      );
    }
    render(<Page />);

    const first = point('125 mg/dL') as SVGElement;
    act(() => first.focus());
    await userEvent.keyboard('{Enter}');

    expect(first.isConnected).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it('shows the note preview and a focus ring while a point is focused', () => {
    renderChart({ notePreviews: { 2: 'Big dinner the night before' }, onPointSelect: vi.fn() });
    const preview = () => document.querySelector('[data-focus-preview="true"]');
    expect(preview()).toBeNull();

    const first = point('125 mg/dL') as SVGElement;
    act(() => first.focus());

    expect(preview()).toHaveTextContent('Big dinner the night before');
    expect(preview()).toHaveTextContent('125 mg/dL');
    expect(document.querySelector('[data-focus-ring="true"]')).not.toBeNull();

    act(() => first.blur());
    expect(preview()).toBeNull();
    expect(document.querySelector('[data-focus-ring="true"]')).toBeNull();
  });

  it('draws two measurements of the same day as separate points', () => {
    const sameDay: TrendDataPoint[] = [
      { ...POINTS[0], testValueId: 2 },
      { ...POINTS[0], value: 130, testValueId: 3 },
    ];
    renderChart({ dataPoints: sameDay });
    expect(document.querySelectorAll('circle[aria-label]')).toHaveLength(2);
  });
});
