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
  IconTestPipe,
} from '@tabler/icons-react';
import type { SpecimenType } from '@/types';
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
function getBiomarkerMetadata(testValue: EnrichedTestValue): {
  specimenType?: SpecimenType;
  loincCode?: string;
  description?: string;
  cleanName: string;
} {
  // Try to find in dictionary by raw text or biomarker name
  const searchTerm = testValue.biomarkerName || testValue.rawText;
  const { cleanName, extractedSpecimen } = extractSpecimenFromName(searchTerm || '');

  if (searchTerm) {
    const found = findBiomarker(searchTerm);
    if (found) {
      return {
        specimenType: found.specimenType,
        loincCode: found.loincCode,
        description: found.description,
        cleanName,
      };
    }
  }

  // If not found in dictionary, still return extracted specimen from name
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
          <Table.Th>Specimen</Table.Th>
          <Table.Th>Value</Table.Th>
          <Table.Th>Unit</Table.Th>
          <Table.Th>Reference Range</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {testValues.map((testValue) => {
          const indicator = getStatusIndicator(testValue.status);
          const biomarkerName = getBiomarkerName(testValue);
          const metadata = getBiomarkerMetadata(testValue);

          // Build tooltip content for LOINC code and description
          const tooltipParts: string[] = [];
          if (metadata.loincCode) {
            tooltipParts.push(`LOINC: ${metadata.loincCode}`);
          }
          if (metadata.description) {
            tooltipParts.push(metadata.description);
          }
          const tooltipContent = tooltipParts.length > 0 ? tooltipParts.join('\n') : null;

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
                {tooltipContent ? (
                  <Tooltip label={tooltipContent} multiline w={300} withArrow>
                    <Text size="sm" fw={500} style={{ cursor: 'help', textDecoration: 'underline dotted' }}>
                      {metadata.cleanName || biomarkerName}
                    </Text>
                  </Tooltip>
                ) : (
                  <Text size="sm" fw={500}>
                    {metadata.cleanName || biomarkerName}
                  </Text>
                )}
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
  );
}
