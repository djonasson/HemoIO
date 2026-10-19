/**
 * Tooltip for a trend chart point: value, reference range, lab, status and
 * the preview of the point's note
 */
import { Paper, Text, Stack, Group, Badge } from '@mantine/core';
import type { TrendDataPoint } from '@services/statistics/trendAnalysis';

/**
 * Custom tooltip component
 */
export function CustomTooltip({
  active,
  payload,
  label,
  notePreviews,
}: {
  active?: boolean;
  payload?: Array<{ payload: TrendDataPoint & { formattedDate: string } }>;
  label?: string;
  notePreviews?: Record<number, string>;
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
        {data.testValueId !== undefined && notePreviews?.[data.testValueId] && (
          <Stack gap={0}>
            <Text size="xs" fw={500}>
              Note
            </Text>
            <Text size="xs" maw={240}>
              {notePreviews[data.testValueId]}
            </Text>
          </Stack>
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
