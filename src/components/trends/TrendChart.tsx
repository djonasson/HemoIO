/**
 * TrendChart Component
 *
 * Displays a line chart of biomarker values over time using Recharts.
 * Includes reference range visualization and status-based point coloring.
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
  ReferenceLine,
  ReferenceArea,
  Legend,
} from 'recharts';
import { Paper, Text, Stack, Group, Badge, Center, Loader } from '@mantine/core';
import { IconTrendingUp, IconTrendingDown, IconMinus, IconAlertCircle } from '@tabler/icons-react';
import type { TrendDataPoint, TrendDirectionResult } from '@services/statistics/trendAnalysis';

/**
 * Props for TrendChart component
 */
export interface TrendChartProps {
  /** Data points to display */
  dataPoints: TrendDataPoint[];
  /** Biomarker name for labels */
  biomarkerName: string;
  /** Unit of measurement */
  unit: string;
  /** Reference range for display */
  referenceRange?: {
    low?: number;
    high?: number;
  };
  /** Trend direction result for indicator */
  trendDirection?: TrendDirectionResult;
  /** Whether data is loading */
  isLoading?: boolean;
  /** Height of the chart */
  height?: number;
  /** Whether to show the legend */
  showLegend?: boolean;
}

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
 * Custom tooltip component
 */
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: TrendDataPoint & { formattedDate: string } }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0].payload;

  return (
    <Paper shadow="md" p="sm" withBorder>
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          {label}
        </Text>
        <Group gap="xs">
          <Text size="sm">Value:</Text>
          <Text size="sm" fw={500}>
            {data.value} {data.unit}
          </Text>
        </Group>
        {data.referenceRange && (
          <Group gap="xs">
            <Text size="sm" c="dimmed">
              Reference:
            </Text>
            <Text size="sm" c="dimmed">
              {data.referenceRange.low} - {data.referenceRange.high}
            </Text>
          </Group>
        )}
        {data.labName && (
          <Text size="xs" c="dimmed">
            {data.labName}
          </Text>
        )}
        <Badge
          size="xs"
          color={
            data.status === 'high'
              ? 'red'
              : data.status === 'low'
                ? 'orange'
                : data.status === 'normal'
                  ? 'green'
                  : 'gray'
          }
        >
          {data.status || 'unknown'}
        </Badge>
      </Stack>
    </Paper>
  );
}

/**
 * Trend direction indicator component
 */
function TrendIndicator({ direction }: { direction: TrendDirectionResult }) {
  const icon =
    direction.direction === 'increasing' ? (
      <IconTrendingUp size={16} />
    ) : direction.direction === 'decreasing' ? (
      <IconTrendingDown size={16} />
    ) : direction.direction === 'stable' ? (
      <IconMinus size={16} />
    ) : (
      <IconAlertCircle size={16} />
    );

  const color =
    direction.direction === 'increasing'
      ? 'blue'
      : direction.direction === 'decreasing'
        ? 'orange'
        : direction.direction === 'stable'
          ? 'green'
          : 'gray';

  return (
    <Group gap="xs">
      <Badge leftSection={icon} color={color} variant="light">
        {direction.direction === 'insufficient_data'
          ? 'Need more data'
          : direction.direction.charAt(0).toUpperCase() + direction.direction.slice(1)}
      </Badge>
      {direction.confidence > 0 && (
        <Text size="xs" c="dimmed">
          {Math.round(direction.confidence * 100)}% confidence
        </Text>
      )}
    </Group>
  );
}

/**
 * TrendChart component displays biomarker values over time
 */
