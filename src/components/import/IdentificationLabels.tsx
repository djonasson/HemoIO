/**
 * The checks a value's identification needs, as text labels
 */
import { Badge, Group } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';
import { IDENTIFICATION_LABELS } from './identificationLabelText';

interface IdentificationLabelsProps {
  biomarker: MatchedBiomarker;
}

/** What a value's identification needs checked, as text */
export function IdentificationLabels({ biomarker }: IdentificationLabelsProps) {
  const flags = biomarker.identificationFlags ?? [];
  if (flags.length === 0) return null;
  return (
    <Group gap={4}>
      {flags.map((flag) => (
        <Badge
          key={flag}
          size="xs"
          variant="light"
          color="yellow"
          leftSection={<IconAlertTriangle size={10} />}
        >
          {IDENTIFICATION_LABELS[flag](biomarker)}
        </Badge>
      ))}
    </Group>
  );
}
