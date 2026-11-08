import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ComparisonTooltip } from './ComparisonTooltip';
import type { ChartRow } from './comparisonChartRow';

describe('ComparisonTooltip', () => {
  it('gives a censored value with its comparator, not the bound it is drawn at', () => {
    const lessThanTen = { date: new Date('2024-01-01'), value: 10, unit: 'mg/dL', censored: '<' as const };
    const row = { timestamp: 0, points: { Glucose: lessThanTen } } as unknown as ChartRow;
    render(
      <MantineProvider env="test">
        <ComparisonTooltip
          active
          label="Jan 1, 24"
          payload={[{ dataKey: 'Glucose', value: 10, color: '#228be6', payload: row }]}
          markers={[{ name: 'Glucose', unit: 'mg/dL', color: '#228be6', dataPoints: [lessThanTen] }]}
        />
      </MantineProvider>
    );
    expect(screen.getByText('Glucose: < 10 mg/dL')).toBeInTheDocument();
  });
});
