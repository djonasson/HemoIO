/**
 * Test Values List Component
 *
 * Displays a table of test values with status indicators.
 */

import { useId } from 'react';
import { Box, Table, Text, Group, Tooltip, ThemeIcon } from '@mantine/core';
import {
  IconArrowUp,
  IconArrowDown,
  IconCheck,
  IconMinus,
  IconTestPipe,
} from '@tabler/icons-react';
import type { SpecimenType } from '@/types';
import type { EnrichedTestValue, TestValueStatus } from '@hooks/useLabResults';
import {
  getBiomarkerDisplayName,
  getBiomarkerForTestValue,
  type BiomarkerDefinition,
} from '@data/biomarkers/dictionary';
import { usePreferences } from '@hooks/usePreferences';
import { convertForDisplay, preferredUnitFor } from '@services/units';
import { statusColor } from '@/utils/statusColor';
import { isTrendable } from '@/utils/isTrendable';
import { loincLabel } from '@data/biomarkers/loinc';
import { useOverflowsX } from '@hooks/useOverflowsX';
import { BiomarkerName } from './BiomarkerName';

export interface TestValuesListProps {
  /** Test values to display */
  testValues: EnrichedTestValue[];
  /** Open a test's trend; numeric values' names become links when given */
  onOpenTrend?: (biomarkerKey: string) => void;
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

  return getBiomarkerDisplayName(testValue);
}

/**
 * Human-readable labels for specimen types
 */
const SPECIMEN_LABELS: Record<SpecimenType, string> = {
  'serum': 'Serum',
  'plasma': 'Plasma',
  'urine': 'Urine',
  'urine-24h': '24h Urine',
  'whole-blood': 'Whole Blood',
  'capillary': 'Capillary',
  'saliva': 'Saliva',
  'csf': 'CSF',
  'stool': 'Stool',
  'semen': 'Semen',
  'other': 'Other',
};

/**
 * Get human-readable specimen label
 */
function getSpecimenLabel(specimenType: SpecimenType | undefined): string {
  if (!specimenType) return '—';
  return SPECIMEN_LABELS[specimenType] || specimenType;
}

/**
 * Specimen type patterns that can be extracted from biomarker names
 */
const SPECIMEN_PATTERNS: { pattern: RegExp; type: SpecimenType }[] = [
  { pattern: /\s*\(urine,?\s*24h?\)\s*$/i, type: 'urine-24h' },
  { pattern: /\s*\(24h?\s*urine\)\s*$/i, type: 'urine-24h' },
  { pattern: /\s*\(urine[^)]*\)\s*$/i, type: 'urine' },
  { pattern: /\s*\(plasma[^)]*\)\s*$/i, type: 'plasma' },
  { pattern: /\s*\(serum[^)]*\)\s*$/i, type: 'serum' },
  { pattern: /\s*\(siero[^)]*\)\s*$/i, type: 'serum' }, // Italian for serum
  { pattern: /\s*\(sangue[^)]*\)\s*$/i, type: 'whole-blood' }, // Italian for blood
  { pattern: /\s*\(whole[- ]?blood[^)]*\)\s*$/i, type: 'whole-blood' },
  { pattern: /\s*\(semen[^)]*\)\s*$/i, type: 'semen' },
  { pattern: /\s*\(liquido seminale[^)]*\)\s*$/i, type: 'semen' }, // Italian
  { pattern: /\s*\(csf[^)]*\)\s*$/i, type: 'csf' },
  { pattern: /\s*\(liquor[^)]*\)\s*$/i, type: 'csf' }, // Alternative name
  { pattern: /\s*\(saliva[^)]*\)\s*$/i, type: 'saliva' },
  { pattern: /\s*\(stool[^)]*\)\s*$/i, type: 'stool' },
  { pattern: /\s*\(feci[^)]*\)\s*$/i, type: 'stool' }, // Italian for stool
];

/**
 * Extract specimen type from biomarker name and return clean name
 */
function extractSpecimenFromName(name: string): { cleanName: string; extractedSpecimen?: SpecimenType } {
  for (const { pattern, type } of SPECIMEN_PATTERNS) {
    if (pattern.test(name)) {
      return {
        cleanName: name.replace(pattern, '').trim(),
        extractedSpecimen: type,
      };
    }
  }
  return { cleanName: name };
}

