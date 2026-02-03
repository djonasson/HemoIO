import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MultiMarkerChart, type MarkerData } from './MultiMarkerChart';

// Mock recharts to avoid rendering issues in tests
vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Legend: () => null,
}));

const mockMarkerData: MarkerData[] = [
  {
    name: 'Glucose',
    unit: 'mg/dL',
    color: '#228be6',
    dataPoints: [
      { date: new Date('2024-01-01'), value: 100, unit: 'mg/dL' },
      { date: new Date('2024-01-15'), value: 105, unit: 'mg/dL' },
      { date: new Date('2024-02-01'), value: 98, unit: 'mg/dL' },
    ],
  },
  {
    name: 'Hemoglobin',
    unit: 'g/dL',
    color: '#40c057',
    dataPoints: [
      { date: new Date('2024-01-01'), value: 14.5, unit: 'g/dL' },
      { date: new Date('2024-01-15'), value: 14.2, unit: 'g/dL' },
      { date: new Date('2024-02-01'), value: 14.8, unit: 'g/dL' },
    ],
  },
];

interface MultiMarkerChartTestProps {
  markers?: MarkerData[];
  isLoading?: boolean;
  height?: number;
}

function renderMultiMarkerChart(props: MultiMarkerChartTestProps = {}) {
  const defaultProps = {
    markers: mockMarkerData,
    isLoading: false,
    height: 400,
    ...props,
  };

  return render(
    <MantineProvider>
      <MultiMarkerChart {...defaultProps} />
    </MantineProvider>
  );
}

describe('MultiMarkerChart', () => {
  describe('Rendering', () => {
    it('renders chart title', () => {
      renderMultiMarkerChart();

      expect(screen.getByText('Biomarker Comparison')).toBeInTheDocument();
    });

    it('renders marker legend items', () => {
      renderMultiMarkerChart();

      expect(screen.getByText(/Glucose.*mg\/dL/)).toBeInTheDocument();
      expect(screen.getByText(/Hemoglobin.*g\/dL/)).toBeInTheDocument();
    });

    it('renders color swatches for each marker', () => {
      const { container } = renderMultiMarkerChart();

      // Color swatches should be present
      const swatches = container.querySelectorAll('.mantine-ColorSwatch-root');
      expect(swatches.length).toBeGreaterThanOrEqual(2);
    });

    it('renders the chart container', () => {
      renderMultiMarkerChart();

      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('shows loader when isLoading is true', () => {
      renderMultiMarkerChart({ isLoading: true });

      expect(document.querySelector('.mantine-Loader-root')).toBeInTheDocument();
    });

    it('does not show chart when loading', () => {
      renderMultiMarkerChart({ isLoading: true });

      expect(screen.queryByText('Biomarker Comparison')).not.toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('shows empty message when no markers provided', () => {
      renderMultiMarkerChart({ markers: [] });

      expect(screen.getByText('Select biomarkers to compare')).toBeInTheDocument();
    });

    it('shows empty message when markers have no data points', () => {
      const emptyMarkers: MarkerData[] = [
        { name: 'Glucose', unit: 'mg/dL', color: '#228be6', dataPoints: [] },
      ];
      renderMultiMarkerChart({ markers: emptyMarkers });

      expect(screen.getByText('Select biomarkers to compare')).toBeInTheDocument();
    });
  });

  describe('Dual axis handling', () => {
    it('shows dual axis note when markers have different units', () => {
      renderMultiMarkerChart();

      expect(screen.getByText(/Chart uses dual axes due to different units/)).toBeInTheDocument();
    });

    it('shows unit badges for dual axes', () => {
      renderMultiMarkerChart();

      expect(screen.getByText('Left: mg/dL')).toBeInTheDocument();
      expect(screen.getByText('Right: g/dL')).toBeInTheDocument();
    });

    it('does not show dual axis note when markers have same unit', () => {
      const sameUnitMarkers: MarkerData[] = [
        {
          name: 'Glucose',
          unit: 'mg/dL',
          color: '#228be6',
          dataPoints: [{ date: new Date('2024-01-01'), value: 100, unit: 'mg/dL' }],
        },
        {
          name: 'Cholesterol',
          unit: 'mg/dL',
          color: '#40c057',
          dataPoints: [{ date: new Date('2024-01-01'), value: 200, unit: 'mg/dL' }],
        },
      ];
      renderMultiMarkerChart({ markers: sameUnitMarkers });

      expect(screen.queryByText(/Chart uses dual axes/)).not.toBeInTheDocument();
    });
  });

  describe('Single marker', () => {
    it('renders chart with single marker', () => {
      const singleMarker: MarkerData[] = [
        {
          name: 'Glucose',
          unit: 'mg/dL',
          color: '#228be6',
          dataPoints: [
            { date: new Date('2024-01-01'), value: 100, unit: 'mg/dL' },
            { date: new Date('2024-01-15'), value: 105, unit: 'mg/dL' },
          ],
        },
      ];
      renderMultiMarkerChart({ markers: singleMarker });

      expect(screen.getByText('Biomarker Comparison')).toBeInTheDocument();
      expect(screen.getByText(/Glucose.*mg\/dL/)).toBeInTheDocument();
    });
  });

  describe('Color assignment', () => {
    it('uses provided colors for markers', () => {
      const markersWithColors: MarkerData[] = [
        {
          name: 'Test1',
          unit: 'mg/dL',
          color: '#ff0000',
          dataPoints: [{ date: new Date('2024-01-01'), value: 100, unit: 'mg/dL' }],
        },
      ];
      renderMultiMarkerChart({ markers: markersWithColors });

      // Marker should be rendered with its color
      expect(screen.getByText(/Test1/)).toBeInTheDocument();
    });

    it('handles markers without specified colors', () => {
      const markersNoColor: MarkerData[] = [
        {
          name: 'Test1',
          unit: 'mg/dL',
          color: '',
          dataPoints: [{ date: new Date('2024-01-01'), value: 100, unit: 'mg/dL' }],
        },
      ];
      renderMultiMarkerChart({ markers: markersNoColor });

      // Should still render without error
      expect(screen.getByText('Biomarker Comparison')).toBeInTheDocument();
    });
  });

  describe('Multiple data points on same date', () => {
    it('handles multiple markers with data on same date', () => {
      const sameDateMarkers: MarkerData[] = [
        {
          name: 'Marker1',
          unit: 'mg/dL',
          color: '#228be6',
          dataPoints: [{ date: new Date('2024-01-01'), value: 100, unit: 'mg/dL' }],
        },
        {
          name: 'Marker2',
          unit: 'mg/dL',
          color: '#40c057',
          dataPoints: [{ date: new Date('2024-01-01'), value: 200, unit: 'mg/dL' }],
        },
      ];
      renderMultiMarkerChart({ markers: sameDateMarkers });

      // Should render both markers
      expect(screen.getByText(/Marker1/)).toBeInTheDocument();
      expect(screen.getByText(/Marker2/)).toBeInTheDocument();
    });
  });
});
