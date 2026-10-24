/**
 * OutOfRangeAlerts Component
 *
 * Displays a summary of alerts for abnormal biomarker values.
 * Shows out-of-range values, trend alerts, and improvement notifications.
 */

import {
  Stack,
  Paper,
  Text,
  Group,
  Badge,
  ActionIcon,
  Collapse,
  Button,
  Center,
  Tooltip,
  Select,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconAlertCircle,
  IconTrendingUp,
  IconTrendingDown,
  IconCheck,
  IconX,
  IconChevronDown,
  IconChevronUp,
  IconEye,
  IconEyeOff,
  IconFilter,
} from '@tabler/icons-react';
import { useState, useMemo, useCallback } from 'react';
import { useAlerts, type BiomarkerAlert, type GroupedAlert } from '@hooks/useAlerts';
import { indicatorColor } from '@services/alerts';
import { CATEGORY_NAMES } from '@data/biomarkers/dictionary';
import { RelativeTime } from '@components/common/RelativeTime';
import type { BiomarkerCategory } from '@/types';

/**
 * Props for OutOfRangeAlerts component
 */
export interface OutOfRangeAlertsProps {
  /** Callback when an alert is clicked to navigate to trends */
  onAlertClick?: (alert: BiomarkerAlert) => void;
  /** Whether to show the filter controls */
  showFilters?: boolean;
  /** Maximum number of alerts to show before collapsing */
  maxVisible?: number;
}

/**
 * Get status icon
 */
function getStatusIcon(alert: BiomarkerAlert) {
  if (alert.type === 'improvement') {
    return <IconCheck size={16} />;
  }
  // A trend points the way it moves, which may be back toward the range
  if (alert.direction) {
    return alert.direction === 'increasing' ? (
      <IconTrendingUp size={16} />
    ) : (
      <IconTrendingDown size={16} />
    );
  }
  const status = alert.status;
  if (status === 'high') {
    return <IconTrendingUp size={16} />;
  }
  if (status === 'low') {
    return <IconTrendingDown size={16} />;
  }
  return <IconAlertCircle size={16} />;
}

/**
 * Single alert card
 */