/**
 * Get biomarker metadata (specimen type and LOINC code) from dictionary
 */
function getBiomarkerMetadata(
  testValue: EnrichedTestValue,
  found: BiomarkerDefinition | undefined
): {
  specimenType?: SpecimenType;
  loincCode?: string;
  description?: string;
  cleanName: string;
} {
  if (found) {
    return {
      specimenType: found.specimenType,
      loincCode: found.loincCode,
      description: found.description,
      cleanName: found.name,
    };
  }

  // If not found in dictionary, still return extracted specimen from name
  const searchTerm = testValue.biomarkerName || testValue.rawText;
  const { cleanName, extractedSpecimen } = extractSpecimenFromName(searchTerm || '');
  return {
    specimenType: extractedSpecimen,
    cleanName,
  };
}

/**
 * Format a numeric value for display
 */
function formatNumericValue(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

/**
 * Format the value for display, including interval values
 */
function formatValue(testValue: EnrichedTestValue): string {
  const { value, numericValueType, intervalLow, intervalHigh } = testValue;

  // Handle interval values
  if (numericValueType === 'interval' && intervalLow !== undefined && intervalHigh !== undefined) {
    return `${formatNumericValue(intervalLow)}-${formatNumericValue(intervalHigh)}`;
  }

  if (typeof value === 'boolean') {
    return value ? 'Positive' : 'Negative';
  }
  if (typeof value === 'number') {
    return formatNumericValue(value);
  }
  return String(value);
}

/**
 * Table of test values with status indicators
 */
export function TestValuesList({
  testValues,
  onOpenTrend,
}: TestValuesListProps): React.ReactNode {
  const { unitPreferences } = usePreferences();
  const idPrefix = useId();
  const descriptions: Array<{ id: string; text: string }> = [];
  const [scrollBox, overflows] = useOverflowsX<HTMLDivElement>();

  if (testValues.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="md">
        No test values recorded for this result.
      </Text>
    );
  }

  // On a narrow screen the table scrolls on its own instead of widening the
  // page; while it does, the box takes focus so the keyboard can scroll it
  const table = (
    <Box
      ref={scrollBox}
      role={overflows ? 'region' : undefined}
      aria-label={overflows ? 'Test values, scrollable' : undefined}
      tabIndex={overflows ? 0 : undefined}
      data-scroll-box
      style={{ overflowX: 'auto' }}
    >
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
            // Shown in the preferred unit when one is set and the value converts
            const definition = getBiomarkerForTestValue(recorded);
            const testValue = convertForDisplay(
              definition?.name ?? '',
              recorded,
              preferredUnitFor(definition, unitPreferences[recorded.biomarkerKey])
            );
            const indicator = getStatusIndicator(testValue.status);
            const biomarkerName = getBiomarkerName(testValue);
            // By the stored key only: a value saved as not in the dictionary is
            // not the test its name is
            const metadata = getBiomarkerMetadata(testValue, definition);

            // Build tooltip content for LOINC code and description
            const tooltipParts: string[] = [];
            if (metadata.loincCode) {
              tooltipParts.push(loincLabel(metadata.loincCode));
            }
            if (metadata.description) {
              tooltipParts.push(metadata.description);
            }
            const tooltipContent = tooltipParts.length > 0 ? tooltipParts.join('\n') : null;
            const descriptionId = `${idPrefix}-description-${testValue.id}`;
            if (tooltipContent) descriptions.push({ id: descriptionId, text: tooltipContent });

            return (
              <Table.Tr
                key={testValue.id}
                data-status={testValue.status}
                aria-label={`${biomarkerName}: ${formatValue(testValue)} ${testValue.unit}, ${indicator.label}`}
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
                    name={metadata.cleanName || biomarkerName}
                    description={tooltipContent}
                    descriptionId={descriptionId}
                    onOpen={
                      onOpenTrend && isTrendable(recorded)
                        ? () => onOpenTrend(recorded.biomarkerKey)
                        : undefined
                    }
                  />
                </Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    <IconTestPipe size={14} style={{ color: 'var(--mantine-color-dimmed)' }} />
                    <Text size="sm" c="dimmed">
                      {getSpecimenLabel(metadata.specimenType)}
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
    </Box>
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