export function TrendChart({
  dataPoints,
  biomarkerName,
  unit,
  referenceRange,
  trendDirection,
  isLoading = false,
  height = 300,
  showLegend = false,
}: TrendChartProps) {
  // Transform data for Recharts
  const chartData = useMemo(() => {
    return dataPoints
      .map((point) => ({
        ...point,
        formattedDate: formatDate(point.date),
        timestamp: point.date.getTime(),
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [dataPoints]);

  // Calculate y-axis domain with padding
  const yDomain = useMemo(() => {
    if (chartData.length === 0) {
      return [0, 100];
    }

    const values = chartData.map((d) => d.value);
    let min = Math.min(...values);
    let max = Math.max(...values);

    // Include reference range in domain
    if (referenceRange?.low !== undefined) {
      min = Math.min(min, referenceRange.low);
    }
    if (referenceRange?.high !== undefined) {
      max = Math.max(max, referenceRange.high);
    }

    // Add 10% padding
    const range = max - min || 1;
    const padding = range * 0.1;

    return [Math.max(0, min - padding), max + padding];
  }, [chartData, referenceRange]);

  if (isLoading) {
    return (
      <Center h={height}>
        <Loader />
      </Center>
    );
  }

  if (chartData.length === 0) {
    return (
      <Center h={height}>
        <Stack align="center" gap="xs">
          <IconAlertCircle size={32} color="gray" />
          <Text c="dimmed">No data available for this biomarker</Text>
        </Stack>
      </Center>
    );
  }

  if (chartData.length === 1) {
    return (
      <Stack>
        <Paper p="md" withBorder>
          <Stack align="center" gap="md">
            <Text size="lg" fw={500}>
              {biomarkerName}
            </Text>
            <Group gap="xs">
              <Text size="xl" fw={700}>
                {chartData[0].value}
              </Text>
              <Text size="lg" c="dimmed">
                {unit}
              </Text>
            </Group>
            <Text size="sm" c="dimmed">
              {chartData[0].formattedDate}
            </Text>
            <Badge
              color={
                chartData[0].status === 'high'
                  ? 'red'
                  : chartData[0].status === 'low'
                    ? 'orange'
                    : 'green'
              }
            >
              {chartData[0].status || 'unknown'}
            </Badge>
            <Text size="sm" c="dimmed" ta="center">
              More data needed for trend analysis
            </Text>
          </Stack>
        </Paper>
      </Stack>
    );
  }

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="lg" fw={500}>
          {biomarkerName} ({unit})
        </Text>
        {trendDirection && <TrendIndicator direction={trendDirection} />}
      </Group>

      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />

          <XAxis
            dataKey="formattedDate"
            tick={{ fontSize: 12 }}
            tickMargin={8}
          />

          <YAxis
            domain={yDomain}
            tick={{ fontSize: 12 }}
            tickMargin={8}
            label={{
              value: unit,
              angle: -90,
              position: 'insideLeft',
              style: { textAnchor: 'middle', fontSize: 12 },
            }}
          />

          {/* Reference range area */}
          {referenceRange?.low !== undefined && referenceRange?.high !== undefined && (
            <ReferenceArea
              y1={referenceRange.low}
              y2={referenceRange.high}
              fill="green"
              fillOpacity={0.1}
              stroke="green"
              strokeOpacity={0.3}
              strokeDasharray="3 3"
            />
          )}

          {/* Reference lines for bounds */}
          {referenceRange?.low !== undefined && (
            <ReferenceLine
              y={referenceRange.low}
              stroke="orange"
              strokeDasharray="3 3"
              label={{
                value: `Low: ${referenceRange.low}`,
                position: 'right',
                fontSize: 10,
                fill: 'orange',
              }}
            />
          )}

          {referenceRange?.high !== undefined && (
            <ReferenceLine
              y={referenceRange.high}
              stroke="red"
              strokeDasharray="3 3"
              label={{
                value: `High: ${referenceRange.high}`,
                position: 'right',
                fontSize: 10,
                fill: 'red',
              }}
            />
          )}

          <Tooltip content={<CustomTooltip />} />

          {showLegend && <Legend />}

          <Line
            type="monotone"
            dataKey="value"
            stroke="#228be6"
            strokeWidth={2}
            dot={(props) => {
              const { cx, cy, payload } = props;
              const status = payload.status;
              const fill =
                status === 'high'
                  ? '#fa5252'
                  : status === 'low'
                    ? '#fd7e14'
                    : status === 'normal'
                      ? '#40c057'
                      : '#868e96';

              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={6}
                  fill={fill}
                  stroke="#fff"
                  strokeWidth={2}
                  aria-label={`${payload.formattedDate}: ${payload.value} ${payload.unit} (${status})`}
                />
              );
            }}
            activeDot={{
              r: 8,
              stroke: '#228be6',
              strokeWidth: 2,
              fill: '#fff',
            }}
            name={biomarkerName}
          />
        </LineChart>
      </ResponsiveContainer>
    </Stack>
  );
}
