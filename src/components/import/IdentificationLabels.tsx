/**
 * The checks a value's identification needs, as text labels
 */
import { Badge, Group, Tooltip } from '@mantine/core';
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
      {flags.map((flag) => {
        const label = IDENTIFICATION_LABELS[flag](biomarker);
        return (
          // Wraps rather than cuts the text off; the full text also on hover
          <Tooltip key={flag} label={label} multiline maw={260} openDelay={300}>
            <Badge
              size="xs"
              variant="light"
              color="yellow"
              leftSection={<IconAlertTriangle size={10} />}
              styles={{
                root: { height: 'auto', maxWidth: '100%', paddingBlock: 2 },
                label: { whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip' },
              }}
            >
              {label}
            </Badge>
          </Tooltip>
        );
      })}
    </Group>
  );
}
