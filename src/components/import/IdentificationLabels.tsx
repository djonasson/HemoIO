/**
 * The checks a value's identification needs, as text labels
 */
import { Badge, Group, Tooltip } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useCatalog } from '@contexts/useCatalog';
import { unitMisfits } from '@services/analysis/reviewedSave';
import type { MatchedBiomarker } from '@services/analysis/LabReportAnalyzer';
import { IDENTIFICATION_LABELS, UNIT_MISFIT_LABEL } from './identificationLabelText';

interface IdentificationLabelsProps {
  biomarker: MatchedBiomarker;
}

/**
 * What a value's identification needs checked, as text; also a unit not of
 * its test's kind, which does not stop the import (the user may know better)
 */
export function IdentificationLabels({ biomarker }: IdentificationLabelsProps) {
  const catalog = useCatalog();
  const labels = (biomarker.identificationFlags ?? []).map((flag) => IDENTIFICATION_LABELS[flag]);
  if (unitMisfits(biomarker, catalog)) labels.push(UNIT_MISFIT_LABEL);
  if (labels.length === 0) return null;
  return (
    <Group gap={4} data-testid="check-labels">
      {labels.map((label) => (
          // Wraps rather than cuts the text off; the full text also on hover
          <Tooltip key={label} label={label} multiline maw={260} openDelay={300}>
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
      ))}
    </Group>
  );
}
