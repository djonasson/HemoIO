/**
 * Test Values List Component
 *
 * Displays a table of test values with status indicators.
 */

import { Table, Text, Group, Tooltip, ThemeIcon } from '@mantine/core';
import {
  IconArrowUp,
  IconArrowDown,
  IconCheck,
  IconMinus,
} from '@tabler/icons-react';
import type { EnrichedTestValue, TestValueStatus } from '@hooks/useLabResults';
import { findBiomarker } from '@data/biomarkers/dictionary';

export interface TestValuesListProps {
  /** Test values to display */
  testValues: EnrichedTestValue[];
}

/**
 * Get icon and color for a test value status
 */
function getStatusIndicator(status: TestValueStatus): {
  icon: React.ReactNode;
  color: string;
  label: string;
} {
  switch (status) {
    case 'high':
      return {
        icon: <IconArrowUp size={14} />,
        color: 'red',
        label: 'Above reference range',
      };
    case 'low':
      return {
        icon: <IconArrowDown size={14} />,
        color: 'orange',
        label: 'Below reference range',
      };
    case 'normal':
      return {
        icon: <IconCheck size={14} />,
        color: 'green',
        label: 'Within reference range',
      };
    default:
      return {
        icon: <IconMinus size={14} />,
        color: 'gray',
        label: 'No reference range available',
      };
  }
}

/**
 * Format reference range for display
 */
function formatReferenceRange(
  low: number | undefined,
  high: number | undefined,
  unit: string
): string {
  if (low === undefined && high === undefined) {
    return '—';
  }

  const lowStr = low !== undefined ? low.toString() : '?';
  const highStr = high !== undefined ? high.toString() : '?';

  return `${lowStr} - ${highStr} ${unit}`;
}

/**
 * Get biomarker display name from ID or raw text
 */
function getBiomarkerName(testValue: EnrichedTestValue): string {
  // First check if biomarkerName is already set
  if (testValue.biomarkerName) {
    return testValue.biomarkerName;
  }

  // Try to find in dictionary by raw text
  if (testValue.rawText) {
    const found = findBiomarker(testValue.rawText);
    if (found) {
      return found.name;
    }
    return testValue.rawText;
  }

  return `Biomarker #${testValue.biomarkerId}`;
}

/**
 * Format the value for display
 */
function formatValue(value: number | string | boolean): string {
  if (typeof value === 'boolean') {
    return value ? 'Positive' : 'Negative';
  }
  if (typeof value === 'number') {
    // Round to 2 decimal places if needed
    return Number.isInteger(value) ? value.toString() : value.toFixed(2);
  }
  return String(value);
}

/**
 * Table of test values with status indicators
 */
export function TestValuesList({
  testValues,
}: TestValuesListProps): React.ReactNode {
  if (testValues.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="md">
        No test values recorded for this result.
      </Text>
    );
  }

  return (
    <Table striped highlightOnHover withTableBorder aria-label="Test values">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Status</Table.Th>
          <Table.Th>Biomarker</Table.Th>
          <Table.Th>Value</Table.Th>
          <Table.Th>Unit</Table.Th>
          <Table.Th>Reference Range</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {testValues.map((testValue) => {
          const indicator = getStatusIndicator(testValue.status);
          const biomarkerName = getBiomarkerName(testValue);

          return (
            <Table.Tr
              key={testValue.id}
              data-status={testValue.status}
              aria-label={`${biomarkerName}: ${formatValue(testValue.value)} ${testValue.unit}, ${indicator.label}`}
            >
              <Table.Td>
                <Tooltip label={indicator.label}>
                  <ThemeIcon
                    size="sm"
                    color={indicator.color}
                    variant="light"
                    radius="xl"
                    aria-label={indicator.label}
                  >
                    {indicator.icon}
                  </ThemeIcon>
                </Tooltip>
              </Table.Td>
              <Table.Td>
                <Text size="sm" fw={500}>
                  {biomarkerName}
                </Text>
              </Table.Td>
              <Table.Td>
                <Group gap={4}>
                  <Text
                    size="sm"
                    fw={testValue.status !== 'normal' && testValue.status !== 'unknown' ? 600 : 400}
                    c={testValue.status === 'high' ? 'red' : testValue.status === 'low' ? 'orange' : undefined}
                  >
                    {formatValue(testValue.value)}
                  </Text>
                </Group>
              </Table.Td>
              <Table.Td>
                <Text size="sm" c="dimmed">
                  {testValue.unit}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm" c="dimmed">
                  {formatReferenceRange(
                    testValue.referenceRangeLow,
                    testValue.referenceRangeHigh,
                    testValue.unit
                  )}
                </Text>
              </Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}
