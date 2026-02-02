/**
 * Timeline Filters Component
 *
 * Provides filtering controls for the timeline view.
 */

import { useCallback } from 'react';
import { Group, TextInput, Button, Paper } from '@mantine/core';
import { DatePickerInput, type DateValue } from '@mantine/dates';
import { IconSearch, IconCalendar, IconX } from '@tabler/icons-react';
import type { LabResultFilters } from '@hooks/useLabResults';

/**
 * Convert a DateValue to a Date or undefined
 */
function toDate(value: DateValue | null): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  // It's a string, parse it
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? undefined : parsed;
}

export interface TimelineFiltersProps {
  /** Current filter values */
  filters: LabResultFilters;
  /** Callback when filters change */
  onFiltersChange: (filters: LabResultFilters) => void;
}

/**
 * Filter controls for the timeline view
 */
export function TimelineFilters({
  filters,
  onFiltersChange,
}: TimelineFiltersProps): React.ReactNode {
  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onFiltersChange({
        ...filters,
        searchTerm: event.target.value || undefined,
      });
    },
    [filters, onFiltersChange]
  );

  const handleStartDateChange = useCallback(
    (value: DateValue | null) => {
      onFiltersChange({
        ...filters,
        startDate: toDate(value),
      });
    },
    [filters, onFiltersChange]
  );

  const handleEndDateChange = useCallback(
    (value: DateValue | null) => {
      onFiltersChange({
        ...filters,
        endDate: toDate(value),
      });
    },
    [filters, onFiltersChange]
  );

  const handleClearFilters = useCallback(() => {
    onFiltersChange({});
  }, [onFiltersChange]);

  const hasActiveFilters =
    filters.searchTerm || filters.startDate || filters.endDate;

  return (
    <Paper p="md" withBorder mb="md">
      <Group gap="md" align="flex-end" wrap="wrap">
        <TextInput
          label="Search"
          placeholder="Search by lab name..."
          leftSection={<IconSearch size={16} />}
          value={filters.searchTerm || ''}
          onChange={handleSearchChange}
          aria-label="Search by lab name"
          style={{ minWidth: 200 }}
        />

        <DatePickerInput
          label="From"
          placeholder="Start date"
          leftSection={<IconCalendar size={16} />}
          value={filters.startDate || null}
          onChange={handleStartDateChange}
          maxDate={filters.endDate || undefined}
          clearable
          aria-label="Filter from date"
          style={{ minWidth: 150 }}
        />

        <DatePickerInput
          label="To"
          placeholder="End date"
          leftSection={<IconCalendar size={16} />}
          value={filters.endDate || null}
          onChange={handleEndDateChange}
          minDate={filters.startDate || undefined}
          clearable
          aria-label="Filter to date"
          style={{ minWidth: 150 }}
        />

        {hasActiveFilters && (
          <Button
            variant="subtle"
            color="gray"
            leftSection={<IconX size={16} />}
            onClick={handleClearFilters}
            aria-label="Clear all filters"
          >
            Clear
          </Button>
        )}
      </Group>
    </Paper>
  );
}
