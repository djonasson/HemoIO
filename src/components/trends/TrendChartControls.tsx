/**
 * TrendChartControls Component
 *
 * Provides controls for selecting biomarkers and date ranges
 * for the trend chart visualization.
 */

import { Select, Group, Stack, Button, Text } from '@mantine/core';
import { DatePickerInput, type DateValue } from '@mantine/dates';
import { IconRefresh, IconChartLine } from '@tabler/icons-react';
import type { BiomarkerCategory } from '@/types';
import { CATEGORY_NAMES } from '@data/biomarkers/dictionary';

/**
 * Available biomarker option for selection
 */
export interface BiomarkerOption {
  /** Biomarker ID */
  value: string;
  /** Display label */
  label: string;
  /** Biomarker category */
  category: BiomarkerCategory;
  /** Number of data points available */
  dataPointCount: number;
}

/**
 * Props for TrendChartControls component
 */
export interface TrendChartControlsProps {
  /** Available biomarkers to select from */
  biomarkerOptions: BiomarkerOption[];
  /** Currently selected biomarker ID */
  selectedBiomarkerId: string | null;
  /** Callback when biomarker selection changes */
  onBiomarkerChange: (biomarkerId: string | null) => void;
  /** Start date filter */
  startDate: Date | null;
  /** End date filter */
  endDate: Date | null;
  /** Callback when start date changes */
  onStartDateChange: (date: Date | null) => void;
  /** Callback when end date changes */
  onEndDateChange: (date: Date | null) => void;
  /** Callback to reset all filters */
  onReset: () => void;
  /** Callback to open compare mode */
  onCompare?: () => void;
  /** Whether compare button should be shown */
  showCompareButton?: boolean;
  /** Whether controls are disabled */
  disabled?: boolean;
}

/**
 * Convert DateValue to Date or null
 */
function toDate(value: DateValue | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Group biomarker options by category
 */
function groupByCategory(options: BiomarkerOption[]): {
  group: string;
  items: Array<{ value: string; label: string; disabled?: boolean }>;
}[] {
  const groups = new Map<BiomarkerCategory, BiomarkerOption[]>();

  for (const option of options) {
    if (!groups.has(option.category)) {
      groups.set(option.category, []);
    }
    groups.get(option.category)!.push(option);
  }

  const result: {
    group: string;
    items: Array<{ value: string; label: string; disabled?: boolean }>;
  }[] = [];

  for (const [category, categoryOptions] of groups.entries()) {
    // Sort by data point count (more data first), then alphabetically
    const sortedOptions = [...categoryOptions].sort((a, b) => {
      if (b.dataPointCount !== a.dataPointCount) {
        return b.dataPointCount - a.dataPointCount;
      }
      return a.label.localeCompare(b.label);
    });

    result.push({
      group: CATEGORY_NAMES[category] || category,
      items: sortedOptions.map((opt) => ({
        value: opt.value,
        label: `${opt.label} (${opt.dataPointCount} ${opt.dataPointCount === 1 ? 'value' : 'values'})`,
        disabled: opt.dataPointCount === 0,
      })),
    });
  }

  // Sort groups by name
  return result.sort((a, b) => a.group.localeCompare(b.group));
}

/**
 * TrendChartControls component
 */
export function TrendChartControls({
  biomarkerOptions,
  selectedBiomarkerId,
  onBiomarkerChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onReset,
  onCompare,
  showCompareButton = true,
  disabled = false,
}: TrendChartControlsProps) {
  const groupedOptions = groupByCategory(biomarkerOptions);

  // Find selected option for display
  const selectedOption = biomarkerOptions.find(
    (opt) => opt.value === selectedBiomarkerId
  );

  return (
    <Stack gap="md">
      <Group grow>
        <Select
          label="Select Biomarker"
          placeholder="Choose a biomarker to visualize"
          data={groupedOptions}
          value={selectedBiomarkerId}
          onChange={onBiomarkerChange}
          searchable
          clearable
          disabled={disabled}
          nothingFoundMessage="No biomarkers found"
          aria-label="Select biomarker to view trend"
        />
      </Group>

      <Group grow>
        <DatePickerInput
          label="From Date"
          placeholder="Start date"
          value={startDate}
          onChange={(value) => onStartDateChange(toDate(value))}
          maxDate={endDate || new Date()}
          clearable
          disabled={disabled}
          aria-label="Filter from date"
        />
        <DatePickerInput
          label="To Date"
          placeholder="End date"
          value={endDate}
          onChange={(value) => onEndDateChange(toDate(value))}
          minDate={startDate || undefined}
          maxDate={new Date()}
          clearable
          disabled={disabled}
          aria-label="Filter to date"
        />
      </Group>

      <Group justify="space-between">
        <Group gap="xs">
          <Button
            variant="subtle"
            size="sm"
            leftSection={<IconRefresh size={16} />}
            onClick={onReset}
            disabled={disabled}
          >
            Reset
          </Button>
          {showCompareButton && onCompare && (
            <Button
              variant="light"
              size="sm"
              leftSection={<IconChartLine size={16} />}
              onClick={onCompare}
              disabled={disabled || !selectedBiomarkerId}
            >
              Compare Markers
            </Button>
          )}
        </Group>

        {selectedOption && (
          <Text size="sm" c="dimmed">
            Showing {selectedOption.dataPointCount}{' '}
            {selectedOption.dataPointCount === 1 ? 'data point' : 'data points'}
          </Text>
        )}
      </Group>
    </Stack>
  );
}
