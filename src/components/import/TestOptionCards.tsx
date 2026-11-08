import { Stack, UnstyledButton } from '@mantine/core';
import { NOT_A_LOINC_TEST } from './notLoincTest';
import { TestOptionCard } from './TestOptionCard';
import { TestOptionName } from './TestOptionName';
import { CARD_FRAME, type TestOptionLayoutProps } from './testOptionLayout';

/** The tests on a phone: one card each, its parts as labelled lines */
export function TestOptionCards({ options, current, notLoinc, unit, onChoose }: TestOptionLayoutProps): React.ReactElement {
  return (
    <Stack gap="xs" role="group" aria-label="Tests">
      <UnstyledButton p="sm" style={CARD_FRAME} aria-current={notLoinc ? 'true' : undefined} onClick={() => onChoose(null)}>
        <TestOptionName current={notLoinc} label={NOT_A_LOINC_TEST} />
      </UnstyledButton>
      {options.map((option) => (
        <TestOptionCard
          key={option.code}
          option={option}
          current={current === option.code}
          unit={unit}
          onChoose={onChoose}
        />
      ))}
    </Stack>
  );
}
