/**
 * The Alerts view: all current alerts; clicking one opens its trend.
 */
import { Stack } from '@mantine/core';
import { OutOfRangeAlerts } from './OutOfRangeAlerts';

export interface AlertsViewProps {
  onOpenTrend: (biomarkerKey: string, date: Date) => void;
}

export function AlertsView({ onOpenTrend }: AlertsViewProps): React.ReactNode {
  return (
    <Stack gap="md">
      <OutOfRangeAlerts
        onAlertClick={(alert) => onOpenTrend(alert.biomarkerKey, alert.date)}
        maxVisible={20}
      />
    </Stack>
  );
}