function AlertCard({
  alert,
  onDismiss,
  onAcknowledge,
  onClick,
}: {
  alert: BiomarkerAlert;
  onDismiss: () => void;
  onAcknowledge: () => void;
  onClick?: () => void;
}) {
  const color = indicatorColor(alert);
  const isCritical = alert.severity === 'critical';
  const stateWord = alert.type === 'improvement' ? 'improved' : (alert.direction ?? alert.status);
  const severityWord = alert.type === 'improvement' ? 'positive' : alert.severity;

  return (
    <Paper
      p="sm"
      withBorder
      style={{
        borderLeftWidth: isCritical ? 6 : 4,
        borderLeftColor: `var(--mantine-color-${color}-6)`,
        cursor: onClick ? 'pointer' : 'default',
      }}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              // Only the card itself: Enter on its buttons must not also open it
              if (
                event.target === event.currentTarget &&
                (event.key === 'Enter' || event.key === ' ')
              ) {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      tabIndex={onClick ? 0 : undefined}
      role="article"
      aria-label={`Alert for ${alert.biomarkerName}: ${severityWord}, ${stateWord}. ${alert.message}`}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon color={color} variant="light" size="md">
            {getStatusIcon(alert)}
          </ThemeIcon>
          <Stack gap={2}>
            <Group gap="xs">
              <Text size="sm" fw={500}>
                {alert.biomarkerName}
              </Text>
              {alert.type !== 'improvement' && (
                <Badge size="xs" color={color} variant={isCritical ? 'filled' : 'light'}>
                  {isCritical ? 'Critical' : 'Warning'}
                </Badge>
              )}
              <Badge size="xs" color={color} variant="light">
                {alert.status}
              </Badge>
              {alert.type === 'trend' && (
                <Badge size="xs" variant="outline">
                  Trend
                </Badge>
              )}
              {alert.type === 'improvement' && (
                <Badge size="xs" color="green" variant="outline">
                  Improved
                </Badge>
              )}
            </Group>
            <Text size="xs" c="dimmed">
              {alert.message}
            </Text>
            <Group gap="xs">
              <RelativeTime date={alert.date} precision="day" />
              <Text size="xs" c="dimmed">
                · {alert.labName}
              </Text>
            </Group>
          </Stack>
        </Group>

        <Group gap="xs" wrap="nowrap">
          <Tooltip label="Acknowledge">
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              onClick={(e) => {
                e.stopPropagation();
                onAcknowledge();
              }}
              aria-label="Acknowledge alert"
            >
              <IconEye size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Dismiss">
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              aria-label="Dismiss alert"
            >
              <IconX size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
    </Paper>
  );
}

/**
 * Grouped alerts for a single biomarker
 */
function GroupedAlertCard({
  group,
  onDismiss,
  onAcknowledge,
  onClick,
}: {
  group: GroupedAlert;
  onDismiss: (alertId: string) => void;
  onAcknowledge: (alertId: string) => void;
  onClick?: (alert: BiomarkerAlert) => void;
}) {
  const [opened, { toggle }] = useDisclosure(false);
  const color = indicatorColor(group.latestAlert);

  return (
    <Paper withBorder>
      <UnstyledButton
        w="100%"
        p="sm"
        style={{ borderLeft: `4px solid var(--mantine-color-${color}-6)` }}
        onClick={toggle}
        aria-expanded={opened}
        aria-label={`${group.biomarkerName}: ${group.alerts.length} alerts`}
      >
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm">
            <ThemeIcon color={color} variant="light" size="md">
              {getStatusIcon(group.latestAlert)}
            </ThemeIcon>
            <Stack gap={2}>
              <Group gap="xs">
                <Text size="sm" fw={500}>
                  {group.biomarkerName}
                </Text>
                <Badge size="xs" color={color}>
                  {group.alerts.length} {group.alerts.length === 1 ? 'alert' : 'alerts'}
                </Badge>
                {group.unacknowledgedCount > 0 && (
                  <Badge size="xs" color="red" variant="filled">
                    {group.unacknowledgedCount} new
                  </Badge>
                )}
              </Group>
              {group.category && (
                <Text size="xs" c="dimmed">
                  {CATEGORY_NAMES[group.category as BiomarkerCategory] || group.category}
                </Text>
              )}
            </Stack>
          </Group>
          {opened ? (
            <IconChevronUp size={16} aria-hidden="true" />
          ) : (
            <IconChevronDown size={16} aria-hidden="true" />
          )}
        </Group>
      </UnstyledButton>

      <Collapse in={opened}>
        <Stack gap="xs" p="sm" pt={0}>
          {group.alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onDismiss={() => onDismiss(alert.id)}
              onAcknowledge={() => onAcknowledge(alert.id)}
              onClick={onClick ? () => onClick(alert) : undefined}
            />
          ))}
        </Stack>
      </Collapse>
    </Paper>
  );
}

/**
 * OutOfRangeAlerts component displays alert summary
 */
