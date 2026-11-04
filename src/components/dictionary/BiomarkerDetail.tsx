/**
 * BiomarkerDetail Component
 *
 * Displays detailed information about a selected biomarker: reference
 * information, your results, your personal target and related biomarkers.
 */

import { useEffect, useRef } from 'react';
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
  Anchor,
  Button,
} from '@mantine/core';
import {
  IconArrowUp,
  IconArrowDown,
  IconInfoCircle,
  IconFlask,
  IconTestPipe,
  IconExternalLink,
  IconArrowLeft,
  IconChartLine,
  IconTarget,
} from '@tabler/icons-react';
import { CATEGORY_NAMES, getBiomarkerByKey, type BiomarkerDefinition } from '@data/biomarkers';
import { loincName } from '@data/biomarkers/loinc';
import { formatRange } from '@/utils/formatRange';
import { statusColor } from '@/utils/statusColor';
import { formatShortDate } from '@/utils/formatShortDate';
import { hasTargetRange } from '@components/settings/personalTarget';
import type { SpecimenType } from '@/types';
import type { BiomarkerResultSummary } from '@services/statistics';
import type { PersonalTargetRange } from '@hooks/usePreferences';

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

/** Status words, so status never relies on colour alone */
const STATUS_LABELS: Record<BiomarkerResultSummary['latest']['status'], string> = {
  high: 'High',
  low: 'Low',
  normal: 'Normal',
  unknown: 'No reference range',
};

function formatSummaryValue(value: number | string | boolean): string {
  if (typeof value === 'boolean') return value ? 'Positive' : 'Negative';
  return String(value);
}

/** The name as the list shows it, with its best-known alias */
function listLabel(biomarker: BiomarkerDefinition): string {
  return biomarker.aliases.length > 0
    ? `${biomarker.name} (${biomarker.aliases[0]})`
    : biomarker.name;
}

/**
 * Props for BiomarkerDetail component
 */
export interface BiomarkerDetailProps {
  /** The biomarker to display */
  biomarker: BiomarkerDefinition;
  /** null: no recorded values */
  summary: BiomarkerResultSummary | null;
  /** The user's target, in the biomarker's standard unit */
  personalTarget?: PersonalTargetRange;
  /** Return to the biomarker list */
  onBack: () => void;
  onViewTrend: (biomarkerKey: string) => void;
  onEditTarget: () => void;
  onSelectRelated: (biomarker: BiomarkerDefinition) => void;
}

/**
 * BiomarkerDetail component for displaying biomarker reference information
 */
export function BiomarkerDetail({
  biomarker,
  summary,
  personalTarget,
  onBack,
  onViewTrend,
  onEditTarget,
  onSelectRelated,
}: BiomarkerDetailProps): React.ReactNode {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Opening a detail (or a related one) moves focus to its name, so screen
  // readers announce the new page
  useEffect(() => {
    headingRef.current?.focus();
  }, [biomarker.key]);

  const hasTarget = hasTargetRange(personalTarget);
  const related = biomarker.related
    .map((key) => getBiomarkerByKey(key))
    .filter((entry): entry is BiomarkerDefinition => entry !== undefined);

  return (
    <Paper p="md" withBorder>
      <Stack gap="md">
        {/* Header */}
        <Group>
          <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={onBack}>
            Back to biomarker list
          </Button>
        </Group>
        <Box>
          <Title order={3} ref={headingRef} tabIndex={-1}>
            {biomarker.name}
          </Title>
          {biomarker.aliases.length > 0 && (
            <Text size="sm" c="dimmed">
              Also known as: {biomarker.aliases.join(', ')}
            </Text>
          )}
        </Box>

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

        {/* LOINC Code, with LOINC's name for it as its license asks */}
        {biomarker.loincCode && (
          <Stack gap={2}>
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
            {loincName(biomarker.loincCode) && (
              <Text size="sm" c="dimmed">
                {loincName(biomarker.loincCode)}
              </Text>
            )}
          </Stack>
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

        <Box component="section" aria-labelledby={`${biomarker.key}-results`}>
          <Title order={4} size="sm" id={`${biomarker.key}-results`} mb="xs">
            Your results
          </Title>
          {summary ? (
            <Stack gap="xs">
              <Group gap="xs">
                <Text size="sm" fw={500}>
                  {`${formatSummaryValue(summary.latest.value)} ${summary.latest.unit}`.trim()}
                </Text>
                <Text size="sm" c="dimmed">
                  {formatShortDate(summary.latest.date)}
                </Text>
                <Badge variant="light" color={statusColor(summary.latest.status)}>
                  {STATUS_LABELS[summary.latest.status]}
                </Badge>
              </Group>
              <Text size="sm" c="dimmed">
                {summary.count} {summary.count === 1 ? 'result' : 'results'}
              </Text>
              <Group>
                <Button
                  variant="light"
                  size="xs"
                  leftSection={<IconChartLine size={14} />}
                  onClick={() => onViewTrend(biomarker.key)}
                >
                  View trend
                </Button>
              </Group>
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">
              You have no recorded values for {biomarker.name}
            </Text>
          )}
        </Box>

        <Box component="section" aria-labelledby={`${biomarker.key}-target`}>
          <Title order={4} size="sm" id={`${biomarker.key}-target`} mb="xs">
            Personal target
          </Title>
          <Group justify="space-between" align="center">
            {hasTarget ? (
              <Paper p="xs" withBorder bg="var(--mantine-color-blue-light)">
                <Group gap="xs">
                  <IconTarget size={16} aria-hidden />
                  <Badge color="blue">Your target</Badge>
                  <Text size="sm" fw={500}>
                    {formatRange(personalTarget.low, personalTarget.high)} {biomarker.canonicalUnit}
                  </Text>
                </Group>
              </Paper>
            ) : (
              <Text size="sm" c="dimmed">
                Using standard range
              </Text>
            )}
            <Button variant="subtle" size="xs" onClick={onEditTarget}>
              Edit personal target
            </Button>
          </Group>
        </Box>

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

        {related.length > 0 && (
          <Box component="section" aria-labelledby={`${biomarker.key}-related`}>
            <Title order={4} size="sm" id={`${biomarker.key}-related`} mb="xs">
              Related biomarkers
            </Title>
            <Group gap="xs">
              {related.map((entry) => (
                <Button
                  key={entry.key}
                  variant="light"
                  size="xs"
                  onClick={() => onSelectRelated(entry)}
                >
                  {listLabel(entry)}
                </Button>
              ))}
            </Group>
          </Box>
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
