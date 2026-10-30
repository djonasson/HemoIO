/**
 * OutOfRangeAlerts Component
 *
 * The alerts summary: one card per test with something new, covering its
 * out-of-range results, its trend and its improvement.
 */

import {
  Stack,
  Paper,
  Text,
  Group,
  Badge,
  Button,
  Center,
  Select,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { IconAlertCircle, IconCheck, IconEye, IconEyeOff, IconFilter } from '@tabler/icons-react';
import { useState, useMemo, useCallback } from 'react';
import { useAlerts, type BiomarkerAlert } from '@hooks/useAlerts';
import { CATEGORY_NAMES } from '@data/biomarkers/dictionary';
import { AlertGroupCard } from './AlertGroupCard';
import type { BiomarkerCategory } from '@/types';

/**
 * Props for OutOfRangeAlerts component
 */
export interface OutOfRangeAlertsProps {
  /** Called with the alert a card or an earlier result opens, to show its trend */
  onAlertClick?: (alert: BiomarkerAlert) => void;
  /** Whether to show the filter controls */
  showFilters?: boolean;
  /** Maximum number of cards to show before collapsing */
  maxVisible?: number;
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
    groups,
    unacknowledgedCount,
    hiddenCount,
    assessedCount,
    isLoading,
    error,
    dismissGroup,
    acknowledgeGroup,
  } = useAlerts();

  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleAcknowledge = useCallback(
    (biomarkerKey: string) => {
      setSaveError(null);
      acknowledgeGroup(biomarkerKey).catch(() => {
        setSaveError('Could not save the acknowledgement. Please try again.');
      });
    },
    [acknowledgeGroup]
  );

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const group of groups) {
      if (group.headline.category) {
        cats.add(group.headline.category);
      }
    }
    return Array.from(cats).map((cat) => ({
      value: cat,
      label: CATEGORY_NAMES[cat as BiomarkerCategory] || cat,
    }));
  }, [groups]);

  // A category whose cards are all gone (acknowledged, dismissed) is no
  // longer offered, so it cannot stay selected either
  const activeCategory =
    categoryFilter !== null && categories.some((c) => c.value === categoryFilter)
      ? categoryFilter
      : null;

  const filteredGroups = useMemo(
    () =>
      activeCategory ? groups.filter((g) => g.headline.category === activeCategory) : groups,
    [groups, activeCategory]
  );

  const visibleGroups = showAll ? filteredGroups : filteredGroups.slice(0, maxVisible);
  const hasMore = filteredGroups.length > maxVisible;

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
  if (groups.length === 0 && hiddenCount > 0) {
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

  // Nothing imported, or no value with a reference range: nothing is normal yet
  if (groups.length === 0 && assessedCount === 0) {
    return (
      <Paper p="lg" withBorder>
        <Center>
          <Stack align="center" gap="xs">
            <Text fw={500}>No values to check yet</Text>
            <Text size="sm" c="dimmed" ta="center">
              Alerts appear here for imported values outside their reference range.
            </Text>
          </Stack>
        </Center>
      </Paper>
    );
  }

  // All values normal
  if (groups.length === 0) {
    return (
      <Paper p="lg" withBorder bg="var(--mantine-color-green-light)">
        <Center>
          <Stack align="center" gap="xs">
            <ThemeIcon color="green" size="xl" radius="xl">
              <IconCheck size={24} />
            </ThemeIcon>
            <Text fw={500}>All values within normal range</Text>
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

      <Stack gap="sm">
        {visibleGroups.map((group) => (
          <AlertGroupCard
            key={group.biomarkerKey}
            group={group}
            onAcknowledge={() => handleAcknowledge(group.biomarkerKey)}
            onDismiss={() => dismissGroup(group.biomarkerKey)}
            onOpen={onAlertClick}
          />
        ))}
      </Stack>

      {hasMore && (
        <Button
          variant="subtle"
          size="sm"
          leftSection={showAll ? <IconEyeOff size={14} /> : <IconEye size={14} />}
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? 'Show less' : `Show ${filteredGroups.length - maxVisible} more alerts`}
        </Button>
      )}
    </Stack>
  );
}
