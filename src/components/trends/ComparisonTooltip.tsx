import { Paper, Text, Stack, Group, ColorSwatch } from '@mantine/core';
import { formatPointValue } from '@/utils/formatTestValue';
import type { ChartRow } from './comparisonChartRow';
import type { MarkerData } from './MultiMarkerChart';

/**
 * Custom tooltip for multi-marker chart
 */
export function ComparisonTooltip({
  active,
  payload,
  label,
  markers,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ dataKey: string; value: number; color: string; payload?: ChartRow }>;
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
          // As the value reads ("< 10", "5-10"), not the bound or midpoint it is drawn at
          const point = entry.payload?.points[entry.dataKey];
          return (
            <Group key={entry.dataKey} gap="xs">
              <ColorSwatch color={entry.color} size={12} />
              <Text size="sm">
                {entry.dataKey}: {point ? formatPointValue(point) : entry.value} {marker?.unit || ''}
              </Text>
            </Group>
          );
        })}
      </Stack>
    </Paper>
  );
}

