/**
 * One test's alert card: its latest result, its trend, and its earlier
 * out-of-range results behind a toggle.
 */

import { useId } from 'react';
import {
  ActionIcon,
  Badge,
  Collapse,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconAlertCircle,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconEye,
  IconTrendingDown,
  IconTrendingUp,
  IconX,
} from '@tabler/icons-react';
import { indicatorColor, type TrendDirection } from '@services/alerts';
import { RelativeTime } from '@components/common/RelativeTime';
import { EarlierResult } from './EarlierResult';
import type { BiomarkerAlert, GroupedAlert } from '@hooks/useAlerts';

export interface AlertGroupCardProps {
  group: GroupedAlert;
  /** Acknowledge every result of the card's test */
  onAcknowledge: () => void;
  /** Hide the card until the next page load */
  onDismiss: () => void;
  /** Open an alert's trend: the card opens its headline, a listed result its own */
  onOpen?: (alert: BiomarkerAlert) => void;
}

function statusIcon(alert: BiomarkerAlert, direction?: TrendDirection): React.ReactNode {
  if (alert.type === 'improvement') return <IconCheck size={16} />;
  // A trend points the way it moves, which may be back toward the range
  const way =
    direction ??
    (alert.status === 'high' ? 'increasing' : alert.status === 'low' ? 'decreasing' : undefined);
  if (way === 'increasing') return <IconTrendingUp size={16} />;
  if (way === 'decreasing') return <IconTrendingDown size={16} />;
  return <IconAlertCircle size={16} />;
}

function plural(count: number, word: string): string {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}

export function AlertGroupCard({
  group,
  onAcknowledge,
  onDismiss,
  onOpen,
}: AlertGroupCardProps): React.ReactNode {
  const [opened, { toggle }] = useDisclosure(false);
  const listId = useId();
  const { headline, trend, earlier, resultCount, newCount, severity, mostSevere } = group;
  const name = headline.biomarkerName;
  // The card's severity, border and badge follow its most severe new result,
  // which may be an earlier one; the status badge follows the headline
  const color = indicatorColor(mostSevere);
  const statusColor = indicatorColor(headline);
  const isCritical = severity === 'critical';
  const stateWord =
    headline.type === 'improvement' ? 'improved' : (trend?.direction ?? headline.status);
  // An old result heading the card must not read as the test's current state
  const inRangeNote =
    headline.type !== 'out_of_range' || headline.latestStatus === 'high' || headline.latestStatus === 'low'
      ? null
      : headline.latestStatus === 'normal'
        ? 'Latest result within range'
        : 'Latest result has no reference range';
  const counts = (separator: string): string =>
    newCount > 0
      ? `${plural(resultCount, 'result')}${separator}${newCount} new`
      : plural(resultCount, 'result');
  const open = onOpen ? () => onOpen(headline) : undefined;

  return (
    <Paper
      p="sm"
      withBorder
      style={{
        borderLeftWidth: isCritical ? 6 : 4,
        borderLeftColor: `var(--mantine-color-${color}-6)`,
        cursor: open ? 'pointer' : 'default',
      }}
      onClick={open}
      onKeyDown={
        open
          ? (event) => {
              // Only the card itself: Enter on its buttons must not also open it
              if (
                event.target === event.currentTarget &&
                (event.key === 'Enter' || event.key === ' ')
              ) {
                event.preventDefault();
                open();
              }
            }
          : undefined
      }
      tabIndex={open ? 0 : undefined}
      role="article"
      aria-label={`Alert for ${name}: ${severity}, ${stateWord}. ${headline.message}. ${inRangeNote ? `${inRangeNote}. ` : ''}${counts(', ')}`}
    >
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <ThemeIcon color={color} variant="light" size="md">
            {statusIcon(headline, trend?.direction)}
          </ThemeIcon>
          <Stack gap={2}>
            <Group gap="xs">
              <Text size="sm" fw={500}>
                {name}
              </Text>
              {severity !== 'positive' && (
                <Badge size="xs" color={color} variant={isCritical ? 'filled' : 'light'}>
                  {isCritical ? 'Critical' : 'Warning'}
                </Badge>
              )}
              <Badge size="xs" color={statusColor} variant="light">
                {headline.status}
              </Badge>
              {trend && (
                <Badge size="xs" variant="outline">
                  Trend
                </Badge>
              )}
              {headline.type === 'improvement' && (
                <Badge size="xs" color="green" variant="outline">
                  Improved
                </Badge>
              )}
            </Group>
            <Text size="xs" c="dimmed">
              {headline.message}
            </Text>
            {trend && (
              <Text size="xs" c="dimmed">
                {trend.message}
              </Text>
            )}
            {inRangeNote && (
              <Text size="xs" fw={500}>
                {inRangeNote}
              </Text>
            )}
            <Group gap="xs">
              <RelativeTime date={headline.date} precision="day" />
              <Text size="xs" c="dimmed">
                · {headline.labName}
              </Text>
            </Group>
            <Text size="xs" fw={500}>
              {counts(' · ')}
            </Text>
          </Stack>
        </Group>

        <Group gap="xs" wrap="nowrap">
          <Tooltip label="Acknowledge all results">
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              onClick={(e) => {
                e.stopPropagation();
                onAcknowledge();
              }}
              aria-label={`Acknowledge all ${name} results`}
            >
              <IconEye size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Dismiss until next visit">
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              aria-label={`Dismiss ${name} alert`}
            >
              <IconX size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {earlier.length > 0 && (
        <>
          <UnstyledButton
            mt="xs"
            onClick={(event) => {
              event.stopPropagation();
              toggle();
            }}
            aria-expanded={opened}
            aria-controls={listId}
          >
            <Group gap={4}>
              {opened ? (
                <IconChevronUp size={14} aria-hidden="true" />
              ) : (
                <IconChevronDown size={14} aria-hidden="true" />
              )}
              <Text size="xs" c="var(--mantine-color-anchor)">
                {opened ? 'Hide earlier results' : `Show ${plural(earlier.length, 'earlier result')}`}
              </Text>
            </Group>
          </UnstyledButton>
          <Collapse in={opened}>
            <Stack
              component="ul"
              id={listId}
              gap={4}
              mt="xs"
              p={0}
              style={{ listStyle: 'none' }}
              aria-label={`Earlier ${name} results`}
              // A click between the rows belongs to no row, and must not open the headline
              onClick={(event: React.MouseEvent) => event.stopPropagation()}
            >
              {earlier.map((result) => (
                <EarlierResult key={result.alert.id} result={result} onOpen={onOpen} />
              ))}
            </Stack>
          </Collapse>
        </>
      )}
    </Paper>
  );
}
