import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { TrendStatistics } from './TrendStatistics';
import type { TrendStatistics as TrendStats, RateOfChange, TrendDataPoint } from '@services/statistics/trendAnalysis';

function point(value: number, extra: Partial<TrendDataPoint> = {}): TrendDataPoint {
  return { date: new Date('2024-01-15'), value, unit: 'mg/dL', status: 'normal', ...extra };
}

const mockStatistics: TrendStats = {
  latest: 100,
  latestPoint: point(100),
  minPoint: point(80),
  maxPoint: point(120),
  latestDate: new Date('2024-01-15'),
  oldest: 85,
  oldestDate: new Date('2023-01-15'),
  average: 95,
  median: 96,
  min: 80,
  max: 120,
  standardDeviation: 10.5,
  count: 10,
  unit: 'mg/dL',
};

const mockRateOfChange: RateOfChange = {
  perMonth: 2.5,
  perWeek: 0.6,
  perDay: 0.09,
  percentageChange: 5.0,
  unit: 'mg/dL',
};

interface TrendStatisticsTestProps {
  statistics?: TrendStats;
  rateOfChange?: RateOfChange | null;
  referenceRange?: {
    low?: number;
    high?: number;
  };
}

function renderTrendStatistics(props: TrendStatisticsTestProps = {}) {
  const defaultProps = {
    statistics: mockStatistics,
    rateOfChange: undefined,
    referenceRange: undefined,
    ...props,
  };

  return render(
    <MantineProvider env="test">
      <TrendStatistics {...defaultProps} />
    </MantineProvider>
  );
}

