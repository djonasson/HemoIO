/**
 * One earlier out-of-range result on a test's alert card; a button to its
 * trend when the card can open trends.
 */

import { Badge, Group, Text, UnstyledButton } from '@mantine/core';
import { indicatorColor, type GroupedResult } from '@services/alerts';
import { formatShortDate } from '@/utils/formatShortDate';
import { formatPointValue } from '@/utils/formatTestValue';
import type { BiomarkerAlert } from '@hooks/useAlerts';

export interface EarlierResultProps {
  result: GroupedResult<BiomarkerAlert>;
  /** Open the result's trend at its date */
  onOpen?: (alert: BiomarkerAlert) => void;
}

/** An earlier result's details, as shown and as announced */
function resultSummary({ alert, isNew }: GroupedResult<BiomarkerAlert>): string {
  const critical = alert.severity === 'critical' ? ', critical' : '';
  return `${formatShortDate(alert.date)}: ${formatPointValue(alert)} ${alert.unit}, ${alert.status}${critical}, ${alert.labName}${isNew ? ', new' : ''}`;
}

const ROW_PADDING = { padding: '4px var(--mantine-spacing-xs)' };

export function EarlierResult({
  result,
  onOpen,
}: EarlierResultProps): React.ReactNode {
  const { alert, isNew } = result;
  const content = (
    <Group gap="xs" wrap="wrap">
      <Text size="xs" fw={500}>
        {formatShortDate(alert.date)}
      </Text>
      <Text size="xs">
        {formatPointValue(alert)} {alert.unit}
      </Text>
      <Badge size="xs" color={indicatorColor(alert)} variant="light">
        {alert.status}
      </Badge>
      {alert.severity === 'critical' && (
        <Badge size="xs" color={indicatorColor(alert)} variant="filled">
          Critical
        </Badge>
      )}
      <Text size="xs" c="dimmed">
        {alert.labName}
      </Text>
      {isNew && (
        <Badge size="xs" color="red" variant="filled">
          New
        </Badge>
      )}
    </Group>
  );

  return (
    <li style={{ borderLeft: `3px solid var(--mantine-color-${indicatorColor(alert)}-6)` }}>
      {onOpen ? (
        <UnstyledButton
          w="100%"
          style={ROW_PADDING}
          onClick={(event) => {
            event.stopPropagation();
            onOpen(alert);
          }}
          aria-label={`Open trend at ${resultSummary(result)}`}
        >
          {content}
        </UnstyledButton>
      ) : (
        <div style={ROW_PADDING}>{content}</div>
      )}
    </li>
  );
}
