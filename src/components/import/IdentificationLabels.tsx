/**
 * The checks a value's identification needs, as text labels
 */
import { Badge, Group } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { IdentificationFlag, MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';

export const IDENTIFICATION_LABELS: Record<IdentificationFlag, (b: MatchedBiomarker) => string> = {
  'unit-mismatch': () => "Unit doesn't fit",
  'name-disagrees': (b) => `Name suggests ${b.nameSuggests?.name ?? 'another test'}`,
  'name-only': () => 'Matched by name only',
  'similar-name': () => 'Matched by similar name',
  'not-identified': () => 'Not identified',
};

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
