import { Group, Text } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import type { TestOptionDetails } from '@services/analysis/testOptions';

/** Most units listed for a test; the rest are left to the unit list in review */
const MAX_UNITS = 3;

interface UnitsTextProps {
  option: TestOptionDetails;
  /** The value's own unit, which the fit is about */
  unit: string;
}

/** A test's units, and whether the value's unit fits, in words as well as by icon */
export function UnitsText({ option, unit }: UnitsTextProps) {
  const units = option.units.slice(0, MAX_UNITS).join(', ') || '—';
  return (
    <>
      <Text span size="sm" display="block">
        {units}
      </Text>
      {option.unitFit === 'fits' && (
        <Group component="span" gap={4} wrap="nowrap" c="teal">
          <IconCheck size={14} aria-hidden="true" />
          <Text span size="xs">
            fits {unit}
          </Text>
        </Group>
      )}
      {option.unitFit === 'misfits' && (
        <Group component="span" gap={4} wrap="nowrap" c="red">
          <IconX size={14} aria-hidden="true" />
          <Text span size="xs">
            {unit} doesn't fit
          </Text>
        </Group>
      )}
    </>
  );
}
