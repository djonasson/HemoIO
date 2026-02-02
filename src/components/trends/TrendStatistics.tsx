/**
 * TrendStatistics Component
 *
 * Displays statistical summary of biomarker trend data.
 */

import { Paper, Stack, Group, Text, SimpleGrid, Badge, ThemeIcon } from '@mantine/core';
import {
  IconArrowUp,
  IconArrowDown,
  IconMinus,
  IconChartBar,
  IconCalendar,
} from '@tabler/icons-react';
import type { TrendStatistics as TrendStats, RateOfChange } from '@services/statistics/trendAnalysis';

/**
 * Props for TrendStatistics component
 */
export interface TrendStatisticsProps {
  /** Statistical summary */
  statistics: TrendStats;
  /** Rate of change (optional) */
  rateOfChange?: RateOfChange | null;
  /** Reference range for context */
  referenceRange?: {
    low?: number;
    high?: number;
  };
}

/**
 * Format a number with appropriate precision
 */
function formatValue(value: number, decimals: number = 1): string {
  if (Math.abs(value) < 0.01) {
    return value.toExponential(1);
  }
  return value.toFixed(decimals);
}

/**
 * Statistic card component
 */
function StatCard({
  label,
  value,
  unit,
  subtitle,
  color,
  icon,
}: {
  label: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  color?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Paper p="md" withBorder>
      <Stack gap="xs">
        <Group gap="xs">
          {icon && (
            <ThemeIcon size="sm" variant="light" color={color || 'blue'}>
              {icon}
            </ThemeIcon>
          )}
          <Text size="xs" c="dimmed" tt="uppercase">
            {label}
          </Text>
        </Group>
        <Group gap="xs" align="baseline">
          <Text size="xl" fw={700} c={color}>
            {value}
          </Text>
          {unit && (
            <Text size="sm" c="dimmed">
              {unit}
            </Text>
          )}
        </Group>
        {subtitle && (
          <Text size="xs" c="dimmed">
            {subtitle}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

/**
 * TrendStatistics component displays statistical summary
 */
export function TrendStatistics({
  statistics,
  rateOfChange,
  referenceRange,
}: TrendStatisticsProps) {
  // Determine if latest value is in range
  const latestInRange =
    referenceRange?.low !== undefined && referenceRange?.high !== undefined
      ? statistics.latest >= referenceRange.low && statistics.latest <= referenceRange.high
      : null;

  // Determine rate of change direction
  const changeDirection =
    rateOfChange && Math.abs(rateOfChange.percentageChange) > 1
      ? rateOfChange.percentageChange > 0
        ? 'up'
        : 'down'
      : 'stable';

  return (
    <Stack gap="md">
      <Group gap="xs">
        <IconChartBar size={20} />
        <Text fw={500}>Statistics Summary</Text>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 3, md: 5 }} spacing="md">
        <StatCard
          label="Latest Value"
          value={formatValue(statistics.latest)}
          unit={statistics.unit}
          subtitle={statistics.latestDate.toLocaleDateString()}
          color={latestInRange === false ? 'red' : latestInRange === true ? 'green' : undefined}
          icon={<IconCalendar size={14} />}
        />

        <StatCard
          label="Average"
          value={formatValue(statistics.average)}
          unit={statistics.unit}
        />

        <StatCard
          label="Minimum"
          value={formatValue(statistics.min)}
          unit={statistics.unit}
        />

        <StatCard
          label="Maximum"
          value={formatValue(statistics.max)}
          unit={statistics.unit}
        />

        <StatCard
          label="Total Readings"
          value={statistics.count}
          subtitle={`Std Dev: ${formatValue(statistics.standardDeviation)}`}
        />
      </SimpleGrid>

      {rateOfChange && (
        <Paper p="md" withBorder>
          <Group justify="space-between">
            <Stack gap="xs">
              <Text size="xs" c="dimmed" tt="uppercase">
                Rate of Change
              </Text>
              <Group gap="xs">
                {changeDirection === 'up' ? (
                  <IconArrowUp size={20} color="var(--mantine-color-blue-6)" />
                ) : changeDirection === 'down' ? (
                  <IconArrowDown size={20} color="var(--mantine-color-orange-6)" />
                ) : (
                  <IconMinus size={20} color="var(--mantine-color-gray-6)" />
                )}
                <Text size="lg" fw={500}>
                  {Math.abs(rateOfChange.percentageChange).toFixed(1)}%
                </Text>
                <Text size="sm" c="dimmed">
                  overall change
                </Text>
              </Group>
            </Stack>

            <Group gap="lg">
              <Stack gap={2} align="center">
                <Text size="xs" c="dimmed">
                  Per Month
                </Text>
                <Badge
                  color={
                    Math.abs(rateOfChange.perMonth) < 0.1
                      ? 'gray'
                      : rateOfChange.perMonth > 0
                        ? 'blue'
                        : 'orange'
                  }
                  variant="light"
                >
                  {rateOfChange.perMonth >= 0 ? '+' : ''}
                  {formatValue(rateOfChange.perMonth)} {rateOfChange.unit}
                </Badge>
              </Stack>

              <Stack gap={2} align="center">
                <Text size="xs" c="dimmed">
                  Per Week
                </Text>
                <Badge
                  color={
                    Math.abs(rateOfChange.perWeek) < 0.1
                      ? 'gray'
                      : rateOfChange.perWeek > 0
                        ? 'blue'
                        : 'orange'
                  }
                  variant="light"
                >
                  {rateOfChange.perWeek >= 0 ? '+' : ''}
                  {formatValue(rateOfChange.perWeek)} {rateOfChange.unit}
                </Badge>
              </Stack>
            </Group>
          </Group>
        </Paper>
      )}

      {referenceRange && (referenceRange.low !== undefined || referenceRange.high !== undefined) && (
        <Paper p="sm" withBorder bg="gray.0">
          <Group gap="md">
            <Text size="sm" c="dimmed">
              Reference Range:
            </Text>
            <Badge variant="outline" color="green">
              {referenceRange.low !== undefined ? referenceRange.low : '—'} -{' '}
              {referenceRange.high !== undefined ? referenceRange.high : '—'} {statistics.unit}
            </Badge>
          </Group>
        </Paper>
      )}
    </Stack>
  );
}
