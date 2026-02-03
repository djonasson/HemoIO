/**
 * BiomarkerDetail Component
 *
 * Displays detailed information about a selected biomarker.
 */

import {
  Stack,
  Paper,
  Title,
  Text,
  Group,
  Badge,
  Divider,
  Box,
  Alert,
  CloseButton,
  Anchor,
} from '@mantine/core';
import {
  IconArrowUp,
  IconArrowDown,
  IconInfoCircle,
  IconFlask,
  IconTestPipe,
  IconExternalLink,
} from '@tabler/icons-react';
import type { SpecimenType } from '@/types';

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
function getSpecimenLabel(specimenType: SpecimenType): string {
  return SPECIMEN_LABELS[specimenType] || specimenType;
}
import { CATEGORY_NAMES, type BiomarkerDefinition } from '@data/biomarkers';

/**
 * Props for BiomarkerDetail component
 */
export interface BiomarkerDetailProps {
  /** The biomarker to display */
  biomarker: BiomarkerDefinition;
  /** Called when close button is clicked */
  onClose?: () => void;
}

/**
 * BiomarkerDetail component for displaying biomarker reference information
 */
export function BiomarkerDetail({
  biomarker,
  onClose,
}: BiomarkerDetailProps): React.ReactNode {
  return (
    <Paper p="md" withBorder>
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Box style={{ flex: 1 }}>
            <Title order={3}>{biomarker.name}</Title>
            {biomarker.aliases.length > 0 && (
              <Text size="sm" c="dimmed">
                Also known as: {biomarker.aliases.join(', ')}
              </Text>
            )}
          </Box>
          {onClose && (
            <CloseButton onClick={onClose} aria-label="Close biomarker detail" />
          )}
        </Group>

        {/* Category Badge */}
        <Group gap="xs">
          <Badge variant="light" color="blue">
            {CATEGORY_NAMES[biomarker.category]}
          </Badge>
        </Group>

        {/* Specimen Type */}
        {biomarker.specimenType && (
          <Group gap="xs">
            <IconTestPipe size={16} style={{ color: 'var(--mantine-color-dimmed)' }} />
            <Text size="sm" c="dimmed">
              Specimen: {getSpecimenLabel(biomarker.specimenType)}
            </Text>
          </Group>
        )}

        {/* LOINC Code */}
        {biomarker.loincCode && (
          <Group gap="xs">
            <Text size="sm" c="dimmed">
              LOINC:{' '}
              <Anchor
                href={`https://loinc.org/${biomarker.loincCode}`}
                target="_blank"
                rel="noopener noreferrer"
                size="sm"
              >
                {biomarker.loincCode}
                <IconExternalLink size={12} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
              </Anchor>
            </Text>
          </Group>
        )}

        <Divider />

        {/* Description */}
        <Box>
          <Text size="sm" fw={500} mb="xs">
            Description
          </Text>
          <Text size="sm">{biomarker.description}</Text>
        </Box>

        {/* Reference Range */}
        {biomarker.defaultReferenceRange && (
          <Box>
            <Text size="sm" fw={500} mb="xs">
              Reference Range
            </Text>
            <Paper p="sm" withBorder bg="var(--mantine-color-gray-light)">
              <Group gap="xs" align="center">
                <IconFlask size={16} />
                <Text size="sm" fw={500}>
                  {biomarker.defaultReferenceRange.low} - {biomarker.defaultReferenceRange.high}{' '}
                  {biomarker.defaultReferenceRange.unit}
                </Text>
              </Group>
              <Text size="xs" c="dimmed" mt="xs">
                Standard reference range for adults. Your lab may use different ranges.
              </Text>
            </Paper>
          </Box>
        )}

        {/* Units */}
        <Box>
          <Text size="sm" fw={500} mb="xs">
            Units
          </Text>
          <Group gap="xs">
            <Badge variant="outline" color="gray">
              {biomarker.canonicalUnit}
            </Badge>
            {biomarker.alternativeUnits.map((unit) => (
              <Badge key={unit} variant="light" color="gray">
                {unit}
              </Badge>
            ))}
          </Group>
        </Box>

        {/* Indications */}
        {(biomarker.highIndication || biomarker.lowIndication) && (
          <>
            <Divider />
            <Box>
              <Text size="sm" fw={500} mb="xs">
                What Abnormal Values May Indicate
              </Text>
              <Stack gap="sm">
                {biomarker.highIndication && (
                  <Alert
                    variant="light"
                    color="red"
                    icon={<IconArrowUp size={16} />}
                    title="High Values"
                  >
                    <Text size="sm">{biomarker.highIndication}</Text>
                  </Alert>
                )}
                {biomarker.lowIndication && (
                  <Alert
                    variant="light"
                    color="blue"
                    icon={<IconArrowDown size={16} />}
                    title="Low Values"
                  >
                    <Text size="sm">{biomarker.lowIndication}</Text>
                  </Alert>
                )}
              </Stack>
            </Box>
          </>
        )}

        {/* Disclaimer */}
        <Alert
          variant="light"
          color="gray"
          icon={<IconInfoCircle size={16} />}
        >
          <Text size="xs">
            This information is for educational purposes only. Always consult
            with your healthcare provider for interpretation of your lab results.
          </Text>
        </Alert>
      </Stack>
    </Paper>
  );
}
