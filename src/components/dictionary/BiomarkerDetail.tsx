/**
 * BiomarkerDetail Component
 *
 * Displays detailed information about a test: its LOINC code and names,
 * HemoIO's reference information when it has some, your results, your
 * personal target and the other LOINC codes the test's values may have.
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
import { useCatalog } from '@contexts/useCatalog';
import {
  sampleLabel,
  standardRange,
  targetUnit,
  testAddon,
  testName,
  testUnits,
  unitOptions,
} from '@data/loinc/display';
import { formatRange } from '@/utils/formatRange';
import { statusColor } from '@/utils/statusColor';
import { formatShortDate } from '@/utils/formatShortDate';
import { formatTestValue } from '@/utils/formatTestValue';
import { hasTargetRange } from '@components/settings/personalTarget';
import { LabFlagMark } from '@components/common/LabFlagMark';
import type { BiomarkerResultSummary } from '@services/statistics';
import type { PersonalTargetRange } from '@hooks/usePreferences';

/** Status words, so status never relies on colour alone */
const STATUS_LABELS: Record<BiomarkerResultSummary['latest']['status'], string> = {
  high: 'High',
  low: 'Low',
  normal: 'Normal',
  unknown: 'No reference range',
};

/** A latest value's status in the timeline's words: by the lab's mark, or a range it cannot be compared with */
function statusLabel({ status, statusBasis }: BiomarkerResultSummary['latest']): string {
  if (statusBasis === 'lab' && (status === 'high' || status === 'low')) return `Flagged ${status} by the lab`;
  if (statusBasis === 'uncomparable') return 'Cannot be compared with the reference range';
  return STATUS_LABELS[status];
}

/**
 * Props for BiomarkerDetail component
 */
export interface BiomarkerDetailProps {
  /** The test's trend code */
  code: string;
  /** null: no recorded values */
  summary: BiomarkerResultSummary | null;
  /** The user's target, in the test's standard unit */
  personalTarget?: PersonalTargetRange;
  /** Return to the biomarker list */
  onBack: () => void;
  onViewTrend: (biomarkerKey: string) => void;
  onEditTarget: () => void;
}

/**
 * BiomarkerDetail component for displaying biomarker reference information
 */
