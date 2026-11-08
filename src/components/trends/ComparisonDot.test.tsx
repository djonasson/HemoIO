import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ComparisonDot } from './ComparisonDot';
import type { ChartRow } from './comparisonChartRow';

const rowWith = (censored?: '<') =>
  ({ timestamp: 0, points: { Glucose: { date: new Date(), value: 10, unit: 'mg/dL', censored } } }) as unknown as ChartRow;

describe('ComparisonDot', () => {
  it('draws a censored value open, a measured one filled', () => {
    const open = render(<svg><ComparisonDot name="Glucose" color="#228be6" cx={1} cy={1} payload={rowWith('<')} /></svg>);
    expect(open.container.querySelector('circle')).toHaveAttribute('fill', 'var(--mantine-color-body)');
    const filled = render(<svg><ComparisonDot name="Glucose" color="#228be6" cx={1} cy={1} payload={rowWith()} /></svg>);
    expect(filled.container.querySelector('circle')).toHaveAttribute('fill', '#228be6');
  });
});
