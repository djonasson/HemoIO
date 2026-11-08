import { useId } from 'react';
import { Box, Text, UnstyledButton } from '@mantine/core';
import { TestNotes } from './TestNotes';
import { TestOptionName } from './TestOptionName';
import { UnitsText } from './UnitsText';
import { accessibleName, CARD_FRAME } from './testOptionLayout';
import type { TestOptionDetails } from '@services/analysis/testOptions';

interface TestOptionCardProps {
  option: TestOptionDetails;
  current: boolean;
  /** The value's own unit */
  unit: string;
  onChoose: (code: string) => void;
}

/**
 * One test on a phone, the whole card a button. Its details describe the
 * button, so a screen reader announces them (whether the unit fits, why it
 * is offered) after its name.
 */
export function TestOptionCard({ option, current, unit, onChoose }: TestOptionCardProps): React.ReactElement {
  const detailsId = useId();
  return (
    <UnstyledButton
      p="sm"
      style={CARD_FRAME}
      aria-current={current ? 'true' : undefined}
      aria-label={accessibleName(option)}
      aria-describedby={detailsId}
      onClick={() => onChoose(option.code)}
    >
      <TestOptionName current={current} option={option} />
      {/* Spans only: a button holds phrasing content */}
      <Box component="span" display="block" mt={4} pl={20} id={detailsId}>
        <Text span size="xs" display="block">
          Sample: {option.sample}
        </Text>
        <Text span size="xs" display="block">
          Method: {option.method || '—'}
        </Text>
        <Text span size="xs" display="block">
          Units:
        </Text>
        <UnitsText option={option} unit={unit} />
        <Text span size="xs" display="block">
          Code: {option.code}
        </Text>
        <TestNotes option={option} />
      </Box>
    </UnstyledButton>
  );
}
