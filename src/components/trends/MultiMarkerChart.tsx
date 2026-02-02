/**
 * MultiMarkerChart Component
 *
 * Displays multiple biomarkers on the same chart for comparison.
 * Uses dual Y-axes when biomarkers have different units.
 */

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Paper, Text, Stack, Group, Badge, Center, Loader, ColorSwatch } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import type { TrendDataPoint } from '@services/statistics/trendAnalysis';

/**
 * Marker data for multi-marker chart
 */
export interface MarkerData {
  /** Biomarker name */
  name: string;
  /** Unit of measurement */
  unit: string;
  /** Data points */
  dataPoints: TrendDataPoint[];
  /** Color for this marker */
  color: string;
}

/**
 * Props for MultiMarkerChart component
 */
export interface MultiMarkerChartProps {
  /** Array of marker data to display */
  markers: MarkerData[];
  /** Whether data is loading */
  isLoading?: boolean;
  /** Height of the chart */
  height?: number;
}

/**
 * Chart colors for different markers
 */
const CHART_COLORS = [
  '#228be6', // blue
  '#40c057', // green
  '#fa5252', // red
  '#fab005', // yellow
  '#7950f2', // violet
  '#20c997', // teal
  '#fd7e14', // orange
  '#e64980', // pink
];

/**
 * Format date for chart display
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  });
}

/**
 * Custom tooltip for multi-marker chart
 */
function CustomTooltip({
  active,
  payload,
  label,
  markers,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ dataKey: string; value: number; color: string }>;
  label?: string | number;
  markers: MarkerData[];
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <Paper shadow="md" p="sm" withBorder>
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          {label}
        </Text>
        {payload.map((entry) => {
          const marker = markers.find((m) => m.name === entry.dataKey);
          return (
            <Group key={entry.dataKey} gap="xs">
              <ColorSwatch color={entry.color} size={12} />
              <Text size="sm">
                {entry.dataKey}: {entry.value} {marker?.unit || ''}
              </Text>
            </Group>
          );
        })}
      </Stack>
    </Paper>
  );
}

/**
 * MultiMarkerChart component for comparing biomarkers
 */
export function MultiMarkerChart({
  markers,
  isLoading = false,
  height = 400,
}: MultiMarkerChartProps) {
  // Combine all data points into a unified dataset
  const chartData = useMemo(() => {
    // Get all unique dates
    const dateMap = new Map<string, { timestamp: number } & Record<string, number>>();

    for (const marker of markers) {
      for (const point of marker.dataPoints) {
        const dateKey = formatDate(point.date);
        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, { timestamp: point.date.getTime() });
        }
        dateMap.get(dateKey)![marker.name] = point.value;
      }
    }

    // Convert to array and sort by date
    return Array.from(dateMap.entries())
      .map(([formattedDate, data]) => ({
        formattedDate,
        ...data,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [markers]);

  // Determine if we need dual axes (different units)
  const uniqueUnits = useMemo(() => {
    const units = new Set(markers.map((m) => m.unit));
    return Array.from(units);
  }, [markers]);

  const useDualAxis = uniqueUnits.length === 2;

  // Calculate Y-axis domains
  const yDomains = useMemo(() => {
    const domains: Record<string, [number, number]> = {};

    for (const unit of uniqueUnits) {
      const markersWithUnit = markers.filter((m) => m.unit === unit);
      const allValues = markersWithUnit.flatMap((m) => m.dataPoints.map((p) => p.value));

      if (allValues.length === 0) {
        domains[unit] = [0, 100];
        continue;
      }

      const min = Math.min(...allValues);
      const max = Math.max(...allValues);
      const range = max - min || 1;
      const padding = range * 0.1;

      domains[unit] = [Math.max(0, min - padding), max + padding];
    }

    return domains;
  }, [markers, uniqueUnits]);

  // Assign colors to markers
  const markersWithColors = useMemo(() => {
    return markers.map((marker, index) => ({
      ...marker,
      color: marker.color || CHART_COLORS[index % CHART_COLORS.length],
    }));
  }, [markers]);

  if (isLoading) {
    return (
      <Center h={height}>
        <Loader />
      </Center>
    );
  }

  if (markers.length === 0 || chartData.length === 0) {
    return (
      <Center h={height}>
        <Stack align="center" gap="xs">
          <IconAlertCircle size={32} color="gray" />
          <Text c="dimmed">Select biomarkers to compare</Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text size="lg" fw={500}>
          Biomarker Comparison
        </Text>
        <Group gap="md">
          {markersWithColors.map((marker) => (
            <Group key={marker.name} gap="xs">
              <ColorSwatch color={marker.color} size={14} />
              <Text size="sm">
                {marker.name} ({marker.unit})
              </Text>
            </Group>
          ))}
        </Group>
      </Group>

      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={chartData}
          margin={{ top: 10, right: useDualAxis ? 60 : 30, left: 10, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />

          <XAxis
            dataKey="formattedDate"
            tick={{ fontSize: 12 }}
            tickMargin={8}
          />

          {/* Primary Y-axis (left) */}
          <YAxis
            yAxisId="left"
            orientation="left"
            domain={yDomains[uniqueUnits[0]] || [0, 100]}
            tick={{ fontSize: 12 }}
            tickMargin={8}
            label={{
              value: uniqueUnits[0] || '',
              angle: -90,
              position: 'insideLeft',
              style: { textAnchor: 'middle', fontSize: 12 },
            }}
          />

          {/* Secondary Y-axis (right) for different units */}
          {useDualAxis && (
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={yDomains[uniqueUnits[1]] || [0, 100]}
              tick={{ fontSize: 12 }}
              tickMargin={8}
              label={{
                value: uniqueUnits[1] || '',
                angle: 90,
                position: 'insideRight',
                style: { textAnchor: 'middle', fontSize: 12 },
              }}
            />
          )}

          <Tooltip
            content={(props) => (
              <CustomTooltip {...props} markers={markersWithColors} />
            )}
          />

          <Legend />

          {markersWithColors.map((marker) => (
            <Line
              key={marker.name}
              type="monotone"
              dataKey={marker.name}
              stroke={marker.color}
              strokeWidth={2}
              dot={{ r: 4, fill: marker.color }}
              activeDot={{ r: 6, stroke: marker.color, strokeWidth: 2, fill: '#fff' }}
              yAxisId={
                useDualAxis && marker.unit === uniqueUnits[1] ? 'right' : 'left'
              }
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {useDualAxis && (
        <Paper p="sm" withBorder bg="gray.0">
          <Group gap="lg">
            <Text size="sm" c="dimmed">
              Note: Chart uses dual axes due to different units.
            </Text>
            <Group gap="md">
              <Badge variant="outline">Left: {uniqueUnits[0]}</Badge>
              <Badge variant="outline">Right: {uniqueUnits[1]}</Badge>
            </Group>
          </Group>
        </Paper>
      )}
    </Stack>
  );
}
