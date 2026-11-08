/**
 * Test Values List Component
 *
 * Displays a table of test values with status indicators.
 */

import { useId } from 'react';
import { Table, Text, Group, Tooltip, ThemeIcon } from '@mantine/core';
import {
  IconArrowUp,
  IconArrowDown,
  IconCheck,
  IconMinus,
  IconTestPipe,
} from '@tabler/icons-react';
import type { EnrichedTestValue } from '@hooks/useLabResults';
import {
  loincTestLabel,
  sampleLabel,
  testDescription,
  testDisplayName,
  testKey,
  testUnits,
  trendCode,
} from '@data/loinc/display';
import { splitPrintedSample } from '@components/common/printedSample';
import { useCatalog } from '@contexts/useCatalog';
import { usePreferences } from '@hooks/usePreferences';
import { convertForDisplay, preferredUnitFor } from '@services/units';
import { statusColor } from '@/utils/statusColor';
import { isTrendable } from '@/utils/isTrendable';
import { formatTestValue, LAB_FLAG_TEXT } from '@/utils/formatTestValue';
import { ScrollBox } from '@components/common/ScrollBox';
import { LabFlagMark } from '@components/common/LabFlagMark';
import { formatReferenceRange } from '@services/alerts/alertRules';
import { BiomarkerName } from './BiomarkerName';

export interface TestValuesListProps {
  /** Test values to display */
  testValues: EnrichedTestValue[];
  /** Open a test's trend on a value; numeric values' names become links when given */
  onOpenTrend?: (biomarkerKey: string, testValueId?: number) => void;
}

/**
 * Get icon, color and words for a test value's status and what gave it:
 * its range, or the lab's mark when the range cannot tell (see readValueStatus)
 */
function getStatusIndicator(testValue: EnrichedTestValue): {
  icon: React.ReactNode;
  color: string;
  label: string;
} {
  const { status, statusBasis } = testValue;
  if (statusBasis === 'lab') {
    return {
      icon: status === 'high' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />,
      color: statusColor(status),
      label: status === 'high' ? 'Flagged high by the lab' : 'Flagged low by the lab',
    };
  }
  switch (status) {
    case 'high':
      return {
        icon: <IconArrowUp size={14} />,
        color: statusColor(status),
        label: 'Above reference range',
      };
    case 'low':
      return {
        icon: <IconArrowDown size={14} />,
        color: statusColor(status),
        label: 'Below reference range',
      };
    case 'normal':
      return {
        icon: <IconCheck size={14} />,
        color: statusColor(status),
        label: 'Within reference range',
      };
    default:
      return {
        icon: <IconMinus size={14} />,
        color: statusColor(status),
        label:
          statusBasis === 'uncomparable' ? 'Cannot be compared with the reference range' : 'No reference range available',
      };
  }
}

/**
 * Format a numeric value for display: with every decimal the report printed
 * (a specific gravity of 1.015, a TSH of 0.005), only floating-point noise
 * left out. A converted value is already rounded to its unit's precision.
 */
function formatNumericValue(value: number): string {
  return String(Number(value.toPrecision(12)));
}

/**
 * Format the value for display, including interval and qualitative values
 */
function formatValue(testValue: EnrichedTestValue): string {
  return formatTestValue(testValue, formatNumericValue);
}

/**
 * Table of test values with status indicators
 */
export function TestValuesList({
  testValues,
  onOpenTrend,
}: TestValuesListProps): React.ReactNode {
  const catalog = useCatalog();
  const { unitPreferences } = usePreferences();
  const idPrefix = useId();
  const descriptions: Array<{ id: string; text: string }> = [];

  if (testValues.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="md">
        No test values recorded for this result.
      </Text>
    );
  }

  const table = (
    <ScrollBox label="Test values">
      <Table striped highlightOnHover withTableBorder aria-label="Test values">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Status</Table.Th>
            <Table.Th>Biomarker</Table.Th>
            <Table.Th>Specimen</Table.Th>
            <Table.Th>Value</Table.Th>
            <Table.Th>Unit</Table.Th>
            <Table.Th>Reference Range</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {testValues.map((recorded) => {
            // By the stored key only: a value saved as not a LOINC test is
            // not the test its name is
            const test = catalog.test(recorded.biomarkerKey);
            const code = trendCode(catalog, recorded.biomarkerKey);
            // Shown in the preferred unit when one is set and the value converts
            const testValue = convertForDisplay(
              test ?? '',
              recorded,
              preferredUnitFor(
                testUnits(catalog, code),
                unitPreferences[testKey(catalog, recorded.biomarkerKey)]
              )
            );
            const indicator = getStatusIndicator(testValue);
            const flag = testValue.labFlag ? LAB_FLAG_TEXT[testValue.labFlag] : undefined;
            const printed = test ? undefined : splitPrintedSample(testDisplayName(catalog, recorded));
            const biomarkerName = printed?.name || testDisplayName(catalog, recorded);
            const sample = test ? sampleLabel(test) : printed?.sample;

            // The code with LOINC's name for it, and HemoIO's description
            const description = test ? testDescription(catalog, test.code) : undefined;
            const tooltipContent = test
              ? [loincTestLabel(test), description].filter(Boolean).join('\n')
              : null;
            const descriptionId = `${idPrefix}-description-${testValue.id}`;
            if (tooltipContent) descriptions.push({ id: descriptionId, text: tooltipContent });

            return (
              <Table.Tr
                key={testValue.id}
                data-status={testValue.status}
                aria-label={`${biomarkerName}: ${formatValue(testValue)} ${testValue.unit}${testValue.method ? ` by ${testValue.method}` : ''}${flag && testValue.statusBasis !== 'lab' ? `, ${flag.label}` : ''}, ${indicator.label}`}
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
                  <BiomarkerName
                    name={biomarkerName}
                    description={tooltipContent}
                    descriptionId={descriptionId}
                    onOpen={
                      onOpenTrend && isTrendable(recorded)
                        ? () => onOpenTrend(recorded.biomarkerKey, recorded.id)
                        : undefined
                    }
                  />
                </Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    <IconTestPipe size={14} style={{ color: 'var(--mantine-color-dimmed)' }} />
                    <Text size="sm" c="dimmed">
                      {sample ?? '—'}
                    </Text>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    <Text
                      size="sm"
                      fw={testValue.status !== 'normal' && testValue.status !== 'unknown' ? 600 : 400}
                      c={testValue.status === 'high' ? 'red' : testValue.status === 'low' ? 'orange' : undefined}
                    >
                      {formatValue(testValue)}
                    </Text>
                    {testValue.labFlag && <LabFlagMark flag={testValue.labFlag} />}
                  </Group>
                  {testValue.method && (
                    <Text size="xs" c="dimmed">
                      {testValue.method}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {testValue.unit}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {(testValue.unconvertedRange
                      ? formatReferenceRange(testValue.unconvertedRange, testValue.unconvertedRange.unit)
                      : formatReferenceRange(
                          { low: testValue.referenceRangeLow, high: testValue.referenceRangeHigh },
                          testValue.unit
                        )) ?? '—'}
                  </Text>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </ScrollBox>
  );

  return (
    <>
      {table}
      {/* Hidden, yet still read through aria-describedby */}
      <div hidden>
        {descriptions.map(({ id, text }) => (
          <span key={id} id={id}>
            {text}
          </span>
        ))}
      </div>
    </>
  );
}