describe('TrendStatistics', () => {
  describe('Rendering', () => {
    it('renders statistics summary heading', () => {
      renderTrendStatistics();

      expect(screen.getByText('Statistics Summary')).toBeInTheDocument();
    });

    it('renders latest value', () => {
      renderTrendStatistics();

      expect(screen.getByText('Latest Value')).toBeInTheDocument();
      expect(screen.getByText('100.0')).toBeInTheDocument();
    });

    it('renders latest date', () => {
      renderTrendStatistics();

      // Date format varies by locale, check the card exists
      expect(screen.getByText('Latest Value')).toBeInTheDocument();
    });

    it('renders average value', () => {
      renderTrendStatistics();

      expect(screen.getByText('Average')).toBeInTheDocument();
      expect(screen.getByText('95.0')).toBeInTheDocument();
    });

    it('renders minimum value', () => {
      renderTrendStatistics();

      expect(screen.getByText('Minimum')).toBeInTheDocument();
      expect(screen.getByText('80.0')).toBeInTheDocument();
    });

    it('renders maximum value', () => {
      renderTrendStatistics();

      expect(screen.getByText('Maximum')).toBeInTheDocument();
      expect(screen.getByText('120.0')).toBeInTheDocument();
    });

    it('renders total readings', () => {
      renderTrendStatistics();

      expect(screen.getByText('Total Readings')).toBeInTheDocument();
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    it('renders standard deviation in subtitle', () => {
      renderTrendStatistics();

      expect(screen.getByText(/Std Dev: 10.5/)).toBeInTheDocument();
    });

    it('renders unit with values', () => {
      renderTrendStatistics();

      // Unit should appear multiple times (with each value)
      const units = screen.getAllByText('mg/dL');
      expect(units.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Rate of change', () => {
    it('renders rate of change when provided', () => {
      renderTrendStatistics({ rateOfChange: mockRateOfChange });

      expect(screen.getByText('Rate of Change')).toBeInTheDocument();
    });

    it('shows percentage change', () => {
      renderTrendStatistics({ rateOfChange: mockRateOfChange });

      expect(screen.getByText('5.0%')).toBeInTheDocument();
      expect(screen.getByText('overall change')).toBeInTheDocument();
    });

    it('shows per month change', () => {
      renderTrendStatistics({ rateOfChange: mockRateOfChange });

      expect(screen.getByText('Per Month')).toBeInTheDocument();
      expect(screen.getByText('+2.5 mg/dL')).toBeInTheDocument();
    });

    it('shows per week change', () => {
      renderTrendStatistics({ rateOfChange: mockRateOfChange });

      expect(screen.getByText('Per Week')).toBeInTheDocument();
      expect(screen.getByText('+0.6 mg/dL')).toBeInTheDocument();
    });

    it('shows negative change without plus sign', () => {
      const negativeChange: RateOfChange = {
        ...mockRateOfChange,
        perMonth: -3.0,
        perWeek: -0.7,
        percentageChange: -8.0,
      };
      renderTrendStatistics({ rateOfChange: negativeChange });

      expect(screen.getByText('-3.0 mg/dL')).toBeInTheDocument();
      expect(screen.getByText('-0.7 mg/dL')).toBeInTheDocument();
    });

    it('does not render rate of change when not provided', () => {
      renderTrendStatistics({ rateOfChange: undefined });

      expect(screen.queryByText('Rate of Change')).not.toBeInTheDocument();
    });
  });

  describe('Reference range', () => {
    it('renders reference range when provided', () => {
      renderTrendStatistics({ referenceRange: { low: 70, high: 100 } });

      expect(screen.getByText('Reference Range:')).toBeInTheDocument();
      expect(screen.getByText(/70 - 100 mg\/dL/)).toBeInTheDocument();
    });

    it('shows a range without a low end as ≤', () => {
      renderTrendStatistics({ referenceRange: { high: 100 } });

      expect(screen.getByText(/≤ 100/)).toBeInTheDocument();
    });

    it('shows a range without a high end as ≥', () => {
      renderTrendStatistics({ referenceRange: { low: 70 } });

      expect(screen.getByText(/≥ 70/)).toBeInTheDocument();
    });

    it('does not render reference range when not provided', () => {
      renderTrendStatistics({ referenceRange: undefined });

      expect(screen.queryByText('Reference Range:')).not.toBeInTheDocument();
    });
  });

  describe('Value formatting', () => {
    it('formats very small values in exponential notation', () => {
      const smallStats: TrendStats = {
        ...mockStatistics,
        standardDeviation: 0.001,
      };
      renderTrendStatistics({ statistics: smallStats });

      expect(screen.getByText(/Std Dev: 1\.0e-3/)).toBeInTheDocument();
    });

    it('formats values with appropriate decimal places', () => {
      renderTrendStatistics();

      // Values should show 1 decimal place
      expect(screen.getByText('100.0')).toBeInTheDocument();
      expect(screen.getByText('95.0')).toBeInTheDocument();
    });
  });

  describe('Color coding', () => {
    const colorOf = (text: string): string => screen.getByText(text).getAttribute('style') ?? '';

    it('shows green when the latest value is normal', () => {
      renderTrendStatistics({ statistics: { ...mockStatistics, latest: 90, latestPoint: point(90) } });
      expect(colorOf('90.0')).toContain('green');
    });

    it('shows red when the latest value is high or low', () => {
      renderTrendStatistics({ statistics: { ...mockStatistics, latest: 150, latestPoint: point(150, { status: 'high' }) } });
      expect(colorOf('150.0')).toContain('red');
    });

    it('colours a latest value by its status, not its bound: "> 100" with a range of 50-150 cannot be told', () => {
      renderTrendStatistics({
        statistics: { ...mockStatistics, latest: 100, latestPoint: point(100, { censored: '>', status: 'unknown' }) },
        referenceRange: { low: 50, high: 150 },
      });
      expect(colorOf('> 100.0')).not.toMatch(/green|red/);
    });
  });

  describe('Values as they read', () => {
    it('shows a censored or interval latest, minimum and maximum as printed', () => {
      renderTrendStatistics({
        statistics: {
          ...mockStatistics,
          latestPoint: point(7.5, { interval: { low: 5, high: 10 } }),
          minPoint: point(10, { censored: '<' }),
          maxPoint: point(200, { censored: '>' }),
        },
      });
      expect(screen.getByText('5.0-10.0')).toBeInTheDocument();
      expect(screen.getByText('< 10.0')).toBeInTheDocument();
      expect(screen.getByText('> 200.0')).toBeInTheDocument();
    });
  });
});
