/**
 * The Alerts view: all current alerts; clicking one opens its trend.
 */
import { Stack } from '@mantine/core';
import { OutOfRangeAlerts } from './OutOfRangeAlerts';

export interface AlertsViewProps {
  /** Open a test's trend on the value an alert is about */
  onOpenTrend: (biomarkerKey: string, date: Date, testValueId?: number) => void;
}

export function AlertsView({ onOpenTrend }: AlertsViewProps): React.ReactNode {
  return (
    <Stack gap="md">
      <OutOfRangeAlerts
        onAlertClick={(alert) => onOpenTrend(alert.biomarkerKey, alert.date, alert.testValueId)}
        maxVisible={20}
      />
    </Stack>
  );
}