export function BiomarkerDetail({
  code,
  summary,
  personalTarget,
  onBack,
  onViewTrend,
  onEditTarget,
}: BiomarkerDetailProps): React.ReactNode {
  const catalog = useCatalog();
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Opening a detail moves focus to its name, so screen readers announce the new page
  useEffect(() => {
    headingRef.current?.focus();
  }, [code]);

  const test = catalog.test(code);
  if (!test) return null;
  const name = testName(catalog, code);
  const addon = testAddon(catalog, code);
  const range = standardRange(catalog, code);
  const shownUnits = unitOptions(catalog, code);
  // Only HemoIO's own units have a standard one, outlined first
  const hasStandardUnit = testUnits(catalog, code) !== undefined;
  const targetIn = targetUnit(catalog, code);
  const hasTarget = hasTargetRange(personalTarget);
  // The codes the test's values may also be saved under: glucose in mmol/L for glucose in mg/dL
  const otherCodes = catalog
    .groupCodes(catalog.trendGroup(code))
    .filter((member) => member !== code)
    .map((member) => catalog.test(member))
    .filter((member) => member !== undefined);

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
            {name}
          </Title>
        </Box>

        {/* LOINC class */}
        <Group gap="xs">
          <Badge variant="light" color="blue">
            {catalog.classLabel(test.classCode)}
          </Badge>
        </Group>

        <Group gap="xs">
          <IconTestPipe size={16} style={{ color: 'var(--mantine-color-dimmed)' }} />
          <Text size="sm" c="dimmed">
            Sample: {sampleLabel(test)}
          </Text>
        </Group>

        {/* LOINC Code, with LOINC's name for it as its license asks */}
        <Stack gap={2}>
          <Text size="sm" c="dimmed">
            LOINC:{' '}
            <Anchor
              href={`https://loinc.org/${test.code}`}
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
            >
              {test.code}
              <IconExternalLink size={12} style={{ marginLeft: 4, verticalAlign: 'middle' }} />
            </Anchor>
          </Text>
          <Text size="sm" c="dimmed">
            {test.name}
          </Text>
        </Stack>

        <Divider />

        {/* Description */}
        <Box>
          <Text size="sm" fw={500} mb="xs">
            Description
          </Text>
          <Text size="sm" c={addon?.description ? undefined : 'dimmed'}>
            {addon?.description ?? 'No description yet'}
          </Text>
        </Box>

        {/* Reference Range */}
        {range && (
          <Box>
            <Text size="sm" fw={500} mb="xs">
              Reference Range
            </Text>
            <Paper p="sm" withBorder bg="var(--mantine-color-gray-light)">
              <Group gap="xs" align="center">
                <IconFlask size={16} />
                <Text size="sm" fw={500}>
                  {formatRange(range.low, range.high)} {range.unit}
                </Text>
              </Group>
              <Text size="xs" c="dimmed" mt="xs">
                Standard reference range for adults. Your lab may use different ranges.
              </Text>
            </Paper>
          </Box>
        )}

        <Box component="section" aria-labelledby={`${code}-results`}>
          <Title order={4} size="sm" id={`${code}-results`} mb="xs">
            Your results
          </Title>
          {summary ? (
            <Stack gap="xs">
              <Group gap="xs">
                <Text size="sm" fw={500}>
                  {`${formatTestValue(summary.latest)} ${summary.latest.unit}`.trim()}
                </Text>
                {summary.latest.labFlag && <LabFlagMark flag={summary.latest.labFlag} />}
                <Text size="sm" c="dimmed">
                  {formatShortDate(summary.latest.date)}
                </Text>
                <Badge variant="light" color={statusColor(summary.latest.status)}>
                  {statusLabel(summary.latest)}
                </Badge>
              </Group>
              <Text size="sm" c="dimmed">
                {summary.count} {summary.count === 1 ? 'result' : 'results'}
              </Text>
              {/* Only numbers are charted: a test of words alone has no trend */}
              {summary.trendable && (
                <Group>
                  <Button
                    variant="light"
                    size="xs"
                    leftSection={<IconChartLine size={14} />}
                    onClick={() => onViewTrend(code)}
                  >
                    View trend
                  </Button>
                </Group>
              )}
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">
              You have no recorded values for {name}
            </Text>
          )}
        </Box>

        <Box component="section" aria-labelledby={`${code}-target`}>
          <Title order={4} size="sm" id={`${code}-target`} mb="xs">
            Personal target
          </Title>
          <Group justify="space-between" align="center">
            {hasTarget ? (
              <Paper p="xs" withBorder bg="var(--mantine-color-blue-light)">
                <Group gap="xs">
                  <IconTarget size={16} aria-hidden />
                  <Badge color="blue">Your target</Badge>
                  <Text size="sm" fw={500}>
                    {formatRange(personalTarget.low, personalTarget.high)} {targetIn}
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

        {/* Units: the standard one outlined */}
        {shownUnits.length > 0 && (
          <Box>
            <Text size="sm" fw={500} mb="xs">
              Units
            </Text>
            <Group gap="xs">
              {shownUnits.map((unit, index) => (
                <Badge key={unit} variant={hasStandardUnit && index === 0 ? 'outline' : 'light'} color="gray">
                  {unit}
                </Badge>
              ))}
            </Group>
          </Box>
        )}

        {/* Indications */}
        {(addon?.highIndication || addon?.lowIndication) && (
          <>
            <Divider />
            <Box>
              <Text size="sm" fw={500} mb="xs">
                What Abnormal Values May Indicate
              </Text>
              <Stack gap="sm">
                {addon?.highIndication && (
                  <Alert
                    variant="light"
                    color="red"
                    icon={<IconArrowUp size={16} />}
                    title="High Values"
                  >
                    <Text size="sm">{addon?.highIndication}</Text>
                  </Alert>
                )}
                {addon?.lowIndication && (
                  <Alert
                    variant="light"
                    color="blue"
                    icon={<IconArrowDown size={16} />}
                    title="Low Values"
                  >
                    <Text size="sm">{addon?.lowIndication}</Text>
                  </Alert>
                )}
              </Stack>
            </Box>
          </>
        )}

        {otherCodes.length > 0 && (
          <Box component="section" aria-labelledby={`${code}-codes`}>
            <Title order={4} size="sm" id={`${code}-codes`} mb="xs">
              Other LOINC codes
            </Title>
            <Text size="xs" c="dimmed" mb="xs">
              Your values for {name} may also be recorded under these codes.
            </Text>
            {/* role="list": Safari drops the list role from an unstyled list */}
            <Stack gap={4} component="ul" role="list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {otherCodes.map((member) => (
                <Text key={member.code} component="li" size="sm">
                  {member.name} · {member.code}
                </Text>
              ))}
            </Stack>
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
