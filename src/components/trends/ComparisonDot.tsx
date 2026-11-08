import type { ChartRow } from './comparisonChartRow';

export interface ComparisonDotProps {
  name: string;
  color: string;
  cx?: number;
  cy?: number;
  payload?: ChartRow;
}

/** A marker's dot: a censored value drawn open at its bound, as on the trend chart */
export function ComparisonDot({ name, color, cx, cy, payload }: ComparisonDotProps): React.ReactElement {
  const censored = !!payload?.points[name]?.censored;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={censored ? 'var(--mantine-color-body)' : color}
      stroke={color}
      strokeWidth={censored ? 2 : 1}
      data-censored={censored || undefined}
    />
  );
}
