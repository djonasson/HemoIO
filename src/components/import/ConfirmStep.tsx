/**
 * Confirm Step Component
 *
 * Final confirmation before saving imported lab results.
 */

import {
  Stack,
  Group,
  Button,
  Text,
  Paper,
  Table,
  Badge,
  Divider,
  SimpleGrid,
  ThemeIcon,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconCheck,
  IconCalendar,
  IconBuilding,
  IconTestPipe,
  IconFiles,
} from '@tabler/icons-react';
import type { ReviewedResult } from './ReviewStep';

/**
 * Format a biomarker value for display, handling interval values
 */
function formatBiomarkerValue(biomarker: ReviewedResult['editedBiomarkers'][0]): string {
  // Check if this is an interval value
  if (biomarker.isInterval && biomarker.intervalLow !== undefined && biomarker.intervalHigh !== undefined) {
    return `${biomarker.intervalLow}-${biomarker.intervalHigh}`;
  }
  // Regular value
  return String(biomarker.value);
}

/**
 * Props for ConfirmStep
 */
export interface ConfirmStepProps {
  /** Reviewed results to confirm */
  results: ReviewedResult[];
  /** Callback when confirmed */
  onConfirm: () => void;
  /** Callback to go back */
  onBack: () => void;
}

/**
 * Confirm Step - final confirmation before saving
 */
export function ConfirmStep({ results, onConfirm, onBack }: ConfirmStepProps) {
  // Calculate totals
  const totalFiles = results.length;
  const totalBiomarkers = results.reduce(
    (sum, r) => sum + r.editedBiomarkers.length,
    0
  );

  // Get unique lab dates
  const labDates = [
    ...new Set(
      results
        .map((r) => r.editedLabDate || r.labDate)
        .filter(Boolean) as string[]
    ),
  ];

  // Get unique lab names
  const labNames = [
    ...new Set(
      results
        .map((r) => r.editedLabName || r.labName)
        .filter(Boolean) as string[]
    ),
  ];

  return (
    <Stack gap="lg">
      {/* Summary cards */}
      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
        <Paper p="md" withBorder>
          <Group>
            <ThemeIcon size="lg" variant="light" color="blue">
              <IconFiles size={20} />
            </ThemeIcon>
            <div>
              <Text size="xs" c="dimmed" tt="uppercase">
                Files
              </Text>
              <Text fw={700} size="xl">
                {totalFiles}
              </Text>
            </div>
          </Group>
        </Paper>

        <Paper p="md" withBorder>
          <Group>
            <ThemeIcon size="lg" variant="light" color="green">
              <IconTestPipe size={20} />
            </ThemeIcon>
            <div>
              <Text size="xs" c="dimmed" tt="uppercase">
                Biomarkers
              </Text>
              <Text fw={700} size="xl">
                {totalBiomarkers}
              </Text>
            </div>
          </Group>
        </Paper>

        <Paper p="md" withBorder>
          <Group>
            <ThemeIcon size="lg" variant="light" color="violet">
              <IconCalendar size={20} />
            </ThemeIcon>
            <div>
              <Text size="xs" c="dimmed" tt="uppercase">
                Lab Date(s)
              </Text>
              <Text fw={500} size="sm" lineClamp={1}>
                {labDates.length > 0 ? labDates.join(', ') : 'Not specified'}
              </Text>
            </div>
          </Group>
        </Paper>

        <Paper p="md" withBorder>
          <Group>
            <ThemeIcon size="lg" variant="light" color="orange">
              <IconBuilding size={20} />
            </ThemeIcon>
            <div>
              <Text size="xs" c="dimmed" tt="uppercase">
                Lab(s)
              </Text>
              <Text fw={500} size="sm" lineClamp={1}>
                {labNames.length > 0 ? labNames.join(', ') : 'Not specified'}
              </Text>
            </div>
          </Group>
        </Paper>
      </SimpleGrid>

      {/* Detailed summary */}
      <Paper p="md" withBorder>
        <Text fw={500} mb="md">
          Values to Import
        </Text>

        {results.map((result, resultIndex) => (
          <div key={result.fileId}>
            {resultIndex > 0 && <Divider my="md" />}

            <Group justify="space-between" mb="sm">
              <div>
                <Text fw={500} size="sm">
                  {result.fileName}
                </Text>
                <Group gap="xs">
                  {(result.editedLabDate || result.labDate) && (
                    <Badge size="xs" variant="light">
                      {result.editedLabDate || result.labDate}
                    </Badge>
                  )}
                  {(result.editedLabName || result.labName) && (
                    <Badge size="xs" variant="light" color="gray">
                      {result.editedLabName || result.labName}
                    </Badge>
                  )}
                </Group>
              </div>
              <Badge>{result.editedBiomarkers.length} values</Badge>
            </Group>

            <Table withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Biomarker</Table.Th>
                  <Table.Th>Value</Table.Th>
                  <Table.Th>Reference Range</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {result.editedBiomarkers.map((biomarker, bioIndex) => (
                  <Table.Tr key={bioIndex}>
                    <Table.Td>
                      <Text size="sm">{biomarker.name}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {formatBiomarkerValue(biomarker)} {biomarker.unit}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {biomarker.referenceRange ? (
                        <Text size="sm" c="dimmed">
                          {biomarker.referenceRange.low ?? '?'} -{' '}
                          {biomarker.referenceRange.high ?? '?'}{' '}
                          {biomarker.referenceRange.unit}
                        </Text>
                      ) : (
                        <Text size="sm" c="dimmed">
                          —
                        </Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>
        ))}
      </Paper>

      {/* Confirmation message */}
      <Paper p="md" bg="var(--mantine-color-blue-light)" withBorder>
        <Group>
          <ThemeIcon size="lg" color="blue" variant="filled">
            <IconCheck size={20} />
          </ThemeIcon>
          <div>
            <Text fw={500}>Ready to Save</Text>
            <Text size="sm" c="dimmed">
              Click "Save Results" to add these values to your health timeline.
            </Text>
          </div>
        </Group>
      </Paper>

      {/* Action buttons */}
      <Group justify="space-between" mt="xl">
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={onBack}
        >
          Back to Review
        </Button>
        <Button
          color="green"
          leftSection={<IconCheck size={16} />}
          onClick={onConfirm}
        >
          Save Results
        </Button>
      </Group>
    </Stack>
  );
}