export function OutOfRangeAlerts({
  onAlertClick,
  showFilters = true,
  maxVisible = 5,
}: OutOfRangeAlertsProps) {
  const {
    alerts,
    groupedAlerts,
    unacknowledgedCount,
    hiddenCount,
    isLoading,
    error,
    dismissAlert,
    acknowledgeAlert,
    filterByCategory,
  } = useAlerts();

  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleAcknowledge = useCallback(
    (alertId: string) => {
      setSaveError(null);
      acknowledgeAlert(alertId).catch(() => {
        setSaveError('Could not save the acknowledgement. Please try again.');
      });
    },
    [acknowledgeAlert]
  );

  // Get unique categories for filter
  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const alert of alerts) {
      if (alert.category) {
        cats.add(alert.category);
      }
    }
    return Array.from(cats).map((cat) => ({
      value: cat,
      label: CATEGORY_NAMES[cat as BiomarkerCategory] || cat,
    }));
  }, [alerts]);

  // A category whose alerts are all gone (acknowledged, dismissed) is no
  // longer offered, so it cannot stay selected either
  const activeCategory =
    categoryFilter !== null && categories.some((c) => c.value === categoryFilter)
      ? categoryFilter
      : null;

  // Filter alerts by category
  const filteredAlerts = useMemo(
    () => filterByCategory(activeCategory),
    [activeCategory, filterByCategory]
  );

  // Filter groups by category
  const filteredGroups = useMemo(() => {
    if (!activeCategory) return groupedAlerts;
    return groupedAlerts.filter((g) => g.category === activeCategory);
  }, [groupedAlerts, activeCategory]);

  // Visible alerts (respecting maxVisible)
  const visibleAlerts = showAll ? filteredAlerts : filteredAlerts.slice(0, maxVisible);
  const hasMore = filteredAlerts.length > maxVisible;

  if (isLoading) {
    return (
      <Paper p="md" withBorder>
        <Center>
          <Text c="dimmed">Loading alerts...</Text>
        </Center>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper p="md" withBorder>
        <Group gap="xs">
          <IconAlertCircle size={16} color="red" />
          <Text c="red" size="sm">
            {error}
          </Text>
        </Group>
      </Paper>
    );
  }

  // Acknowledged or dismissed alerts are still out-of-range values: never
  // call them normal
  if (alerts.length === 0 && hiddenCount > 0) {
    return (
      <Paper p="lg" withBorder>
        <Center>
          <Stack align="center" gap="xs">
            <ThemeIcon color="blue" variant="light" size="xl" radius="xl">
              <IconCheck size={24} />
            </ThemeIcon>
            <Text fw={500}>No new alerts</Text>
            <Text size="sm" c="dimmed" ta="center">
              You have acknowledged or dismissed every alert. Values outside their reference
              range are still marked in the Timeline.
            </Text>
          </Stack>
        </Center>
      </Paper>
    );
  }

  // All values normal
  if (alerts.length === 0) {
    return (
      <Paper p="lg" withBorder bg="green.0">
        <Center>
          <Stack align="center" gap="xs">
            <ThemeIcon color="green" size="xl" radius="xl">
              <IconCheck size={24} />
            </ThemeIcon>
            <Text fw={500} c="green.7">
              All values within normal range
            </Text>
            <Text size="sm" c="dimmed">
              No abnormal biomarker values detected
            </Text>
          </Stack>
        </Center>
      </Paper>
    );
  }

  return (
    <Stack gap="md">
      {/* Header */}
      <Group justify="space-between">
        <Group gap="xs">
          <IconAlertCircle size={20} />
          <Title order={2} size="h4">
            Alerts
          </Title>
          {unacknowledgedCount > 0 && (
            <Badge color="red" variant="filled" size="sm">
              {unacknowledgedCount} new
            </Badge>
          )}
        </Group>
        {showFilters && categories.length > 1 && (
          <Select
            placeholder="Filter by category"
            data={categories}
            value={activeCategory}
            onChange={setCategoryFilter}
            clearable
            size="xs"
            leftSection={<IconFilter size={14} />}
            w={200}
            aria-label="Filter alerts by category"
          />
        )}
      </Group>

      {saveError && (
        <Text role="alert" c="red" size="sm">
          {saveError}
        </Text>
      )}

      {/* Alert list */}
      <Stack gap="sm">
        {visibleAlerts.map((alert) => (
          <AlertCard
            key={alert.id}
            alert={alert}
            onDismiss={() => dismissAlert(alert.id)}
            onAcknowledge={() => handleAcknowledge(alert.id)}
            onClick={onAlertClick ? () => onAlertClick(alert) : undefined}
          />
        ))}
      </Stack>

      {/* Show more/less */}
      {hasMore && (
        <Button
          variant="subtle"
          size="sm"
          leftSection={showAll ? <IconEyeOff size={14} /> : <IconEye size={14} />}
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? 'Show less' : `Show ${filteredAlerts.length - maxVisible} more alerts`}
        </Button>
      )}

      {/* Summary by biomarker */}
      {filteredGroups.length > 1 && (
        <Stack gap="xs">
          <Text size="sm" c="dimmed" fw={500}>
            By Biomarker
          </Text>
          {filteredGroups.map((group) => (
            <GroupedAlertCard
              key={group.biomarkerKey}
              group={group}
              onDismiss={dismissAlert}
              onAcknowledge={handleAcknowledge}
              onClick={onAlertClick}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
