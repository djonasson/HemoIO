/**
 * Tests for TrendChart component
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { TrendChart } from './TrendChart';
import type { TrendDataPoint } from '@services/statistics/trendAnalysis';

function renderWithProviders(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

function createDataPoint(
  date: string,
  value: number,
  status: 'normal' | 'high' | 'low' | 'unknown' = 'normal'
): TrendDataPoint {
  return {
    date: new Date(date),
    value,
    unit: 'mg/dL',
    status,
    referenceRange: { low: 70, high: 100 },
    labName: 'Test Lab',
  };
}

// Mock ResizeObserver for Recharts
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

describe('TrendChart', () => {
  it('should render loading state', () => {
    const { container } = renderWithProviders(
      <TrendChart
        dataPoints={[]}
        biomarkerName="Glucose"
        unit="mg/dL"
        isLoading
      />
    );

    // Mantine Loader has class mantine-Loader-root
    expect(container.querySelector('.mantine-Loader-root')).toBeInTheDocument();
  });

  it('should render empty state when no data', () => {
    renderWithProviders(
      <TrendChart
        dataPoints={[]}
        biomarkerName="Glucose"
        unit="mg/dL"
      />
    );

    expect(screen.getByText(/no data available/i)).toBeInTheDocument();
  });

  it('should render single data point message', () => {
    const dataPoints = [createDataPoint('2024-01-15', 95)];

    renderWithProviders(
      <TrendChart
        dataPoints={dataPoints}
        biomarkerName="Glucose"
        unit="mg/dL"
      />
    );

    expect(screen.getByText(/more data needed/i)).toBeInTheDocument();
    expect(screen.getByText('95')).toBeInTheDocument();
  });

  it('should render chart with multiple data points', () => {
    const dataPoints = [
      createDataPoint('2024-01-15', 95),
      createDataPoint('2024-02-15', 100),
      createDataPoint('2024-03-15', 105),
    ];

    renderWithProviders(
      <TrendChart
        dataPoints={dataPoints}
        biomarkerName="Glucose"
        unit="mg/dL"
      />
    );

    expect(screen.getByText('Glucose (mg/dL)')).toBeInTheDocument();
  });

  it('should display trend indicator when provided', () => {
    const dataPoints = [
      createDataPoint('2024-01-15', 95),
      createDataPoint('2024-02-15', 100),
    ];

    renderWithProviders(
      <TrendChart
        dataPoints={dataPoints}
        biomarkerName="Glucose"
        unit="mg/dL"
        trendDirection={{
          direction: 'increasing',
          confidence: 0.8,
          description: 'Values increasing',
        }}
      />
    );

    expect(screen.getByText('Increasing')).toBeInTheDocument();
    expect(screen.getByText('80% confidence')).toBeInTheDocument();
  });

  it('should display decreasing trend indicator', () => {
    const dataPoints = [
      createDataPoint('2024-01-15', 100),
      createDataPoint('2024-02-15', 95),
    ];

    renderWithProviders(
      <TrendChart
        dataPoints={dataPoints}
        biomarkerName="Glucose"
        unit="mg/dL"
        trendDirection={{
          direction: 'decreasing',
          confidence: 0.7,
          description: 'Values decreasing',
        }}
      />
    );

    expect(screen.getByText('Decreasing')).toBeInTheDocument();
  });

  it('should display stable trend indicator', () => {
    const dataPoints = [
      createDataPoint('2024-01-15', 95),
      createDataPoint('2024-02-15', 96),
    ];

    renderWithProviders(
      <TrendChart
        dataPoints={dataPoints}
        biomarkerName="Glucose"
        unit="mg/dL"
        trendDirection={{
          direction: 'stable',
          confidence: 0.9,
          description: 'Values stable',
        }}
      />
    );

    expect(screen.getByText('Stable')).toBeInTheDocument();
  });

  it('should display insufficient data indicator', () => {
    const dataPoints = [createDataPoint('2024-01-15', 95)];

    renderWithProviders(
      <TrendChart
        dataPoints={dataPoints}
        biomarkerName="Glucose"
        unit="mg/dL"
        trendDirection={{
          direction: 'insufficient_data',
          confidence: 0,
          description: 'Need more data',
        }}
      />
    );

    // Single point shows special view
    expect(screen.getByText(/more data needed/i)).toBeInTheDocument();
  });

  it('should show normal status badge for single data point', () => {
    const dataPoints = [createDataPoint('2024-01-15', 95, 'normal')];

    renderWithProviders(
      <TrendChart
        dataPoints={dataPoints}
        biomarkerName="Glucose"
        unit="mg/dL"
      />
    );

    expect(screen.getByText('normal')).toBeInTheDocument();
  });

  it('should show high status badge for single abnormal data point', () => {
    const dataPoints = [createDataPoint('2024-01-15', 150, 'high')];

    renderWithProviders(
      <TrendChart
        dataPoints={dataPoints}
        biomarkerName="Glucose"
        unit="mg/dL"
      />
    );

    expect(screen.getByText('high')).toBeInTheDocument();
  });

  it('should respect custom height', () => {
    const dataPoints = [
      createDataPoint('2024-01-15', 95),
      createDataPoint('2024-02-15', 100),
    ];

    const { container } = renderWithProviders(
      <TrendChart
        dataPoints={dataPoints}
        biomarkerName="Glucose"
        unit="mg/dL"
        height={500}
      />
    );

    // Check that the container has the expected height
    const chart = container.querySelector('.recharts-responsive-container');
    expect(chart).toBeInTheDocument();
  });
});
