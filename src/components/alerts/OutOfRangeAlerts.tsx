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
import { useState, useMemo } from 'react';
import { useAlerts, type BiomarkerAlert, type GroupedAlert } from '@hooks/useAlerts';
import { CATEGORY_NAMES } from '@data/biomarkers/dictionary';
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
 * Format relative time
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  } else {
    const years = Math.floor(diffDays / 365);
    return `${years} ${years === 1 ? 'year' : 'years'} ago`;
  }
}

/**
 * Get severity color
 */
function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'red';
    case 'warning':
      return 'orange';
    case 'positive':
      return 'green';
    default:
      return 'blue';
  }
}

/**
 * Get status icon
 */
function getStatusIcon(status: string, severity: string) {
  if (severity === 'positive') {
    return <IconCheck size={16} />;
  }
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
  const color = getSeverityColor(alert.severity);

  return (
    <Paper
      p="sm"
      withBorder
      style={{
        borderLeftWidth: 4,
        borderLeftColor: `var(--mantine-color-${color}-6)`,
        cursor: onClick ? 'pointer' : 'default',
        opacity: alert.acknowledged ? 0.7 : 1,
      }}
      onClick={onClick}
      role="article"
      aria-label={`Alert for ${alert.biomarkerName}: ${alert.message}`}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon color={color} variant="light" size="md">
            {getStatusIcon(alert.status, alert.severity)}
          </ThemeIcon>
          <Stack gap={2}>
            <Group gap="xs">
              <Text size="sm" fw={500}>
                {alert.biomarkerName}
              </Text>
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
              <Tooltip label={alert.date.toLocaleDateString()}>
                <Text size="xs" c="dimmed">
                  {formatRelativeTime(alert.date)}
                </Text>
              </Tooltip>
              <Text size="xs" c="dimmed">
                · {alert.labName}
              </Text>
            </Group>
          </Stack>
        </Group>

        <Group gap="xs" wrap="nowrap">
          {!alert.acknowledged && (
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
          )}
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
  const color = getSeverityColor(group.severity);

  return (
    <Paper withBorder>
      <Group
        justify="space-between"
        p="sm"
        style={{
          borderLeft: `4px solid var(--mantine-color-${color}-6)`,
          cursor: 'pointer',
        }}
        onClick={toggle}
        role="button"
        aria-expanded={opened}
        aria-label={`${group.biomarkerName}: ${group.alerts.length} alerts`}
      >
        <Group gap="sm">
          <ThemeIcon color={color} variant="light" size="md">
            {getStatusIcon(group.latestAlert.status, group.severity)}
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
        <ActionIcon variant="subtle" size="sm">
          {opened ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
        </ActionIcon>
      </Group>

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
    isLoading,
    error,
    dismissAlert,
    acknowledgeAlert,
    filterByCategory,
  } = useAlerts();

  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

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

  // Filter alerts by category
  const filteredAlerts = useMemo(() => {
    if (!categoryFilter) return alerts;
    return filterByCategory(categoryFilter);
  }, [alerts, categoryFilter, filterByCategory]);

  // Filter groups by category
  const filteredGroups = useMemo(() => {
    if (!categoryFilter) return groupedAlerts;
    return groupedAlerts.filter((g) => g.category === categoryFilter);
  }, [groupedAlerts, categoryFilter]);

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
          <Text fw={500}>Alerts</Text>
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
            value={categoryFilter}
            onChange={setCategoryFilter}
            clearable
            size="xs"
            leftSection={<IconFilter size={14} />}
            w={200}
            aria-label="Filter alerts by category"
          />
        )}
      </Group>

      {/* Alert list */}
      <Stack gap="sm">
        {visibleAlerts.map((alert) => (
          <AlertCard
            key={alert.id}
            alert={alert}
            onDismiss={() => dismissAlert(alert.id)}
            onAcknowledge={() => acknowledgeAlert(alert.id)}
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
          {showAll
            ? 'Show less'
            : `Show ${filteredAlerts.length - maxVisible} more alerts`}
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
              key={group.biomarkerId}
              group={group}
              onDismiss={dismissAlert}
              onAcknowledge={acknowledgeAlert}
              onClick={onAlertClick}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
